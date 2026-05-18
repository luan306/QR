

import bcrypt from "bcrypt";          // npm i bcrypt
import { body, param, validationResult } from "express-validator"; // npm i express-validator
import { pool } from "./database.js";



const SALT_ROUNDS = 12; // cost factor, càng cao càng an toàn nhưng càng chậm

// Hàm hash password — dùng khi TẠO hoặc ĐỔI mật khẩu
export async function hashPassword(plainText) {
  return await bcrypt.hash(plainText, SALT_ROUNDS);
}

// Hàm verify password — dùng khi LOGIN
export async function verifyPassword(plainText, hash) {
  return await bcrypt.compare(plainText, hash);
}

// API Login đã fix — thay vào auth.routes.js
export async function loginHandler(req, res) {
  // Validate input trước (xem #3 bên dưới)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ" });
  }

  try {
    const { username, password } = req.body;

    // Chỉ SELECT theo username, KHÔNG truyền password vào SQL
    const [rows] = await pool.execute(
      "SELECT id, username, full_name, role, department_id, password AS password_hash FROM users WHERE username = ?",
      [username]
    );

    // ⚠️ Luôn trả cùng message dù sai username hay sai password
    // Tránh attacker dò được username hợp lệ qua message khác nhau
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });
    }

    const user = rows[0];
    const passwordMatch = await verifyPassword(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });
    }

    // Regenerate session ID sau khi login thành công
    // Ngăn Session Fixation Attack
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, message: "Lỗi server" });

      req.session.user = {
        id:            user.id,
        username:      user.username,
        full_name:     user.full_name,
        role:          user.role,
        department_id: user.department_id,
      };

      return res.json({
        success:  true,
        redirect: user.role === "admin" ? "/admin" : "/index",
      });
    });

  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
}

// Script migrate password cũ sang bcrypt — chạy 1 lần duy nhất
// node -e "import('./security.js').then(m => m.migratePasswords())"
export async function migratePasswords() {
  console.log("🔄 Bắt đầu migrate passwords sang bcrypt...");
  const [users] = await pool.execute("SELECT id, password FROM users");

  for (const user of users) {
    // Bỏ qua nếu đã là bcrypt hash (bắt đầu bằng $2b$)
    if (user.password.startsWith("$2b$")) {
      console.log(`   ⏭️  User ${user.id}: đã là bcrypt, bỏ qua`);
      continue;
    }
    const hash = await hashPassword(user.password);
    await pool.execute("UPDATE users SET password = ? WHERE id = ?", [hash, user.id]);
    console.log(`   ✅ User ${user.id}: đã hash xong`);
  }
  console.log("✅ Migrate xong!");
}




// Ví dụ route đã fix — GET /api/devices
export async function getDevicesHandler(req, res) {
  try {
    // pool.execute tự lấy connection từ pool và trả về sau khi xong
    // KHÔNG cần conn.end() hay conn.release()
    const [rows] = await pool.execute(`
      SELECT
        d.id, d.name, d.qr_code, d.location, d.department_id,
        dep.name AS department_name,
        dt.name  AS device_type_name,
        CASE WHEN s.id IS NULL THEN 'Chưa quét' ELSE 'Đã quét' END AS status
      FROM devices d
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN device_types dt  ON dt.id = d.device_type_id
      LEFT JOIN (SELECT device_id, MAX(id) AS id FROM scans GROUP BY device_id) s1
             ON s1.device_id = d.id
      LEFT JOIN scans s ON s.id = s1.id
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ getDevices:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
}



export const loginValidation = [
  body("username")
    .trim()
    .notEmpty().withMessage("Username không được trống")
    .isLength({ min: 3, max: 50 }).withMessage("Username 3-50 ký tự")
    .matches(/^[a-zA-Z0-9._-]+$/).withMessage("Username chỉ được chứa chữ, số, dấu . _ -"),

  body("password")
    .notEmpty().withMessage("Password không được trống")
    .isLength({ min: 6, max: 100 }).withMessage("Password 6-100 ký tự")
    .isString().withMessage("Password phải là string"),
];

export const createUserValidation = [
  body("username").trim().notEmpty().isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9._-]+$/),
  body("password").notEmpty().isLength({ min: 6, max: 100 }).isString(),
  body("full_name").trim().notEmpty().isLength({ max: 100 }).escape(), // escape HTML
  body("role").optional().isIn(["admin", "user"]),
  body("department_id").optional().isInt({ min: 1 }),
];

export const deviceIdValidation = [
  param("id").isInt({ min: 1 }).withMessage("ID không hợp lệ"),
];

// Middleware tổng hợp lỗi validation — dùng sau validation rules
export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg, // trả lỗi đầu tiên
    });
  }
  next();
}




export function checkAuth(req, res, next) {
  if (!req.session?.user) {
    // Phân biệt API request vs page request
    if (req.path.startsWith("/api/") || req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    return res.redirect("/login");
  }
  next();
}

export function checkAdmin(req, res, next) {
  if (!req.session?.user) {
    if (req.path.startsWith("/api/") || req.xhr) {
      return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    return res.redirect("/login");
  }
  if (req.session.user.role !== "admin") {
    if (req.path.startsWith("/api/") || req.xhr) {
      return res.status(403).json({ success: false, message: "Không có quyền" });
    }
    return res.redirect("/index");
  }
  next();
}



export async function scanHandler(req, res) {
  // Validate
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: "Dữ liệu không hợp lệ" });
  }

  try {
    const { qr_code } = req.body;
    const user_id = req.session.user.id; // ← lấy từ session, không từ body

    const serial = qr_code.split("$")[0];

    const [devices] = await pool.execute(
      "SELECT * FROM devices WHERE qr_code = ?",
      [serial]
    );
    if (devices.length === 0) {
      return res.json({ success: false, message: "Không tìm thấy thiết bị!" });
    }

    const device_id = devices[0].id;

    const [scanned] = await pool.execute(
      "SELECT id FROM scans WHERE device_id = ? AND user_id = ?",
      [device_id, user_id]
    );
    if (scanned.length > 0) {
      return res.json({ success: false, already: true, message: "Thiết bị đã quét!", device: devices[0] });
    }

    await pool.execute(
      "INSERT INTO scans (user_id, device_id) VALUES (?, ?)",
      [user_id, device_id]
    );

    res.json({ success: true, message: "Đã quét thành công!", device: devices[0] });

  } catch (err) {
    console.error("❌ Scan error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
}

export const scanValidation = [
  body("qr_code").trim().notEmpty().isLength({ max: 200 }),
];


