import express from "express";
import { query, transaction, withConnection } from "../config/database.js";

const router = express.Router();

/* ============================================================
   HELPER — Kiểm tra đợt kiểm kê đang active
   ============================================================ */
async function getActiveRound() {
  const [active] = await query(
    `SELECT id, name FROM inventory_rounds
     WHERE status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`
  );
  if (active) return { round: active, status: "active" };

  const [latest] = await query(
    `SELECT status FROM inventory_rounds
     ORDER BY created_at DESC
     LIMIT 1`
  );
  if (!latest)                         return { round: null, status: "no_round" };
  if (latest.status === "completed")   return { round: null, status: "completed" };
  return { round: null, status: "not_started" };
}

/* ============================================================
   HELPER — Đánh dấu audited trong round_items
   ============================================================ */
async function markRoundItem(roundId, deviceId, userId, scanInfo = {}) {
  try {
    const {
      scanned_dept_id          = null,
      scanned_dept_name        = null,
      scanned_location         = null,
      scanned_section_name     = null,
      scanned_group_name       = null,
      scanned_cost_center_name = null,
      scanned_by_name          = null,
      is_mismatch              = 0,
    } = scanInfo;

    await query(
      `UPDATE inventory_round_items
       SET
         audited                  = 1,
         audited_at               = NOW(),
         audited_by               = ?,
         audited_by_name          = (SELECT full_name FROM users WHERE id = ? LIMIT 1),
         scanned_by_name          = ?,
         scanned_dept_id          = ?,
         scanned_dept_name        = ?,
         scanned_location         = ?,
         scanned_section_name     = ?,
         scanned_group_name       = ?,
         scanned_cost_center_name = ?,
         is_mismatch              = ?
       WHERE round_id = ?
         AND device_id = ?
         AND audited = 0`,
      [
        userId, userId, scanned_by_name, scanned_dept_id, scanned_dept_name,
        scanned_location, scanned_section_name, scanned_group_name,
        scanned_cost_center_name, is_mismatch ? 1 : 0, roundId, deviceId,
      ]
    );
  } catch (e) {
    console.error("markRoundItem error:", e.message);
  }
}

/* ============================================================
   GET /api/scans
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || 200), 500);
    const offset = parseInt(req.query.offset || 0);

    const rows = await query(`
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
      LIMIT ${limit} OFFSET ${offset}
    `);
    return res.json(rows);
  } catch (err) {
    console.error("GET SCANS ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   DELETE /api/scans
   ============================================================ */
router.delete("/", async (req, res) => {
  try {
    await query(`DELETE FROM scans`);
    return res.json({ success: true, message: "Đã xóa toàn bộ lịch sử quét" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ============================================================
   GET /api/scans/export
   ============================================================ */
router.get("/export", async (req, res) => {
  try {
    const rows = await query(`
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
      LIMIT 5000
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   GET /api/scan/user-scans/:dept_id
   ============================================================ */
router.get("/user-scans/:dept_id", async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        s.id,
        d.qr_code,
        d.name      AS device_name,
        d.id        AS device_id,
        u.full_name AS scanned_by,
        s.scanned_at
      FROM scans s
      JOIN devices d ON d.id = s.device_id
      JOIN users   u ON u.id = s.user_id
      WHERE s.session_id IS NULL
        AND d.department_id = ?
      ORDER BY s.scanned_at DESC
      LIMIT 500
    `, [req.params.dept_id]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   GET /api/scan/session/:session_id
   ============================================================ */
router.get("/session/:session_id", async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        s.id,
        d.qr_code,
        d.name       AS device_name,
        d.id         AS device_id,
        u.full_name  AS scanned_by,
        s.scanned_at
      FROM scans s
      JOIN devices d ON d.id = s.device_id
      JOIN users   u ON u.id = s.user_id
      WHERE s.session_id = ?
      ORDER BY s.scanned_at DESC
    `, [req.params.session_id]);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   POST /api/scan  — quét thiết bị
   ============================================================ */
router.post("/", async (req, res) => {
  try {
    const { qr_code, session_id } = req.body;
    const user_id = req.session?.user?.id;

    if (!user_id || !qr_code) {
      return res.json({ success: false, message: "Thiếu dữ liệu hoặc chưa đăng nhập" });
    }

    const serial = (qr_code.includes("$") ? qr_code.split("$")[0] : qr_code).trim();

    // ── 0. Kiểm tra đợt kiểm kê ──────────────────────────────────
    const { round, status: roundStatus } = await getActiveRound();

    if (roundStatus !== "active") {
      const msgMap = {
        no_round:    "Chưa có đợt kiểm kê nào",
        not_started: "Đợt kiểm kê chưa bắt đầu",
        completed:   "Đợt kiểm kê đã kết thúc",
      };
      return res.json({
        success: false,
        [`round_${roundStatus}`]: true,
        message: msgMap[roundStatus],
      });
    }

    // ── 1. Tìm thiết bị ──────────────────────────────────────────
    let [device] = await query(
      `SELECT
         d.id, d.name, d.qr_code, d.department_id, d.is_new,
         d.location,
         dt.name   AS device_type_name,
         dep.name  AS department_name,
         sec.name  AS section_name,
         gr.name   AS group_name,
         cc.name   AS cost_center_name
       FROM devices d
       LEFT JOIN device_types  dt  ON dt.id  = d.device_type_id
       LEFT JOIN departments   dep ON dep.id = d.department_id
       LEFT JOIN sections      sec ON sec.id = d.section_id
       LEFT JOIN \`groups\`    gr  ON gr.id  = d.group_id
       LEFT JOIN cost_centers  cc  ON cc.id  = d.cost_center_id
       WHERE d.qr_code = ?
       LIMIT 1`,
      [serial]
    );

    // ── 1b. Fallback: tìm trong inventory_round_items của đợt active ──
    let roundItemOnly = false;
    if (!device) {
      const [ri] = await query(
        `SELECT
           ri.id            AS item_id,
           ri.device_id,
           ri.qr_code,
           ri.device_name   AS name,
           ri.department_id,
           ri.department_name,
           ri.location,
           ri.section_name,
           ri.group_name,
           ri.cost_center_name,
           ri.audited
         FROM inventory_round_items ri
         WHERE ri.round_id = ? AND ri.qr_code = ?
         LIMIT 1`,
        [round.id, serial]
      );

      if (!ri) {
        return res.json({ success: false, device_not_found: true, message: "Không tìm thấy thiết bị" });
      }

      if (ri.audited) {
        return res.json({
          success:           false,
          already:           true,
          device_name:       ri.name,
          device_department: ri.department_name || "-",
          scan_department:   ri.department_name || "-",
          message:           "⚠️ Thiết bị đã quét rồi",
        });
      }

      device = {
        id:               ri.device_id || null,
        _item_id:         ri.item_id,
        name:             ri.name,
        qr_code:          ri.qr_code,
        department_id:    ri.department_id,
        department_name:  ri.department_name,
        location:         ri.location,
        section_name:     ri.section_name,
        group_name:       ri.group_name,
        cost_center_name: ri.cost_center_name,
        is_new:           false,
      };
      roundItemOnly = true;
    }

    // ── 2. Tìm user ──────────────────────────────────────────────
    const [user] = await query(
      `SELECT u.id, u.full_name, u.department_id,
              dep.name AS dept_name
       FROM users u
       LEFT JOIN departments dep ON dep.id = u.department_id
       WHERE u.id = ?
       LIMIT 1`,
      [user_id]
    );
    if (!user) return res.json({ success: false, message: "Không tìm thấy user" });

    // ── 3. Xác định bộ phận quét ─────────────────────────────────
    let scanDeptId   = user.department_id;
    let scanDeptName = user.dept_name || "-";

    if (session_id) {
      const [sess] = await query(
        `SELECT as2.department_id, dep.name AS dept_name
         FROM audit_sessions as2
         LEFT JOIN departments dep ON dep.id = as2.department_id
         WHERE as2.id = ?
         LIMIT 1`,
        [session_id]
      );
      if (sess) { scanDeptId = sess.department_id; scanDeptName = sess.dept_name || "-"; }
    }

    const deviceDeptName = device.department_name || "-";
    const isMismatch     = String(device.department_id) !== String(scanDeptId);
    const statusText     = isMismatch
      ? `Chuyển từ ${deviceDeptName} → ${scanDeptName}`
      : `Đang ở ${scanDeptName}`;

    const scanInfo = {
      scanned_dept_id:          scanDeptId,
      scanned_dept_name:        scanDeptName,
      scanned_location:         device.location       || null,
      scanned_section_name:     device.section_name   || null,
      scanned_group_name:       device.group_name     || null,
      scanned_cost_center_name: device.cost_center_name || null,
      scanned_by_name:          user.full_name,
      is_mismatch:              isMismatch,
    };

    // ── 4. THIẾT BỊ CHỈ CÓ TRONG ROUND_ITEMS ────────────────────
    if (roundItemOnly) {
      await query(
        `UPDATE inventory_round_items
         SET
           audited                  = 1,
           audited_at               = NOW(),
           audited_by_name          = ?,
           scanned_by_name          = ?,
           scanned_dept_id          = ?,
           scanned_dept_name        = ?,
           scanned_location         = ?,
           scanned_section_name     = ?,
           scanned_group_name       = ?,
           scanned_cost_center_name = ?,
           is_mismatch              = ?
         WHERE id = ?`,
        [
          user.full_name, user.full_name, scanDeptId, scanDeptName,
          device.location || null, device.section_name || null,
          device.group_name || null, device.cost_center_name || null,
          isMismatch ? 1 : 0, device._item_id,
        ]
      );

      const io = req.app.get('io');
      if (io) io.emit('scan_recorded', { round_id: round.id, device_id: device.id, qr_code: serial, scanned_by_name: user.full_name, scanned_dept_id: scanDeptId, scanned_dept_name: scanDeptName, is_mismatch: isMismatch, audited_at: new Date().toISOString() });

      return res.json({ success: true, already: false, device_name: device.name, device_department: deviceDeptName, scan_department: scanDeptName, status: statusText, round_name: round.name, message: `✅ Quét: ${device.name}` });
    }

    // ── 4a. CHẾ ĐỘ AUDIT ─────────────────────────────────────────
    if (session_id) {
      if (isMismatch) {
        return res.json({ success: false, not_in_list: true, message: "❌ Thiết bị không thuộc bộ phận đang audit", device_name: device.name, device_department: deviceDeptName, scan_department: scanDeptName });
      }

      const [dupScan] = await query(
        `SELECT id FROM scans WHERE device_id = ? AND session_id = ? LIMIT 1`,
        [device.id, session_id]
      );
      if (dupScan) {
        return res.json({ success: false, message: "⚠️ Thiết bị này đã quét trong phiên audit này rồi", device_name: device.name, is_duplicate: true });
      }

      await transaction(async (conn) => {
        await conn.execute(`INSERT INTO scans (device_id, user_id, session_id, scan_department) VALUES (?, ?, ?, ?)`, [device.id, user_id, session_id, scanDeptId]);
        if (device.is_new) await conn.execute(`UPDATE devices SET is_new = 0 WHERE id = ?`, [device.id]);
      });

      markRoundItem(round.id, device.id, user_id, scanInfo);

      const io = req.app.get('io');
      if (io) io.emit('scan_recorded', { round_id: round.id, device_id: device.id, qr_code: serial, scanned_by_name: user.full_name, scanned_dept_id: scanDeptId, scanned_dept_name: scanDeptName, is_mismatch: isMismatch, audited_at: new Date().toISOString() });

      return res.json({ success: true, device_name: device.name, device_department: deviceDeptName, scan_department: scanDeptName, status: statusText, round_name: round.name, message: `✅ Quét: ${device.name}` });
    }

    // ── 4b. CHẾ ĐỘ QUÉT THƯỜNG ───────────────────────────────────
    // ✅ FIX: check audited trong round HIỆN TẠI thay vì check scans chung
    // Đợt cũ đã quét không ảnh hưởng đợt mới
    const [roundItem] = await query(
      `SELECT id, audited FROM inventory_round_items
       WHERE round_id = ? AND device_id = ?
       LIMIT 1`,
      [round.id, device.id]
    );

    if (roundItem?.audited) {
      // Thiết bị đã quét trong đợt NÀY
      return res.json({
        success:           false,
        already:           true,
        device_name:       device.name,
        device_department: deviceDeptName,
        scan_department:   scanDeptName,
        message:           "⚠️ Thiết bị đã quét trong đợt kiểm kê này rồi",
      });
    }

    // Chưa quét trong đợt này → insert scan + đánh dấu round_item
    await transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO scans (device_id, user_id, scan_department) VALUES (?, ?, ?)`,
        [device.id, user_id, scanDeptId]
      );
      if (device.is_new) {
        await conn.execute(`UPDATE devices SET is_new = 0 WHERE id = ?`, [device.id]);
      }
    });

    markRoundItem(round.id, device.id, user_id, scanInfo);

    const io = req.app.get('io');
    if (io) io.emit('scan_recorded', { round_id: round.id, device_id: device.id, qr_code: serial, scanned_by_name: user.full_name, scanned_dept_id: scanDeptId, scanned_dept_name: scanDeptName, is_mismatch: isMismatch, audited_at: new Date().toISOString() });

    return res.json({ success: true, already: false, device_name: device.name, device_department: deviceDeptName, scan_department: scanDeptName, status: statusText, round_name: round.name, message: `✅ Quét: ${device.name}` });

  } catch (err) {
    console.error("SCAN ERROR:", err.message);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

/* ============================================================
   POST /api/scan/start-audit
   ============================================================ */
router.post("/start-audit", async (req, res) => {
  try {
    const { user_id, department_id, force_new } = req.body;
    if (!user_id || !department_id) return res.json({ success: false, message: "Thiếu user_id hoặc department_id" });

    return await withConnection(async (conn) => {
      const [[active]] = await conn.execute(
        `SELECT a.id, a.user_id, a.started_at, u.full_name, u.id AS auditor_id
         FROM audit_sessions a
         JOIN users u ON u.id = a.user_id
         WHERE a.department_id = ? AND a.ended_at IS NULL
         ORDER BY a.started_at DESC
         LIMIT 1`,
        [department_id]
      );

      if (active && !force_new) {
        const [[scannedData]] = await conn.execute(`SELECT COUNT(*) AS count FROM scans WHERE session_id = ?`, [active.id]);
        return res.json({ has_existing: true, success: false, session_id: active.id, scanned_count: scannedData?.count || 0, started_at: active.started_at, auditor_name: active.full_name, auditor_id: active.auditor_id, message: `${active.full_name} đang audit bộ phận này` });
      }

      const [result] = await conn.execute(`INSERT INTO audit_sessions (user_id, department_id) VALUES (?, ?)`, [user_id, department_id]);
      return res.json({ has_existing: false, success: true, session_id: result.insertId, message: "Phiên audit mới tạo" });
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ============================================================
   POST /api/scan/stop-audit
   ============================================================ */
router.post("/stop-audit", async (req, res) => {
  try {
    await query(`UPDATE audit_sessions SET ended_at = NOW() WHERE id = ?`, [req.body.session_id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ============================================================
   GET /api/scan/audit-sessions
   ============================================================ */
router.get("/audit-sessions", async (req, res) => {
  try {
    const { from, to, dept } = req.query;
    const params = [];
    let where = "WHERE 1=1";
    if (from) { where += " AND DATE(a.started_at) >= ?"; params.push(from); }
    if (to)   { where += " AND DATE(a.started_at) <= ?"; params.push(to); }
    if (dept) { where += " AND a.department_id = ?";     params.push(dept); }

    const rows = await query(`
      SELECT
        a.id, u.full_name AS auditor_name, d.name AS dept_name,
        a.started_at, a.ended_at,
        COUNT(s.id) AS total_scanned,
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
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   GET /api/scan/audit-compare/:session_id
   ============================================================ */
router.get("/audit-compare/:session_id", async (req, res) => {
  try {
    const { session_id } = req.params;
    const [sess] = await query(`SELECT department_id FROM audit_sessions WHERE id = ?`, [session_id]);
    if (!sess) return res.status(404).json({ error: "Session không tồn tại" });

    const rows = await query(`
      SELECT
        d.id AS device_id, d.name AS device_name, d.qr_code, d.location,
        s.device_id IS NOT NULL AS audited,
        u.full_name AS scanned_by, s.scanned_at
      FROM devices d
      LEFT JOIN scans s ON s.device_id = d.id AND s.session_id = ?
      LEFT JOIN users u ON u.id = s.user_id
      WHERE d.department_id = ? AND d.is_new = 0
      ORDER BY audited ASC
    `, [session_id, sess.department_id]);

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   GET /api/scan/audit-summary/:session_id
   ============================================================ */
router.get("/audit-summary/:session_id", async (req, res) => {
  try {
    const [row] = await query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN d.department_id = s.scan_department THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN d.department_id != s.scan_department THEN 1 ELSE 0 END) AS wrong
      FROM scans s
      JOIN devices d ON d.id = s.device_id
      WHERE s.session_id = ?
    `, [req.params.session_id]);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   DELETE /api/scan/audit-session/:id
   ============================================================ */
router.delete("/audit-session/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await transaction(async (conn) => {
      await conn.execute(`UPDATE scans SET session_id = NULL WHERE session_id = ?`, [id]);
      await conn.execute(`DELETE FROM audit_sessions WHERE id = ?`, [id]);
    });
    return res.json({ success: true, message: "Đã xóa phiên audit" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/* ============================================================
   POST /api/scan/force-stop/:id
   ============================================================ */
router.post("/force-stop/:id", async (req, res) => {
  try {
    await query(`UPDATE audit_sessions SET ended_at = NOW() WHERE id = ? AND ended_at IS NULL`, [req.params.id]);
    return res.json({ success: true, message: "Đã dừng phiên audit" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;