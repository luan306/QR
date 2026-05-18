import express from "express";
import { query } from "../config/database.js";

const router = express.Router();

/* GET /api/departments */
router.get("/", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM departments ORDER BY name");
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* POST /api/departments */
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });

    const dup = await query("SELECT id FROM departments WHERE LOWER(name) = LOWER(?) LIMIT 1", [name.trim()]);
    if (dup.length) return res.status(409).json({ success: false, message: `Bộ phận "${name.trim()}" đã tồn tại` });

    const result = await query("INSERT INTO departments (name) VALUES (?)", [name.trim()]);
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* PUT /api/departments/:id */
router.put("/:id", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });

    const dup = await query("SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1", [name.trim(), req.params.id]);
    if (dup.length) return res.status(409).json({ success: false, message: `Bộ phận "${name.trim()}" đã tồn tại` });

    await query("UPDATE departments SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* DELETE /api/departments/:id — cascade xóa toàn bộ cấu trúc bên trong */
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Lấy sections của dept
    const secs = await query("SELECT id FROM sections WHERE department_id = ?", [id]);
    for (const s of secs) {
      // Lấy groups của section
      const grps = await query("SELECT id FROM `groups` WHERE section_id = ?", [s.id]);
      for (const g of grps) {
        await query("DELETE FROM cost_centers WHERE group_id = ?", [g.id]);
      }
      await query("DELETE FROM `groups`      WHERE section_id = ?", [s.id]);
      await query("DELETE FROM cost_centers  WHERE section_id = ?", [s.id]);
    }
    await query("DELETE FROM sections     WHERE department_id = ?", [id]);
    await query("DELETE FROM cost_centers WHERE department_id = ?", [id]);
    await query("DELETE FROM departments  WHERE id = ?",            [id]);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/departments/:id/sections */
router.get("/:id/sections", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM sections WHERE department_id = ? ORDER BY name", [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* POST /api/departments/:id/sections */
router.post("/:id/sections", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });

    const dup = await query(
      "SELECT id FROM sections WHERE department_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
      [req.params.id, name.trim()]
    );
    if (dup.length) return res.status(409).json({ success: false, message: `Section "${name.trim()}" đã tồn tại` });

    const result = await query(
      "INSERT INTO sections (name, department_id) VALUES (?, ?)",
      [name.trim(), req.params.id]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/departments/:id/cost-centers */
router.get("/:id/cost-centers", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM cost_centers WHERE department_id = ? ORDER BY name", [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/departments/all-hierarchy
   Trả toàn bộ sections, groups, cost_centers trong 1 request
   Thay vì N+M+K request riêng lẻ */
router.get("/all-hierarchy", async (req, res) => {
  try {
    const [departments, sections, groups, costs] = await Promise.all([
      query("SELECT * FROM departments ORDER BY name"),
      query("SELECT * FROM sections ORDER BY name"),
      query("SELECT * FROM `groups` ORDER BY name"),
      query("SELECT * FROM cost_centers ORDER BY name"),
    ]);
    res.json({ departments, sections, groups, costs });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

export default router;