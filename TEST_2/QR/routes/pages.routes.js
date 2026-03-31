import express from "express";
import { checkAuth } from "../middleware/auth.js";
import { checkAdmin } from "../middleware/admin.js";
import { getConnection } from "../config/database.js";

const router = express.Router();

// root redirect
router.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  res.redirect(req.session.user.role === "admin" ? "/admin" : "/index");
});

// user page
router.get("/index", checkAuth, (req, res) => {
  res.render("index", { user: req.session.user });
});

// admin page
router.get("/admin", checkAdmin, async (req, res) => {
  try {
    const conn = await getConnection();

    const [stats] = await conn.execute(`
      SELECT 
        COUNT(DISTINCT d.id) AS total_devices,
        COUNT(DISTINCT s.id) AS total_scans,
        COUNT(DISTINCT u.id) AS total_users
      FROM devices d
      LEFT JOIN scans s ON s.device_id = d.id
      LEFT JOIN users u ON u.id = s.user_id
    `);

    const [departments] = await conn.execute(
      "SELECT * FROM departments"
    );

    await conn.end();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

res.render("admin", {
  user: req.session.user,
  stats: stats[0],
  departments,
  apiUrl: `https://${HOST}:${PORT}/api`
});
  } catch (err) {
    console.error(err);
    res.render("admin", {
      user: req.session.user,
      stats: { total_devices: 0, total_scans: 0, total_users: 0 },
      departments: []
    });
  }
});

export default router;