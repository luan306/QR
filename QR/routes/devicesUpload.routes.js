import express from "express";
import multer  from "multer";
import XLSX    from "xlsx";
import fs      from "fs";
import { getConnection } from "../config/database.js";
import { checkAdmin }    from "../middleware/admin.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const normalize = (str) =>
  String(str || "")
    .normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "")
    .normalize("NFD") .replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLowerCase();

const getVal = (row, keys) => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return String(v).trim();
  }
  return "";
};

router.post(
  "/devices/upload",
  checkAdmin,
  upload.single("file"),
  async (req, res) => {
    const conn = await getConnection();
    try {

      /* ── 1. READ ROWS ── */
      let rows = [];
      if (req.body.mappedData) {
        rows = JSON.parse(req.body.mappedData);
      } else {
        const wb    = XLSX.readFile(req.file.path);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows        = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      }

      /* ── 2. LOAD CACHE ── */
      const [deptRows] = await conn.execute("SELECT id, name FROM departments");
      const [secRows]  = await conn.execute("SELECT id, name, department_id FROM sections");
      const [grpRows]  = await conn.execute("SELECT id, name, section_id FROM `groups`");
      const [ccRows]   = await conn.execute("SELECT id, name, group_id FROM cost_centers");
      const [dtRows]   = await conn.execute("SELECT id, name FROM device_types");

      const cache = { depts: deptRows, sections: secRows, groups: grpRows, ccs: ccRows, deviceTypes: dtRows };

      /* ── FIND OR CREATE (không dùng ON DUPLICATE KEY) ── */
      const findOrCreate = async (table, arr, name, parentCol, parentId) => {
        const trimmed = (name || "").trim();
        if (!trimmed) return null;
        const norm  = normalize(trimmed);

        // Tìm trong cache
        const found = arr.find(r =>
          normalize(r.name) === norm &&
          (!parentCol || r[parentCol] == parentId)
        );
        if (found) return found.id;

        // SELECT từ DB (phòng race condition nếu nhiều request cùng lúc)
        let checkSql, checkParams;
        if (parentCol && parentId != null) {
          checkSql    = "SELECT id FROM `" + table + "` WHERE name=? AND " + parentCol + "=? LIMIT 1";
          checkParams = [trimmed, parentId];
        } else {
          checkSql    = "SELECT id FROM `" + table + "` WHERE name=? LIMIT 1";
          checkParams = [trimmed];
        }
        const [existing] = await conn.execute(checkSql, checkParams);
        if (existing.length > 0) {
          const row = { id: existing[0].id, name: trimmed };
          if (parentCol) row[parentCol] = parentId;
          arr.push(row);
          return existing[0].id;
        }

        // INSERT mới
        let insertSql, insertParams;
        if (parentCol && parentId != null) {
          insertSql    = "INSERT INTO `" + table + "` (name, " + parentCol + ") VALUES (?, ?)";
          insertParams = [trimmed, parentId];
        } else {
          insertSql    = "INSERT INTO `" + table + "` (name) VALUES (?)";
          insertParams = [trimmed];
        }
        const [result] = await conn.execute(insertSql, insertParams);
        const newId    = result.insertId;
        const newRow   = { id: newId, name: trimmed };
        if (parentCol) newRow[parentCol] = parentId;
        arr.push(newRow);
        return newId;
      };

      /* ── 3. PROCESS ROWS (từng row, không bulk để dễ debug) ── */
      await conn.beginTransaction();
      let added = 0, updated = 0, errors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const name       = getVal(row, ["name",        "Name"]);
        const qr_code    = getVal(row, ["qr_code",     "QR_Code"]);
        const deptName   = getVal(row, ["department",  "Department"]);
        const secName    = getVal(row, ["section",     "Section"]);
        const grpName    = getVal(row, ["group",       "Group"]);
        const ccName     = getVal(row, ["costCenter",  "CostCenter", "cost_center", "Cost Center"]);
        const dtName     = getVal(row, ["deviceType",  "DeviceType", "device_type", "Device Type", "Loại thiết bị"]);
        const location   = getVal(row, ["location",    "Location"]);

        if (!name || !qr_code) continue;

        try {
          // Tạo section/group/cost_center nếu chưa có
          const department_id  = await findOrCreate("departments",  cache.depts,       deptName, null,            null);
          const section_id     = await findOrCreate("sections",     cache.sections,    secName,  "department_id", department_id);
          const group_id       = await findOrCreate("groups",       cache.groups,      grpName,  "section_id",    section_id);
          const cost_center_id = await findOrCreate("cost_centers", cache.ccs,         ccName,   "group_id",      group_id);
          const device_type_id = await findOrCreate("device_types", cache.deviceTypes, dtName,   null,            null);

          // Kiểm tra device đã tồn tại chưa
          const [exist] = await conn.execute(
            "SELECT id FROM devices WHERE qr_code=? LIMIT 1", [qr_code]
          );

          if (exist.length > 0) {
            // UPDATE — giữ is_new, chỉ cập nhật các trường mới
            await conn.execute(`
              UPDATE devices
              SET name=?, device_type_id=?, department_id=?, section_id=?, group_id=?, cost_center_id=?, location=?
              WHERE qr_code=?
            `, [name, device_type_id, department_id, section_id, group_id, cost_center_id, location || null, qr_code]);
            updated++;
          } else {
            await conn.execute(`
              INSERT INTO devices (name, qr_code, device_type_id, department_id, section_id, group_id, cost_center_id, location, is_new)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            `, [name, qr_code, device_type_id, department_id, section_id, group_id, cost_center_id, location || null]);
            added++;
          }

        } catch (rowErr) {
          console.error("[ROW " + (i+2) + "]", rowErr.message);
          errors.push({ row: i + 2, qr_code, name, error: rowErr.message });
        }
      }

      await conn.commit();
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      // Kiểm tra cache sau khi xử lý
      const [secCheck] = await conn.execute("SELECT id, name, department_id FROM sections");
      const [grpCheck] = await conn.execute("SELECT id, name, section_id FROM `groups`");
      const [ccCheck]  = await conn.execute("SELECT id, name, group_id FROM cost_centers");

      res.json({
        success: true,
        message: "✅ Thêm mới: " + added + " | Cập nhật: " + updated +
                 (errors.length ? " | Lỗi: " + errors.length : ""),
        added, updated, errors,
        // DEBUG — hiện thẳng trên alert
        db_sections:     secCheck,
        db_groups:       grpCheck,
        db_cost_centers: ccCheck,
        cache_after: {
          sections:     cache.sections,
          groups:       cache.groups,
          cost_centers: cache.ccs,
        }
      });

    } catch (err) {
      await conn.rollback();
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      console.error("[UPLOAD FATAL]", err.message);
      res.status(500).json({ success: false, message: err.message });
    } finally {
      await conn.release();
    }
  }
);

export default router;