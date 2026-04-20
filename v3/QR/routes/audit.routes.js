import express from "express";
import { getConnection } from "../config/database.js";

const router = express.Router();

// ── Middleware: chỉ admin mới vào được ──────────────────────
function requireAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user) return res.redirect("/login");
  if (user.role !== "admin") return res.status(403).send("Không có quyền truy cập");
  next();
}

// ── GET /admin/audit-dashboard ──────────────────────────────
router.get("/audit-dashboard", requireAdmin, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();

    // 1. Tiến độ từng bộ phận
    const [deptProgress] = await conn.execute(`
      SELECT
        d.id,
        d.name                                          AS dept_name,
        COUNT(dev.id)                                   AS total,
        COUNT(s.id)                                     AS scanned,
        COUNT(dev.id) - COUNT(s.id)                     AS not_scanned,
        ROUND(COUNT(s.id) * 100.0 / NULLIF(COUNT(dev.id), 0), 1) AS percent
      FROM departments d
      LEFT JOIN devices dev ON dev.department_id = d.id
      LEFT JOIN scans   s   ON s.device_id = dev.id
      GROUP BY d.id, d.name
      ORDER BY d.name
    `);

    // 2. Lịch sử phiên audit (20 phiên gần nhất)
    const [sessions] = await conn.execute(`
      SELECT
        a.id,
        u.full_name                                     AS auditor_name,
        d.name                                          AS dept_name,
        a.created_at                                    AS started_at,
        a.ended_at,
        COUNT(s.id)                                     AS total_scanned,
        TIMESTAMPDIFF(MINUTE, a.created_at, IFNULL(a.ended_at, NOW())) AS duration_min
      FROM audit_sessions a
      JOIN users       u ON u.id = a.user_id
      JOIN departments d ON d.id = a.department_id
      LEFT JOIN scans  s ON s.session_id = a.id
      GROUP BY a.id, u.full_name, d.name, a.created_at, a.ended_at
      ORDER BY a.created_at DESC
      LIMIT 20
    `);

    // 3. Tổng quan nhanh
    const [[summary]] = await conn.execute(`
      SELECT
        (SELECT COUNT(*) FROM devices)                  AS total_devices,
        (SELECT COUNT(*) FROM scans)                    AS total_scanned,
        (SELECT COUNT(*) FROM audit_sessions)           AS total_sessions,
        (SELECT COUNT(*) FROM audit_sessions WHERE ended_at IS NULL) AS active_sessions
    `);

    res.render("audit-dashboard", {
      deptProgress,
      sessions,
      summary,
      user: req.session.user
    });

  } catch (err) {
    console.error("AUDIT DASHBOARD ERROR:", err);
    res.status(500).send("Lỗi server: " + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

// ── GET /api/audit/progress (JSON cho auto-refresh) ─────────
router.get("/api/audit/progress", requireAdmin, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT
        d.name AS dept_name,
        COUNT(dev.id) AS total,
        COUNT(s.id)   AS scanned,
        ROUND(COUNT(s.id) * 100.0 / NULLIF(COUNT(dev.id), 0), 1) AS percent
      FROM departments d
      LEFT JOIN devices dev ON dev.department_id = d.id
      LEFT JOIN scans   s   ON s.device_id = dev.id
      GROUP BY d.id, d.name
      ORDER BY d.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});


// ── GET /api/scan/audit-sessions (danh sách phiên audit cho admin) ──
router.get("/audit-sessions", requireAdmin, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT
        a.id,
        u.full_name                                       AS auditor_name,
        d.name                                            AS dept_name,
        a.created_at                                      AS started_at,
        a.ended_at,
        COUNT(s.id)                                       AS total_scanned,
        TIMESTAMPDIFF(MINUTE, a.created_at, IFNULL(a.ended_at, NOW())) AS duration_min
      FROM audit_sessions a
      JOIN users       u ON u.id = a.user_id
      JOIN departments d ON d.id = a.department_id
      LEFT JOIN scans  s ON s.session_id = a.id
      GROUP BY a.id, u.full_name, d.name, a.created_at, a.ended_at
      ORDER BY a.created_at DESC
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

export default router;
