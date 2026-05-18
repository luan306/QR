import express from "express";
import { query, transaction } from "../config/database.js";
import multer from "multer";
import * as XLSX from "xlsx";

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// ======================================================
// GET ALL INVENTORY ROUNDS
// ======================================================
router.get("/inventory-rounds", async (req, res) => {
  try {
    const { year, month, status } = req.query;
    const conditions = [];
    const params     = [];

    if (year && month) {
      conditions.push("(YEAR(r.created_at) = ? AND MONTH(r.created_at) = ? OR r.status = 'active')");
      params.push(parseInt(year), parseInt(month));
    }
    if (status) {
      conditions.push("r.status = ?");
      params.push(status);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const rows = await query(`
      SELECT
        v.*,
        r.end_date,
        (SELECT COUNT(*) FROM inventory_round_items WHERE round_id = r.id) AS item_count,
        (SELECT COUNT(*) FROM inventory_round_items WHERE round_id = r.id AND audited = 1) AS audited_count
      FROM v_round_summary v
      JOIN inventory_rounds r ON r.id = v.id
      ${where}
      ORDER BY
        v.status = 'active' DESC,
        v.created_at DESC
    `, params);

    res.json(rows);

  } catch (e) {
    console.error("GET inventory rounds error:", e);
    res.status(500).json({ message: e.message });
  }
});

// ======================================================
// CREATE INVENTORY ROUND
// ======================================================
router.post("/inventory-rounds", async (req, res) => {

  const { name, description, started_at, end_date } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "Thiếu tên đợt kiểm kê",
    });
  }

  try {
    // Không cho tạo khi đang có round active
    const activeRounds = await query("SELECT id, name FROM inventory_rounds WHERE status = 'active' LIMIT 1");
    if (activeRounds.length > 0) {
      return res.status(400).json({
        message: 'Đang có đợt kiểm kê "' + activeRounds[0].name + '" đang chạy. Hãy kết thúc trước khi tạo mới.',
      });
    }
  } catch(e) {}


  try {

    const roundId = await transaction(async (conn) => {

      // =================================================
      // CREATE ROUND
      // =================================================
      const [roundResult] = await conn.query(
        `
        INSERT INTO inventory_rounds (
          name,
          description,
          status,
          started_at,
          end_date
        )
        VALUES (?, ?, 'draft', ?, ?)
        `,
        [
          name,
          description || null,
          started_at  || null,
          end_date    || null,
        ]
      );

      const newRoundId = roundResult.insertId;

      return newRoundId;

    });

    res.json({
      success: true,
      id: roundId,
    });

  } catch (e) {

    console.error("CREATE inventory round error:", e);

    res.status(500).json({
      message: e.message,
    });
  }
});

// ======================================================
// GET ROUND ITEMS
// ======================================================
router.get("/inventory-rounds/:id/items", async (req, res) => {

  try {

    const rows = await query(
      `
      SELECT

        ri.id,
        ri.round_id,

        ri.device_id,

        ri.qr_code,
        ri.serial_number,
        ri.device_name,

        -- Vị trí hiển thị: nếu đã quét và có scanned_location thì dùng,
        -- ngược lại fallback về location gốc lúc snapshot
        CASE
          WHEN ri.audited = 1 AND ri.scanned_location IS NOT NULL
            THEN ri.scanned_location
          ELSE ri.location
        END AS location,

        ri.department_id,
        -- JOIN live để đồng bộ khi admin đổi tên bộ phận
        COALESCE(dep_live.name, ri.department_name) AS department_name,

        -- Section/Group/CC: nếu đã quét → dùng thông tin nơi quét
        -- Ngược lại JOIN live từ ID để đồng bộ khi admin đổi tên
        CASE WHEN ri.audited = 1 AND ri.scanned_section_name     IS NOT NULL THEN ri.scanned_section_name
             ELSE COALESCE(sec_live.name,  ri.section_name)   END AS section_name,
        CASE WHEN ri.audited = 1 AND ri.scanned_group_name       IS NOT NULL THEN ri.scanned_group_name
             ELSE COALESCE(grp_live.name,  ri.group_name)     END AS group_name,
        CASE WHEN ri.audited = 1 AND ri.scanned_cost_center_name IS NOT NULL THEN ri.scanned_cost_center_name
             ELSE COALESCE(cc_live.name,   ri.cost_center_name) END AS cost_center_name,

        ri.floor,

        ri.audited,
        ri.audited_by,
        ri.audited_by_name,
        ri.scanned_by_name,
        ri.audited_at,

        ri.scanned_dept_id,
        ri.scanned_dept_name,
        ri.scanned_location,
        ri.scanned_section_name,
        ri.scanned_group_name,
        ri.scanned_cost_center_name,

        ri.is_mismatch,

        ri.pic,

        ri.note,

        ri.snapshotted_at,

        COALESCE(d.is_new, 0) AS is_new,

        -- Loại thiết bị: ưu tiên từ round_items (import), fallback sang devices.device_types
        COALESCE(ri.device_type_name, dt.name) AS device_type_name,

        -- Người add thiết bị mới (chỉ dùng khi is_new=1)
        u_add.full_name AS added_by_name,
        dep_add.name    AS added_dept_name

      FROM inventory_round_items ri
      LEFT JOIN devices      d        ON d.id          = ri.device_id
      LEFT JOIN device_types dt       ON dt.id         = d.device_type_id
      LEFT JOIN users        u_add    ON u_add.id      = d.added_by
      LEFT JOIN departments  dep_add  ON dep_add.id    = d.department_id
      -- JOIN live theo ID lưu trong round_items để đồng bộ tên
      LEFT JOIN departments  dep_live ON dep_live.id   = ri.department_id
      LEFT JOIN sections     sec_live ON sec_live.id   = COALESCE(ri.section_id, d.section_id)
      LEFT JOIN \`groups\`    grp_live ON grp_live.id   = COALESCE(ri.group_id, d.group_id)
      LEFT JOIN cost_centers cc_live  ON cc_live.id    = COALESCE(ri.cost_center_id, d.cost_center_id)

      WHERE ri.round_id = ?

      ORDER BY ri.id ASC
      `,
      [req.params.id]
    );

    res.json(rows);

  } catch (e) {

    console.error("GET round items error:", e);

    res.status(500).json({
      message: e.message,
    });
  }
});

// ======================================================
// UPDATE AUDIT STATUS
// ======================================================
router.put(
  "/inventory-rounds/:roundId/items/:itemId/audit",
  async (req, res) => {

    try {

      const {
        audited,
        note,
        audited_by_name,
        scanned_by_name,
        scanned_location,
        scanned_dept_id,
        scanned_dept_name,
        scanned_section_name,
        scanned_group_name,
        scanned_cost_center_name,
        is_mismatch,
      } = req.body;

      await query(
        `
        UPDATE inventory_round_items
        SET
          audited                  = ?,
          audited_at               = ?,
          audited_by_name          = ?,
          scanned_by_name          = ?,
          scanned_location         = ?,
          scanned_dept_id          = ?,
          scanned_dept_name        = ?,
          scanned_section_name     = ?,
          scanned_group_name       = ?,
          scanned_cost_center_name = ?,
          is_mismatch              = ?,
          note                     = ?
        WHERE
          id = ?
          AND round_id = ?
        `,
        [
          audited ? 1 : 0,
          audited ? new Date() : null,
          audited_by_name          || null,
          scanned_by_name          || null,
          scanned_location         || null,
          scanned_dept_id          || null,
          scanned_dept_name        || null,
          scanned_section_name     || null,
          scanned_group_name       || null,
          scanned_cost_center_name || null,
          is_mismatch              ? 1 : 0,
          note                     || null,
          req.params.itemId,
          req.params.roundId,
        ]
      );

      res.json({
        success: true,
      });

    } catch (e) {

      console.error("UPDATE audit error:", e);

      res.status(500).json({
        message: e.message,
      });
    }
  }
);

// ======================================================
// PATCH ROUND — cập nhật status, end_date, started_at
// ======================================================
router.patch("/inventory-rounds/:id", async (req, res) => {
  try {
    const { status, end_date, started_at, closed_at } = req.body;
    const fields = [];
    const vals   = [];

    if (status !== undefined) {
      const dbStatus = status === 'completed' ? 'closed' : status;

      // Chặn khi set active mà đã có round active khác
      if (dbStatus === 'active') {
        const activeOther = await query(
          "SELECT id, name FROM inventory_rounds WHERE status = 'active' AND id != ? LIMIT 1",
          [req.params.id]
        );
        if (activeOther.length > 0) {
          return res.status(400).json({
            message: 'Đang có đợt kiểm kê "' + activeOther[0].name + '" đang chạy. Hãy kết thúc trước.',
          });
        }
      }

      fields.push("status = ?");
      vals.push(dbStatus);

      if (dbStatus === 'closed') {
        // Kết thúc: chỉ set NOW() nếu body không gửi closed_at tường minh
        if (closed_at === undefined) fields.push("closed_at = NOW()");
      }

      if (dbStatus === 'active') {
        // Reopen: luôn reset closed_at = NULL, bất kể body gửi gì
        fields.push("closed_at = NULL");
        fields.push("started_at = COALESCE(started_at, NOW())");
      }
    }

    // end_date
    if (end_date !== undefined) { fields.push("end_date = ?"); vals.push(end_date || null); }

    // started_at explicit — chỉ khi không phải reopen (reopen đã xử lý ở trên)
    if (started_at !== undefined && status !== 'active') {
      fields.push("started_at = ?");
      vals.push(started_at || null);
    }

    // closed_at explicit — chỉ khi patch không kèm status (vd: gia hạn)
    if (closed_at !== undefined && status === undefined) {
      fields.push("closed_at = ?");
      vals.push(closed_at || null);
    }

    if (fields.length === 0)
      return res.status(400).json({ message: "Không có gì để cập nhật" });

    vals.push(req.params.id);
    console.log("[PATCH round] SQL fields:", fields, "vals:", vals);
    await query(`UPDATE inventory_rounds SET ${fields.join(", ")} WHERE id = ?`, vals);
    res.json({ success: true });
  } catch (e) {
    console.error("[PATCH round] Error:", e.message);
    // Nếu lỗi do cột end_date chưa tồn tại → thử lại không có end_date
    if (e.message.includes("Unknown column 'end_date'")) {
      try {
        const safeFields = fields.filter(f => !f.includes('end_date'));
        const safeVals   = safeFields.map((f, i) => {
          const origIdx = fields.indexOf(f);
          return vals[origIdx];
        });
        if (safeFields.length > 0) {
          safeVals.push(req.params.id);
          await query(`UPDATE inventory_rounds SET ${safeFields.join(", ")} WHERE id = ?`, safeVals);
          return res.json({ success: true, warning: "end_date column not found, skipped" });
        }
      } catch (e2) {
        console.error("[PATCH round] Retry error:", e2.message);
      }
    }
    res.status(500).json({ message: e.message });
  }
});

// ======================================================
// DELETE ONE ITEM
// ======================================================
router.delete(
  "/inventory-rounds/:roundId/items/:itemId",
  async (req, res) => {

    try {

      await query(
        `
        DELETE FROM inventory_round_items
        WHERE
          id = ?
          AND round_id = ?
        `,
        [
          req.params.itemId,
          req.params.roundId,
        ]
      );

      res.json({
        success: true,
      });

    } catch (e) {

      console.error("DELETE item error:", e);

      res.status(500).json({
        message: e.message,
      });
    }
  }
);

// ======================================================
// DELETE ROUND
// ======================================================
router.delete("/inventory-rounds/:id", async (req, res) => {

  try {

    await query(
      `
      DELETE FROM inventory_rounds
      WHERE id = ?
      `,
      [req.params.id]
    );

    res.json({
      success: true,
    });

  } catch (e) {

    console.error("DELETE round error:", e);

    res.status(500).json({
      message: e.message,
    });
  }
});

// ======================================================
// IMPORT EXCEL VÀO ROUND ITEMS
// ======================================================
// Đọc file Excel, mỗi row là 1 thiết bị, insert vào inventory_round_items
// Các cột chấp nhận: qr_code (hoặc serial_number), device_name (hoặc name),
//   department_name (hoặc department), section_name, group_name,
//   cost_center_name (hoặc costCenter), location, floor
// Không yêu cầu đúng tên cột cứng — tự detect theo tên gần đúng
// ======================================================
router.post(
  "/inventory-rounds/:id/import",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: "Không có file" });

      const roundId = req.params.id;

      // Kiểm tra round tồn tại
      const [round] = await query(`SELECT id FROM inventory_rounds WHERE id = ?`, [roundId]);
      if (!round) return res.status(404).json({ success: false, message: "Không tìm thấy đợt kiểm kê" });

      // Parse Excel
      const wb    = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws    = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length) return res.status(400).json({ success: false, message: "File Excel rỗng" });

      // Helper: tìm giá trị theo nhiều tên cột có thể
      const get = (row, ...keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find(
            rk => rk.trim().toLowerCase() === k.toLowerCase()
          );
          if (found && row[found] !== "" && row[found] != null) {
            // Nếu là số nguyên (Excel đọc số thành float như 123.0) → bỏ phần thập phân
            const val = row[found];
            if (typeof val === 'number') {
              return Number.isInteger(val) ? String(val) : String(Math.round(val));
            }
            return String(val).trim();
          }
        }
        return null;
      };

      // Log tên cột thực tế của file để debug
      const sampleKeys = rows[0] ? Object.keys(rows[0]) : [];
     

      let inserted = 0;
      let skipped  = 0;
      const skipReasons = { no_qr: 0, duplicate: 0 };

      for (const row of rows) {
        const qr   = get(row, "Số serial", "Serial", "qr_code", "serial_number", "serial", "qr", "mã qr", "mã thiết bị", "QR Code", "QR");
        const name = get(row, "Tên thiết bị", "Name", "device_name", "name", "ten thiet bi");

        if (!qr) { skipped++; skipReasons.no_qr++; continue; } // bắt buộc phải có QR/serial

        const pic         = get(row, "PIC", "pic", "Người phụ trách", "nguoi phu trach");
        const deptName    = get(row, "Bộ phận", "Department", "department_name", "department", "phòng ban");
        const sectionName = get(row, "Section", "section_name", "section");
        const groupName   = get(row, "Group", "group_name", "group");
        const costCenter  = get(row, "Cost Center", "CostCenter", "cost_center_name", "cost_center", "costCenter");
        const deviceType  = get(row, "Loại thiết bị", "DeviceType", "device_type", "device_type_name");
        const location    = get(row, "Vị trí / chuyển", "Location", "location", "vị trí", "vi tri");
        const floor       = get(row, "floor", "tầng") || null;

        // ── Tự động tạo device_type nếu chưa tồn tại ──
        let deviceTypeId = null;
        if (deviceType) {
          const [dt] = await query(`SELECT id FROM device_types WHERE name=? LIMIT 1`, [deviceType.trim()]);
          if (dt) {
            deviceTypeId = dt.id;
          } else {
            const r = await query(`INSERT INTO device_types (name) VALUES (?)`, [deviceType.trim()]);
            deviceTypeId = r.insertId;
          }
        }

        // ── Tự động tạo cây: Department → Section → Group → Cost Center ──
        let deptId    = null;
        let sectionId = null;
        let groupId   = null;
        let costId    = null;

        // Department
        if (deptName) {
          const [dep] = await query(`SELECT id FROM departments WHERE name=? LIMIT 1`, [deptName.trim()]);
          if (dep) {
            deptId = dep.id;
          } else {
            const r = await query(`INSERT INTO departments (name) VALUES (?)`, [deptName.trim()]);
            deptId = r.insertId;
          }
        }

        // Section (cần department)
        if (sectionName && deptId) {
          const [sec] = await query(`SELECT id FROM sections WHERE name=? AND department_id=? LIMIT 1`, [sectionName.trim(), deptId]);
          if (sec) {
            sectionId = sec.id;
          } else {
            const r = await query(`INSERT INTO sections (name, department_id) VALUES (?, ?)`, [sectionName.trim(), deptId]);
            sectionId = r.insertId;
          }
        }

        // Group (cần section)
        if (groupName && sectionId) {
          const [grp] = await query(`SELECT id FROM \`groups\` WHERE name=? AND section_id=? LIMIT 1`, [groupName.trim(), sectionId]);
          if (grp) {
            groupId = grp.id;
          } else {
            const r = await query(`INSERT INTO \`groups\` (name, section_id) VALUES (?, ?)`, [groupName.trim(), sectionId]);
            groupId = r.insertId;
          }
        }

        // Cost Center (gắn vào group nếu có, rồi section, rồi department)
        if (costCenter) {
          const parentCol = groupId   ? 'group_id'      :
                            sectionId ? 'section_id'    :
                            deptId    ? 'department_id' : null;
          const parentId  = groupId || sectionId || deptId;
          if (parentCol) {
            const [cc] = await query(
              `SELECT id FROM cost_centers WHERE name=? AND ${parentCol}=? LIMIT 1`,
              [costCenter.trim(), parentId]
            );
            if (cc) {
              costId = cc.id;
            } else {
              const r = await query(
                `INSERT INTO cost_centers (name, ${parentCol}) VALUES (?, ?)`,
                [costCenter.trim(), parentId]
              );
              costId = r.insertId;
            }
          }
        }

        // Kiểm tra đã có trong đợt chưa (theo qr_code)
        const [existing] = await query(
          `SELECT id FROM inventory_round_items WHERE round_id = ? AND qr_code = ? LIMIT 1`,
          [roundId, qr]
        );
        if (existing) { skipped++; skipReasons.duplicate++; continue; }

        // Tìm device_id trong bảng devices, nếu không có thì tạo mới
        let [dev] = await query(
          `SELECT id FROM devices WHERE qr_code = ? LIMIT 1`,
          [qr]
        );

        if (!dev) {
          const devId = await transaction(async (conn) => {
            const [result] = await conn.query(
              `INSERT INTO devices (name, qr_code, department_id, section_id, group_id, cost_center_id, device_type_id, location, is_new)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [name || qr, qr, deptId || null, sectionId || null, groupId || null, costId || null, deviceTypeId || null, location || null]
            );
            return result.insertId;
          });
          dev = { id: devId };
        }

        const locationStr = location
          ? `${location}${deviceType ? ' | ' + deviceType : ''}`
          : (deviceType || null);

        await query(
`INSERT INTO inventory_round_items
             (round_id, device_id, qr_code, serial_number, device_name,
              location, department_id, department_name,
              section_id, section_name, group_id, group_name,
              cost_center_id, cost_center_name,
              floor, device_type_name, pic, audited)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            roundId,
            dev.id,
            qr,
            qr,
            name || qr,
            locationStr,
            deptId      || null,
            deptName    || null,
            sectionId   || null,
            sectionName || null,
            groupId     || null,
            groupName   || null,
            costId      || null,
            costCenter  || null,
            floor ? parseInt(floor) : null,
            deviceType  || null,
            pic         || null,
          ]
        );
        inserted++;
      }

      
      res.json({
        success: true,
        message: `✅ Import thành công ${inserted} thiết bị${skipped ? `, bỏ qua ${skipped} dòng (${skipReasons.no_qr} thiếu QR, ${skipReasons.duplicate} trùng)` : ""}`,
        inserted,
        skipped,
        skipReasons,
      });

    } catch (e) {
      console.error("IMPORT round items error:", e);
      res.status(500).json({ success: false, message: e.message });
    }
  }
);

export default router;