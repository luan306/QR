import express from "express";
import { query } from "../config/database.js";

const router = express.Router();

/* GET /api/device-types */
router.get("/", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM device_types ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* POST /api/device-types */
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });

    const dup = await query("SELECT id FROM device_types WHERE LOWER(name) = LOWER(?) LIMIT 1", [name.trim()]);
    if (dup.length) return res.status(409).json({ success: false, message: `"${name.trim()}" đã tồn tại` });

    await query("INSERT INTO device_types(name) VALUES(?)", [name.trim()]);
    res.json({ success: true, message: "Thêm loại thiết bị thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* PUT /api/device-types/:id */
router.put("/:id", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Thiếu tên" });

    const dup = await query("SELECT id FROM device_types WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1", [name.trim(), req.params.id]);
    if (dup.length) return res.status(409).json({ success: false, message: `"${name.trim()}" đã tồn tại` });

    await query("UPDATE device_types SET name=? WHERE id=?", [name.trim(), req.params.id]);
    res.json({ success: true, message: "Cập nhật thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* DELETE /api/device-types/:id */
router.delete("/:id", async (req, res) => {
  try {
    // Set device_type_id = NULL cho thiết bị đang dùng loại này
    await query("UPDATE devices SET device_type_id = NULL WHERE device_type_id = ?", [req.params.id]);
    await query("DELETE FROM device_types WHERE id=?", [req.params.id]);
    res.json({ success: true, message: "Đã xóa loại thiết bị" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;