// server.js - Complete (allow users to add devices for their own department)

// ------------------- IMPORT -------------------
import express from "express";
import mysql from "mysql2/promise";
import bodyParser from "body-parser";
import cors from "cors";
import multer from "multer";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import fs from "fs";
import https from "https";

dotenv.config();

const options = {
  key: fs.readFileSync("./certs/key.pem"),
  cert: fs.readFileSync("./certs/cert.pem")
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---------------- CONFIG ----------------
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
  })
);

const upload = multer({ dest: "uploads/" });

// ---------------- DATABASE ----------------
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "inventory",
};

async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

// ---------------- MIDDLEWARE ----------------
const checkAuth = (req, res, next) => {
  if (!req.session.user) {
    if (req.path.startsWith("/api/")) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    return res.redirect("/login");
  }
  next();
};

const checkAdmin = (req, res, next) => {
  if (!req.session.user) {
    if (req.path.startsWith("/api/")) return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    return res.redirect("/login");
  }
  if (req.session.user.role !== "admin") {
    if (req.path.startsWith("/api/")) return res.status(403).json({ success: false, message: "Không có quyền" });
    return res.redirect("/index");
  }
  next();
};

// Middleware cho phép admin hoặc user (để thêm thiết bị)
// Nếu là user, server sẽ kiểm tra thêm department_id để bảo đảm user chỉ thêm cho phòng ban của họ.
const checkCanAddDevice = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const role = req.session.user.role;
  if (role === "admin" || role === "user") {
    return next(); // ok
  }

  return res.status(403).json({ success: false, message: "Không có quyền thêm thiết bị" });
};

// ---------------- ROUTES ----------------
// Root redirect
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.redirect(req.session.user.role === "admin" ? "/admin" : "/index");
});

// Login page
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// API login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const conn = await getConnection();
    const [rows] = await conn.execute(
      "SELECT * FROM users WHERE username=? AND password=?",
      [username, password]  // ⚠️ thực tế nên mã hoá password
    );
    await conn.end();

    if (rows.length > 0) {
      const user = rows[0];

      // lưu vào session
      req.session.user = {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        department_id: user.department_id
      };

      return res.json({ success: true, redirect: user.role === "admin" ? "/admin" : "/index" });
    } else {
      res.json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });
    }
  } catch (err) {
    console.error("❌ Lỗi login:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Index page (user)
app.get("/index", checkAuth, (req, res) => {
  res.render("index", { user: req.session.user });
});

// Admin page - THÊM API URL VÀ DEPARTMENTS
app.get("/admin", checkAdmin, async (req, res) => {
  try {
    const conn = await getConnection();
    
    // Lấy stats
    const [stats] = await conn.execute(`
      SELECT 
        COUNT(DISTINCT d.id) AS total_devices,
        COUNT(DISTINCT s.id) AS total_scans,
        COUNT(DISTINCT u.id) AS total_users
      FROM devices d
      LEFT JOIN scans s ON s.device_id = d.id
      LEFT JOIN users u ON u.id = s.user_id
    `);
    
    // Lấy departments
    const [departments] = await conn.execute("SELECT * FROM departments");
    
    await conn.end();
    
    res.render("admin", {
      user: req.session.user,
      stats: stats[0] || { total_devices: 0, total_scans: 0, total_users: 0 },
      departments: departments,
      apiUrl: `http://${HOST}:${PORT}/api`
    });
  } catch (err) {
    console.error("❌ Lỗi load admin:", err.message);
    res.render("admin", {
      user: req.session.user,
      stats: { total_devices: 0, total_scans: 0, total_users: 0 },
      departments: [],
      apiUrl: `http://${HOST}:${PORT}/api`
    });
  }
});

// ---------------- USERS API ----------------
app.get("/api/users", checkAdmin, async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT u.*, d.name as department_name 
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id
    `);
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi lấy users:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

app.post("/api/users", checkAdmin, async (req, res) => {
  try {
    const { username, password, full_name, department_id, role } = req.body;
    
    if (!username || !password || !full_name) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc" });
    }

    const conn = await getConnection();
    const [result] = await conn.execute(
      "INSERT INTO users (username, password, full_name, department_id, role) VALUES (?, ?, ?, ?, ?)",
      [username, password, full_name, department_id, role || "user"]
    );
    await conn.end();

    res.json({ success: true, message: "Tạo user thành công", id: result.insertId });
  } catch (err) {
    console.error("❌ Lỗi tạo user:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

app.put("/api/users/:id", checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, department_id, role, password } = req.body;

    let query = "UPDATE users SET full_name=?, department_id=?, role=?";
    let params = [full_name, department_id, role];

    if (password) {
      query += ", password=?";
      params.push(password);
    }

    query += " WHERE id=?";
    params.push(id);

    const conn = await getConnection();
    const [result] = await conn.execute(query, params);
    await conn.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User không tồn tại" });
    }

    res.json({ success: true, message: "Cập nhật user thành công" });
  } catch (err) {
    console.error("❌ Lỗi cập nhật user:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ---------------- DEPARTMENTS API ----------------
app.get("/api/departments", async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute("SELECT * FROM departments");
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi lấy departments:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

app.delete("/api/departments/:id", checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const conn = await getConnection();

    // Check thiết bị còn dùng department này không
    const [devices] = await conn.execute(
      "SELECT COUNT(*) AS total FROM devices WHERE department_id = ?",
      [id]
    );

    if (devices[0].total > 0) {
      await conn.end();
      return res.status(400).json({ success: false, message: "Không thể xóa bộ phận vì còn thiết bị đang sử dụng" });
    }

    const [result] = await conn.execute("DELETE FROM departments WHERE id = ?", [id]);
    await conn.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bộ phận" });
    }

    res.json({ success: true, message: "Đã xóa bộ phận" });
  } catch (err) {
    console.error("❌ Lỗi xóa department:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// ---------------- DEVICES API ----------------
// Lấy danh sách thiết bị
app.get("/api/devices", async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT 
        d.id,
        d.name,
        d.qr_code,
        d.location,
        d.department_id,
        dep.name AS department_name,
        dt.name AS device_type_name,
        CASE WHEN s.id IS NULL THEN 'Chưa quét' ELSE 'Đã quét' END AS status
      FROM devices d
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN device_types dt ON dt.id = d.device_type_id
      LEFT JOIN (
        SELECT device_id, MAX(id) AS id
        FROM scans
        GROUP BY device_id
      ) s1 ON s1.device_id = d.id
      LEFT JOIN scans s ON s.id = s1.id
    `);
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi lấy devices:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// API: lấy user hiện tại
app.get("/api/current-user", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }
  res.json({ success: true, user: req.session.user });
});

// Thêm thiết bị: cho admin hoặc user (user chỉ được thêm cho department của họ)
app.post("/api/devices", checkCanAddDevice, async (req, res) => {
  try {
    const { qr_code, name, device_type_id, department_id, location } = req.body;

    if (!qr_code || !name || !device_type_id || !department_id) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc" });
    }

    const conn = await getConnection();

    // Nếu là user thường -> chỉ được thêm thiết bị cho phòng ban của họ
    if (req.session.user.role === "user") {
      // chuyển kiểu để so sánh chính xác
      const userDept = Number(req.session.user.department_id);
      const reqDept = Number(department_id);
      if (userDept !== reqDept) {
        await conn.end();
        return res.status(403).json({ success: false, message: "Không thể thêm thiết bị cho phòng ban khác" });
      }
    }

    // Kiểm tra QR code đã tồn tại chưa
    const [existing] = await conn.execute("SELECT id FROM devices WHERE qr_code = ?", [qr_code]);
    if (existing.length > 0) {
      await conn.end();
      return res.status(400).json({ success: false, message: "QR code đã tồn tại" });
    }

    const [result] = await conn.execute(
      "INSERT INTO devices (qr_code, name, device_type_id, department_id, location) VALUES (?, ?, ?, ?, ?)",
      [qr_code, name, device_type_id, department_id, location || ""]
    );
    await conn.end();

    res.json({ success: true, id: result.insertId, message: "Thêm thiết bị thành công" });
  } catch (err) {
    console.error("❌ Lỗi thêm thiết bị:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// Xóa thiết bị (chỉ admin)
app.delete("/api/devices/:id", checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const conn = await getConnection();
    await conn.execute("DELETE FROM scans WHERE device_id = ?", [id]);
    await conn.execute("DELETE FROM devices WHERE id = ?", [id]);
    await conn.end();
    res.json({ success: true, message: "✅ Đã xóa thiết bị!" });
  } catch (err) {
    console.error("❌ Lỗi xóa thiết bị:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server khi xóa thiết bị" });
  }
});

// Xóa toàn bộ thiết bị (chỉ admin)
app.delete("/api/devices", checkAdmin, async (req, res) => {
  try {
    const conn = await getConnection();
    await conn.execute("DELETE FROM scans");
    await conn.execute("DELETE FROM devices");
    await conn.end();
    res.json({ success: true, message: "✅ Đã xóa toàn bộ thiết bị!" });
  } catch (err) {
    console.error("❌ Lỗi xóa thiết bị:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server khi xóa thiết bị" });
  }
});

// Thống kê theo bộ phận
app.get("/api/stats/departments", async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT 
        d.id AS department_id,
        d.name AS department_name,
        COUNT(dev.id) AS total_devices,
        COUNT(s.id) AS scanned_devices,
        (COUNT(dev.id) - COUNT(s.id)) AS pending_devices
      FROM departments d
      LEFT JOIN devices dev ON d.id = dev.department_id
      LEFT JOIN scans s ON s.device_id = dev.id
      GROUP BY d.id, d.name
    `);
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi lấy thống kê:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// Lấy thiết bị theo bộ phận
app.get("/api/departments/:deptId/devices", async (req, res) => {
  try {
    const { deptId } = req.params;
    const conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT 
        d.id, d.name, d.qr_code, d.location,
        dep.name AS department_name,
        dt.name AS device_type_name,
        CASE WHEN s.id IS NULL THEN 'Chưa quét' ELSE 'Đã quét' END AS status
      FROM devices d
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN device_types dt ON dt.id = d.device_type_id
      LEFT JOIN scans s ON s.device_id = d.id
      WHERE d.department_id = ?
    `, [deptId]);
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi lấy devices theo bộ phận:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

// Danh sách loại thiết bị
app.get("/api/device-types", async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute("SELECT id, name FROM device_types");
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error("❌ Lỗi lấy loại thiết bị:", err.message);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// ---------------- SCANS API ----------------
app.post("/api/scan", checkAuth, async (req, res) => {
  try {
    const { user_id, qr_code } = req.body;
    const conn = await getConnection();

    const serial = qr_code.split("$")[0];
    const [devices] = await conn.execute("SELECT * FROM devices WHERE qr_code=?", [serial]);
    if (devices.length === 0) {
      await conn.end();
      return res.json({ success: false, message: "Không tìm thấy thiết bị!" });
    }

    const device_id = devices[0].id;
    const [scanned] = await conn.execute("SELECT * FROM scans WHERE device_id=? AND user_id=?", [
      device_id,
      user_id,
    ]);
    if (scanned.length > 0) {
      await conn.end();
      return res.json({ success: false, already: true, message: "Thiết bị đã quét!", device: devices[0] });
    }

    await conn.execute("INSERT INTO scans (user_id, device_id) VALUES (?, ?)", [user_id, device_id]);
    await conn.end();
    res.json({ success: true, message: "Đã quét thành công!", device: devices[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

app.get("/api/scans", checkAuth, async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(`
      SELECT scans.id, scans.scanned_at,
             devices.id AS device_id, devices.name AS device_name, devices.qr_code,
             users.id AS user_id, users.full_name AS user_name
      FROM scans
      JOIN devices ON scans.device_id = devices.id
      JOIN users ON scans.user_id = users.id
      ORDER BY scans.scanned_at DESC
    `);
    await conn.end();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi server khi lấy scans" });
  }
});

app.delete("/api/scans", checkAdmin, async (req, res) => {
  try {
    const conn = await getConnection();
    await conn.execute("DELETE FROM scans");
    await conn.end();
    res.json({ success: true, message: "Đã xóa toàn bộ báo cáo!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Lỗi khi xóa báo cáo" });
  }
});

// ---------------- DEVICES UPLOAD/DOWNLOAD ----------------

// Upload Excel để import thiết bị
// Bây giờ dùng checkCanAddDevice: admin được toàn quyền; user chỉ import thiết bị thuộc phòng ban họ
app.post("/api/devices/upload", checkCanAddDevice, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Không có file được tải lên!" });
    }

    // Đọc file Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const conn = await getConnection();
    const currentUser = req.session.user;
    let added = 0, updated = 0, skipped = 0;

    for (let row of rows) {
      const name = row.Name || row.name || null;
      const qrCode = row.QR_Code || row.qr_code || row.QR || null;
      const departmentName = row.Department || row.department || null;
      const deviceTypeName = row.DeviceType || row.deviceType || null;
      const location = row.Location || row.location || "";

      if (!name || !qrCode || !departmentName) {
        console.warn("⚠️ Bỏ qua dòng thiếu dữ liệu:", row);
        skipped++;
        continue;
      }

      // Tìm hoặc tạo Department
      let [dept] = await conn.execute("SELECT id FROM departments WHERE name = ?", [departmentName]);
      let departmentId;
      if (dept.length === 0) {
        const [result] = await conn.execute("INSERT INTO departments (name) VALUES (?)", [departmentName]);
        departmentId = result.insertId;
      } else {
        departmentId = dept[0].id;
      }

      // Nếu là user -> chỉ cho phép import thiết bị trong phòng ban của họ
      if (currentUser.role === "user" && Number(currentUser.department_id) !== Number(departmentId)) {
        console.warn(`⚠️ User ${currentUser.username} bị chặn: cố thêm thiết bị cho phòng ban khác (${departmentName})`);
        skipped++;
        continue;
      }

      // Tìm hoặc tạo DeviceType
      let deviceTypeId = null;
      if (deviceTypeName) {
        let [dt] = await conn.execute("SELECT id FROM device_types WHERE name = ?", [deviceTypeName]);
        if (dt.length === 0) {
          const [result] = await conn.execute("INSERT INTO device_types (name) VALUES (?)", [deviceTypeName]);
          deviceTypeId = result.insertId;
        } else {
          deviceTypeId = dt[0].id;
        }
      }

      // Insert/Update device by qr_code (unique)
      const [existing] = await conn.execute("SELECT id FROM devices WHERE qr_code = ?", [qrCode]);
      if (existing.length === 0) {
        await conn.execute(
          `INSERT INTO devices (name, qr_code, department_id, device_type_id, location)
           VALUES (?, ?, ?, ?, ?)`,
          [name, qrCode, departmentId, deviceTypeId, location]
        );
        added++;
      } else {
        await conn.execute(
          `UPDATE devices SET name=?, department_id=?, device_type_id=?, location=? WHERE qr_code=?`,
          [name, departmentId, deviceTypeId, location, qrCode]
        );
        updated++;
      }
    }

    await conn.end();
    fs.unlinkSync(req.file.path);

    res.json({ success: true, message: `Import xong. Thêm: ${added}, Cập nhật: ${updated}, Bỏ qua: ${skipped}` });
  } catch (err) {
    console.error("❌ Import error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xuất file Excel mẫu để nhập thiết bị (chỉ admin)
app.get("/api/devices/template", checkAdmin, (req, res) => {
  const ws = XLSX.utils.json_to_sheet([
    { qr_code: "QR001", name: "Thiết bị A", device_type_id: 1, department_id: 1, location: "Kho" },
    { qr_code: "QR002", name: "Thiết bị B", device_type_id: 2, department_id: 2, location: "Phòng 101" },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Devices");

  const filePath = path.join(__dirname, "uploads", "device_template.xlsx");
  // đảm bảo thư mục uploads tồn tại
  if (!fs.existsSync(path.join(__dirname, "uploads"))) fs.mkdirSync(path.join(__dirname, "uploads"));
  XLSX.writeFile(wb, filePath);

  res.download(filePath, "device_template.xlsx", () => {
    try { fs.unlinkSync(filePath); } catch (e) {}
  });
});

// ---------------- START SERVER ----------------
// Nếu bạn không muốn HTTPS khi dev, đổi sang app.listen
https.createServer(options, app).listen(PORT, HOST, () => {
  console.log(`✅ HTTPS server running at https://${HOST}:${PORT}`);
});
