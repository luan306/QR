import express from "express";
import { query, transaction } from "../config/database.js";
import { checkAdmin } from "../middleware/admin.js";
import { checkAuth }  from "../middleware/auth.js";

const router = express.Router();

/* =================================================
   HELPER — thêm device vào round đang active
   (nếu chưa có trong round đó)
   ================================================= */
async function addToActiveRound(deviceId, info) {
  try {
    // Tìm round active
    const [round] = await query(
      `SELECT id FROM inventory_rounds WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
    );
    if (!round) return;

    // Kiểm tra đã có trong round chưa
    const [existing] = await query(
      `SELECT id FROM inventory_round_items WHERE round_id = ? AND device_id = ? LIMIT 1`,
      [round.id, deviceId]
    );
    if (existing) return;

    // Lấy tên dept/section/group/cost_center
    let deptName = null, sectionName = null, groupName = null, costName = null;
    if (info.department_id) {
      const [dep] = await query(`SELECT name FROM departments WHERE id = ? LIMIT 1`, [info.department_id]);
      deptName = dep?.name || null;
    }
    if (info.section_id) {
      const [sec] = await query(`SELECT name FROM sections WHERE id = ? LIMIT 1`, [info.section_id]);
      sectionName = sec?.name || null;
    }
    if (info.group_id) {
      const [grp] = await query(`SELECT name FROM \`groups\` WHERE id = ? LIMIT 1`, [info.group_id]);
      groupName = grp?.name || null;
    }
    if (info.cost_center_id) {
      const [cc] = await query(`SELECT name FROM cost_centers WHERE id = ? LIMIT 1`, [info.cost_center_id]);
      costName = cc?.name || null;
    }

    await query(
      `INSERT INTO inventory_round_items
         (round_id, device_id, qr_code, serial_number, device_name,
          location, department_id, department_name,
          section_name, group_name, cost_center_name, audited)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        round.id, deviceId,
        info.qr_code, info.qr_code, info.name,
        info.location || null,
        info.department_id || null, deptName,
        sectionName, groupName, costName,
      ]
    );
  } catch (e) {
    // Không block response nếu lỗi
    console.error("addToActiveRound error:", e.message);
  }
}


/* =================================================
   GET /api/devices
   ================================================= */
router.get("/", checkAuth, async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        d.id,
        d.name,
        d.qr_code,
        d.location,
        d.department_id,
        d.section_id,
        d.group_id,
        d.cost_center_id,
        d.is_new,
        d.added_by,
        dep.name  AS department_name,
        dt.name   AS device_type_name,
        sec.name  AS section_name,
        grp.name  AS group_name,
        cc.name   AS cost_center_name,

        CASE
          WHEN d.is_new = 1 THEN 'new'
          WHEN s.id IS NULL THEN 'Chưa quét'
          ELSE 'Đã quét'
        END AS status

      FROM devices d
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN device_types dt  ON dt.id = d.device_type_id
      LEFT JOIN sections    sec  ON sec.id = d.section_id
      LEFT JOIN \`groups\`  grp  ON grp.id = d.group_id
      LEFT JOIN cost_centers cc  ON cc.id  = d.cost_center_id
      LEFT JOIN (
        SELECT device_id, MAX(id) AS id
        FROM scans
        GROUP BY device_id
      ) s1 ON s1.device_id = d.id
      LEFT JOIN scans s ON s.id = s1.id
    `);
    res.json(rows);
  } catch (err) {
    console.error("Devices error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});


/* =================================================
   POST /api/devices — user thêm thiết bị mới
   ================================================= */
router.post("/", checkAuth, async (req, res) => {
  try {
    const {
      qr_code,
      name,
      device_type_id,
      department_id,
      location,
      section_id     = null,
      group_id       = null,
      cost_center_id = null,
    } = req.body;

    const added_by = req.session.user.id;

    if (!qr_code || !name) {
      return res.status(400).json({ success: false, message: "Thiếu qr_code hoặc name" });
    }

    const exist = await query("SELECT id FROM devices WHERE qr_code=?", [qr_code]);

    if (exist.length > 0) {
      await query(`
        UPDATE devices
        SET
          name           = ?,
          device_type_id = ?,
          department_id  = ?,
          section_id     = ?,
          group_id       = ?,
          cost_center_id = ?,
          location       = ?,
          is_new         = 1,
          added_by       = ?
        WHERE qr_code = ?
      `, [name, device_type_id, department_id, section_id, group_id,
          cost_center_id, location || null, added_by, qr_code]);

      // Lấy device id để thêm vào round nếu chưa có
      const [updDev] = await query("SELECT id FROM devices WHERE qr_code = ? LIMIT 1", [qr_code]);
      if (updDev?.id) {
        await addToActiveRound(updDev.id, {
          qr_code, name, location: location || null,
          department_id, section_id, group_id, cost_center_id,
        });
      }

      return res.json({
        success: true,
        message: "🔁 Thiết bị đã tồn tại → cập nhật & chuyển bộ phận"
      });
    }

    await query(`
      INSERT INTO devices
        (qr_code, name, device_type_id, department_id, section_id, group_id, cost_center_id, location, is_new, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [qr_code, name, device_type_id, department_id, section_id,
        group_id, cost_center_id, location || null, added_by]);

    // ── Lấy device vừa tạo để có id ──────────────────────────
    const [newDev] = await query("SELECT id FROM devices WHERE qr_code = ? LIMIT 1", [qr_code]);
    const deviceId = newDev?.id;

    // ── Tự động thêm vào round đang active nếu có ─────────────
    if (deviceId) {
      await addToActiveRound(deviceId, {
        qr_code, name, location: location || null,
        department_id, section_id, group_id, cost_center_id,
      });
    }

    res.json({ success: true, message: "✅ Thêm thiết bị thành công" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server: " + err.message });
  }
});


/* =================================================
   DELETE /api/devices/bulk — xóa nhiều thiết bị (chỉ admin)
   ================================================= */
router.delete("/bulk", checkAdmin, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Danh sách id trống" });
    }

    if (ids.length > 500) {
      return res.status(400).json({ success: false, message: "Tối đa 500 thiết bị mỗi lần xóa" });
    }

    const safeIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
    if (safeIds.length === 0) {
      return res.status(400).json({ success: false, message: "ID không hợp lệ" });
    }

    const placeholders = safeIds.map(() => "?").join(",");

    await transaction(async (conn) => {
      await conn.execute(`DELETE FROM scans   WHERE device_id IN (${placeholders})`, safeIds);
      await conn.execute(`DELETE FROM devices WHERE id        IN (${placeholders})`, safeIds);
    });

    res.json({ success: true, message: `Đã xóa ${safeIds.length} thiết bị` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


/* =================================================
   DELETE /api/devices/:id — xóa 1 thiết bị (chỉ admin)
   ================================================= */
router.delete("/:id", checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await transaction(async (conn) => {
      await conn.execute("DELETE FROM scans   WHERE device_id=?", [id]);
      await conn.execute("DELETE FROM devices WHERE id=?",        [id]);
    });

    res.json({ success: true, message: "Đã xóa thiết bị" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


/* =================================================
   DELETE /api/devices — xóa toàn bộ (chỉ admin)
   ================================================= */
router.delete("/", checkAdmin, async (req, res) => {
  try {
    await transaction(async (conn) => {
      await conn.execute("DELETE FROM scans");
      await conn.execute("DELETE FROM devices");
    });

    res.json({ success: true, message: "Đã xóa toàn bộ thiết bị" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;