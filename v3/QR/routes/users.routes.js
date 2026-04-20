import express from "express";
import { getConnection } from "../config/database.js";
import { checkAdmin } from "../middleware/admin.js";

const router = express.Router();

/* GET /api/users */
router.get("/", checkAdmin, async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT u.*, d.name AS department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
    `);
    await conn.end();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

/* POST /api/users — tạo user mới */
router.post("/", checkAdmin, async (req, res) => {
  try {
    const { username, password, full_name, department_id, role } = req.body;

    if (!username || !password) {
      return res.json({ success: false, message: "Thiếu username hoặc password" });
    }

    const conn = await getConnection();

    const [exist] = await conn.execute(
      "SELECT id FROM users WHERE username = ?", [username]
    );
    if (exist.length > 0) {
      await conn.end();
      return res.json({ success: false, message: "Username đã tồn tại" });
    }

    await conn.execute(
      `INSERT INTO users (username, password, full_name, department_id, role)
       VALUES (?, ?, ?, ?, ?)`,
      [username, password, full_name || "", department_id || null, role || "user"]
    );

    await conn.end();
    res.json({ success: true, message: "Tạo user thành công" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

/* PUT /api/users/:id */
router.put("/:id", checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, department_id, role, password } = req.body;

    const conn = await getConnection();

    let query  = "UPDATE users SET full_name=?, department_id=?, role=?";
    let params = [full_name, department_id, role];

    if (password && password.trim() !== "") {
      query += ", password=?";
      params.push(password);
    }

    query += " WHERE id=?";
    params.push(id);

    const [result] = await conn.execute(query, params);
    await conn.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User không tồn tại" });
    }
    res.json({ success: true, message: "Cập nhật user thành công" });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* DELETE /api/users/:id */
router.delete("/:id", checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const conn   = await getConnection();
    const [result] = await conn.execute("DELETE FROM users WHERE id=?", [id]);
    await conn.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User không tồn tại" });
    }
    res.json({ success: true, message: "Đã xóa tài khoản" });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;