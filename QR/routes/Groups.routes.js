import express from "express";
import { query } from "../config/database.js";

const router = express.Router();

/* GET /api/groups */
router.get("/", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM `groups` ORDER BY name");
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* POST /api/groups */
router.post("/", async (req, res) => {
  try {
    const { name, section_id, department_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });

    if (section_id) {
      const dup = await query("SELECT id FROM `groups` WHERE section_id = ? AND LOWER(name) = LOWER(?) LIMIT 1", [section_id, name.trim()]);
      if (dup.length) return res.status(409).json({ success: false, message: `Group "${name.trim()}" đã tồn tại` });
    }

    const result = await query(
      "INSERT INTO `groups` (name, section_id, department_id) VALUES (?, ?, ?)",
      [name.trim(), section_id || null, department_id || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* PUT /api/groups/:id */
router.put("/:id", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });
    const result = await query("UPDATE `groups` SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Không tìm thấy group" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* DELETE /api/groups/:id — cascade xóa cost centers bên trong */
router.delete("/:id", async (req, res) => {
  try {
    await query("DELETE FROM cost_centers WHERE group_id = ?", [req.params.id]);
    await query("DELETE FROM `groups` WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/groups/:id/cost-centers */
router.get("/:id/cost-centers", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM cost_centers WHERE group_id = ? ORDER BY name", [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

export default router;