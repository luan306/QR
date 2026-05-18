import express from "express";
import { query } from "../config/database.js";

const router = express.Router();

/* GET /api/sections */
router.get("/", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM sections ORDER BY name");
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* POST /api/sections  (fallback nếu departments routes không có) */
router.post("/", async (req, res) => {
  try {
    const { name, department_id } = req.body;
    if (!name?.trim() || !department_id)
      return res.status(400).json({ success: false, message: "Thiếu tên hoặc department_id" });

    const dup = await query(
      "SELECT id FROM sections WHERE department_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
      [department_id, name.trim()]
    );
    if (dup.length) return res.status(409).json({ success: false, message: `Section "${name.trim()}" đã tồn tại` });

    const result = await query(
      "INSERT INTO sections (name, department_id) VALUES (?, ?)",
      [name.trim(), department_id]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/sections/:id */
router.get("/:id", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM sections WHERE id = ? LIMIT 1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Không tìm thấy" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* PUT /api/sections/:id */
router.put("/:id", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });

    // Lấy department_id của section hiện tại
    const curr = await query("SELECT department_id FROM sections WHERE id = ? LIMIT 1", [req.params.id]);
    if (!curr.length) return res.status(404).json({ success: false, message: "Không tìm thấy section" });

    // Check trùng tên trong cùng department (trừ chính nó)
    const dup = await query(
      "SELECT id FROM sections WHERE department_id = ? AND LOWER(name) = LOWER(?) AND id != ? LIMIT 1",
      [curr[0].department_id, name.trim(), req.params.id]
    );
    if (dup.length) return res.status(409).json({ success: false, message: `Section "${name.trim()}" đã tồn tại` });

    await query("UPDATE sections SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* DELETE /api/sections/:id — cascade xóa groups và cost centers bên trong */
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    // Lấy tất cả groups trong section
    const grps = await query("SELECT id FROM `groups` WHERE section_id = ?", [id]);
    for (const g of grps) {
      await query("DELETE FROM cost_centers WHERE group_id = ?", [g.id]);
    }
    await query("DELETE FROM `groups` WHERE section_id = ?", [id]);
    await query("DELETE FROM cost_centers WHERE section_id = ?", [id]);
    await query("DELETE FROM sections WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/sections/:id/groups */
router.get("/:id/groups", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM `groups` WHERE section_id = ? ORDER BY name", [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/sections/:id/cost-centers */
router.get("/:id/cost-centers", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM cost_centers WHERE section_id = ? ORDER BY name", [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* POST /api/sections/reparent — chuyển cost centers lên cấp cha trước khi xóa section */
/* Dùng path /cost-centers/reparent qua costCenters routes thay vì đây */

export default router;