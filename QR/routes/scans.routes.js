import express from "express";
import { getConnection } from "../config/database.js";

const router = express.Router();

/* ============================================================
   GET /api/scans  — danh sách tất cả scans (dùng cho Reports)
   ============================================================ */
router.get("/", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT
        s.id,
        d.qr_code,
        d.name          AS device_name,
        dep_d.name      AS device_department,
        dep_s.name      AS scan_department,
        u.full_name     AS user_name,
        s.scanned_at,
        CASE
          WHEN d.department_id = s.scan_department THEN 'Đúng bộ phận'
          ELSE CONCAT('Chuyển từ ', dep_d.name, ' → ', dep_s.name)
        END             AS status
      FROM scans s
      JOIN  devices     d     ON d.id    = s.device_id
      JOIN  users       u     ON u.id    = s.user_id
      LEFT JOIN departments dep_d ON dep_d.id = d.department_id
      LEFT JOIN departments dep_s ON dep_s.id = s.scan_department
      ORDER BY s.scanned_at DESC
    `);
    return res.json(rows);
  } catch (err) {
    console.error("GET SCANS ERROR:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   DELETE /api/scans — xóa toàn bộ scans (Reports)
   ============================================================ */
router.delete("/", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(`DELETE FROM scans`);
    return res.json({ success: true, message: "Đã xóa toàn bộ lịch sử quét" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   GET /api/scans/export — xuất Excel danh sách đã quét
   ============================================================ */
router.get("/export", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT
        d.qr_code,
        d.name          AS device_name,
        dep_d.name      AS device_department,
        dep_s.name      AS scan_department,
        u.full_name     AS user_name,
        s.scanned_at
      FROM scans s
      JOIN  devices     d     ON d.id    = s.device_id
      JOIN  users       u     ON u.id    = s.user_id
      LEFT JOIN departments dep_d ON dep_d.id = d.department_id
      LEFT JOIN departments dep_s ON dep_s.id = s.scan_department
      ORDER BY s.scanned_at DESC
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   POST /api/scan
   Quét thiết bị — dùng cho cả scan thường và audit
   Body: { user_id, qr_code, session_id? }
   ============================================================ */
router.post("/", async (req, res) => {
  let conn;
  try {
    const { user_id, qr_code, session_id } = req.body;

    if (!user_id || !qr_code) {
      return res.json({ success: false, message: "Thiếu dữ liệu" });
    }

    conn = await getConnection();

    // Chuẩn hoá QR (Zebra đôi khi thêm $ ở cuối)
    let serial = qr_code.includes("$") ? qr_code.split("$")[0] : qr_code;
    serial = serial.trim();

    console.log("==== SCAN ====", { serial, user_id, session_id });

    // ── Tìm thiết bị ──────────────────────────────────────────
    const [devices] = await conn.execute(
      `SELECT d.*, dt.name AS device_type_name,
              dep.name     AS department_name
       FROM devices d
       LEFT JOIN device_types  dt  ON dt.id  = d.device_type_id
       LEFT JOIN departments   dep ON dep.id = d.department_id
       WHERE d.qr_code = ?`,
      [serial]
    );
    if (!devices.length) {
      return res.json({ success: false, message: "Không tìm thấy thiết bị" });
    }
    const device = devices[0];

    // ── Tìm user ──────────────────────────────────────────────
    const [users] = await conn.execute(
      `SELECT u.*, dep.name AS dept_name
       FROM users u
       LEFT JOIN departments dep ON dep.id = u.department_id
       WHERE u.id = ?`,
      [user_id]
    );
    if (!users.length) {
      return res.json({ success: false, message: "Không tìm thấy user" });
    }
    const user = users[0];

    // ── Xác định bộ phận quét (scan_department) ───────────────
    // Ưu tiên: session → user.department_id
    let scanDeptId = user.department_id;
    if (session_id) {
      const [sessions] = await conn.execute(
        `SELECT department_id FROM audit_sessions WHERE id = ?`,
        [session_id]
      );
      if (sessions.length) scanDeptId = sessions[0].department_id;
    }

    // ── Lấy tên bộ phận ───────────────────────────────────────
    const getDeptName = async (id) => {
      if (!id) return "-";
      const [rows] = await conn.execute(
        `SELECT name FROM departments WHERE id = ?`, [id]
      );
      return rows[0]?.name || "-";
    };

    const deviceDeptName = await getDeptName(device.department_id);
    const scanDeptName   = await getDeptName(scanDeptId);

    if (session_id) {
      // ── CHẾ ĐỘ AUDIT ─────────────────────────────────────────

      // 1. Thiết bị phải thuộc bộ phận đang audit
      if (String(device.department_id) !== String(scanDeptId)) {
        return res.json({
          success:           false,
          not_in_list:       true,
          message:           `❌ Thiết bị không thuộc bộ phận đang audit`,
          device_name:       device.name,
          device_department: deviceDeptName,
          scan_department:   scanDeptName,
          status:            `Thuộc ${deviceDeptName}, không phải ${scanDeptName}`,
        });
      }

      // 2. Chỉ chặn nếu đã quét TRONG CÙNG SESSION này
      const [scannedInSession] = await conn.execute(
        `SELECT id FROM scans WHERE device_id = ? AND session_id = ?`,
        [device.id, session_id]
      );
      if (scannedInSession.length) {
        return res.json({
          success:           false,
          already:           true,
          message:           "Thiết bị đã quét trong phiên audit này",
          device_name:       device.name,
          device_department: deviceDeptName,
          scan_department:   scanDeptName,
          status:            "Đã quét trong phiên này",
        });
      }

    } else {
      // ── QUÉT THƯỜNG ──────────────────────────────────────────
      // Chặn nếu đã quét bất kỳ lần nào
      const [scanned] = await conn.execute(
        `SELECT id FROM scans WHERE device_id = ?`,
        [device.id]
      );
      if (scanned.length) {
        return res.json({
          success:           false,
          already:           true,
          message:           "Thiết bị đã được quét trước đó",
          device_name:       device.name,
          device_department: deviceDeptName,
          scan_department:   scanDeptName,
          status:            "Đã quét trước đó",
        });
      }
    }

    // ── Ghi scan ──────────────────────────────────────────────
    await conn.execute(
      `INSERT INTO scans
         (user_id, device_id, scan_department_id, scan_department, scanned_at, session_id)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [user_id, device.id, scanDeptId, scanDeptId, session_id || null]
    );

    const isCorrectDept = device.department_id === scanDeptId;

    return res.json({
      success:           true,
      device_name:       device.name,
      device_department: deviceDeptName,
      scan_department:   scanDeptName,
      status:            isCorrectDept
                           ? "✅ Đúng bộ phận"
                           : `⚠️ Chuyển từ ${deviceDeptName} → ${scanDeptName}`,
    });

  } catch (err) {
    console.error("SCAN ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   POST /api/scan/start-audit
   Body: { user_id, department_id }
   ============================================================ */
router.post("/start-audit", async (req, res) => {
  let conn;
  try {
    const { user_id, department_id } = req.body;
    if (!user_id || !department_id) {
      return res.json({ success: false, message: "Thiếu user_id hoặc department_id" });
    }

    conn = await getConnection();

    // Nếu đang có session chưa kết thúc → trả về session đó để tiếp tục
    const [active] = await conn.execute(
      `SELECT id FROM audit_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      [user_id]
    );
    if (active.length) {
      await conn.end();
      return res.json({
        success:    false,
        session_id: active[0].id,
        message:    "Tiếp tục phiên audit trước"
      });
    }

    const [result] = await conn.execute(
      `INSERT INTO audit_sessions (user_id, department_id) VALUES (?, ?)`,
      [user_id, department_id]
    );

    return res.json({ success: true, session_id: result.insertId });

  } catch (err) {
    console.error("START-AUDIT ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   POST /api/scan/stop-audit
   Body: { session_id }
   ============================================================ */
router.post("/stop-audit", async (req, res) => {
  let conn;
  try {
    const { session_id } = req.body;
    conn = await getConnection();
    await conn.execute(
      `UPDATE audit_sessions SET ended_at = NOW() WHERE id = ?`,
      [session_id]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("STOP-AUDIT ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   GET /api/scan/audit-sessions?from=&to=&dept=
   Lọc phiên audit theo ngày và bộ phận
   ============================================================ */
router.get("/audit-sessions", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();

    const { from, to, dept } = req.query;
    const params = [];
    let where = "WHERE 1=1";

    if (from) { where += " AND DATE(a.started_at) >= ?"; params.push(from); }
    if (to)   { where += " AND DATE(a.started_at) <= ?"; params.push(to); }
    if (dept) { where += " AND a.department_id = ?";     params.push(dept); }

    const [rows] = await conn.execute(`
      SELECT
        a.id,
        u.full_name                                                    AS auditor_name,
        d.name                                                         AS dept_name,
        a.started_at,
        a.ended_at,
        COUNT(s.id)                                                    AS total_scanned,
        TIMESTAMPDIFF(MINUTE, a.started_at, IFNULL(a.ended_at, NOW())) AS duration_min
      FROM audit_sessions a
      JOIN  users       u ON u.id = a.user_id
      JOIN  departments d ON d.id = a.department_id
      LEFT JOIN scans   s ON s.session_id = a.id
      ${where}
      GROUP BY a.id, u.full_name, d.name, a.started_at, a.ended_at
      ORDER BY a.started_at DESC
      LIMIT 50
    `, params);

    return res.json(rows);
  } catch (err) {
    console.error("AUDIT-SESSIONS ERROR:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   GET /api/scan/audit-compare/:session_id
   So sánh thiết bị đã audit vs chưa audit trong 1 phiên
   ============================================================ */
router.get("/audit-compare/:session_id", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const { session_id } = req.params;

    // Lấy bộ phận của session
    const [[sess]] = await conn.execute(
      `SELECT department_id FROM audit_sessions WHERE id = ?`,
      [session_id]
    );
    if (!sess) return res.status(404).json({ error: "Session không tồn tại" });

    // Tất cả thiết bị của bộ phận
    const [devices] = await conn.execute(`
      SELECT d.id, d.name AS device_name, d.qr_code, d.location
      FROM devices d
      WHERE d.department_id = ?
    `, [sess.department_id]);

    // Thiết bị đã quét trong session này
    const [scans] = await conn.execute(`
      SELECT s.device_id, u.full_name AS scanned_by, s.scanned_at
      FROM scans s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_id = ?
    `, [session_id]);

    const scannedMap = {};
    scans.forEach(s => { scannedMap[s.device_id] = s; });

    const result = devices.map(d => ({
      device_name: d.device_name,
      qr_code:     d.qr_code,
      location:    d.location,
      audited:     !!scannedMap[d.id],
      scanned_by:  scannedMap[d.id]?.scanned_by  || null,
      scanned_at:  scannedMap[d.id]?.scanned_at  || null,
    }));

    // Sắp xếp: chưa audit lên trên
    result.sort((a, b) => a.audited - b.audited);

    return res.json(result);
  } catch (err) {
    console.error("AUDIT-COMPARE ERROR:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

/* ============================================================
   GET /api/scan/audit-summary/:session_id
   Thống kê 1 phiên cụ thể
   ============================================================ */
router.get("/audit-summary/:session_id", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [[row]] = await conn.execute(`
      SELECT
        COUNT(*)                                                        AS total,
        SUM(CASE WHEN d.department_id = s.scan_department THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN d.department_id != s.scan_department THEN 1 ELSE 0 END) AS wrong
      FROM scans s
      JOIN devices d ON d.id = s.device_id
      WHERE s.session_id = ?
    `, [req.params.session_id]);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});


/* ── GET /api/scans/session/:session_id ─────────────────────
   Danh sách thiết bị đã quét trong 1 phiên audit cụ thể
   ──────────────────────────────────────────────────────── */
router.get("/session/:session_id", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT s.id, d.qr_code, d.name AS device_name, d.id AS device_id
      FROM scans s
      JOIN devices d ON d.id = s.device_id
      WHERE s.session_id = ?
    `, [req.params.session_id]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});


/* ============================================================
   DELETE /api/scan/audit-session/:id
   Xóa phiên audit (giữ lịch sử scan, chỉ set session_id = NULL)
   ============================================================ */
router.delete("/audit-session/:id", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const { id } = req.params;

    // Tách scans khỏi session (giữ lịch sử scan, chỉ bỏ liên kết)
    await conn.execute(
      `UPDATE scans SET session_id = NULL WHERE session_id = ?`,
      [id]
    );

    // Xóa phiên audit
    await conn.execute(
      `DELETE FROM audit_sessions WHERE id = ?`,
      [id]
    );

    return res.json({ success: true, message: "Đã xóa phiên audit" });
  } catch (err) {
    console.error("DELETE-AUDIT-SESSION ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.end();
  }
});


/* ============================================================
   POST /api/scan/force-stop/:id
   Admin force-stop phiên audit đang treo (set ended_at = NOW)
   ============================================================ */
router.post("/force-stop/:id", async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `UPDATE audit_sessions SET ended_at = NOW() WHERE id = ? AND ended_at IS NULL`,
      [req.params.id]
    );
    return res.json({ success: true, message: "Đã dừng phiên audit" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

export default router;