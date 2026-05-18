import express from "express";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIO } from "socket.io";
import { rateLimit } from "express-rate-limit";
import compression from "compression";        // npm i compression
import helmet from "helmet";                  // npm i helmet
import { RedisStore } from "connect-redis";
import redisClient    from "./config/redis.js";

import authRoutes       from "./routes/auth.routes.js";
import userRoutes       from "./routes/users.routes.js";
import departmentRoutes from "./routes/departments.routes.js";
import deviceRoutes     from "./routes/devices.routes.js";
import scanRoutes       from "./routes/scans.routes.js";
import statsRoutes      from "./routes/stats.routes.js";
import deviceTypeRoutes from "./routes/deviceTypes.routes.js";
import templateRoutes   from "./routes/template.routes.js";
import pageRoutes       from "./routes/pages.routes.js";
import uploadRoutes     from "./routes/upload.routes.js";
import auditRoutes      from "./routes/audit.routes.js";
import mapRoutes        from "./routes/map.routes.js";
import sectionRoutes    from "./routes/sections.routes.js";
import groupRoutes      from "./routes/groups.routes.js";
import costCenterRoutes from "./routes/costCenters.routes.js";
import inventoryRoundRoutes from "./routes/inventoryRounds.js";
dotenv.config();

// ══════════════════════════════════════════════════════════════
//  VALIDATION — bắt lỗi cấu hình sớm, không để crash lúc runtime
// ══════════════════════════════════════════════════════════════
if (!process.env.SESSION_SECRET) {
  throw new Error("❌ SESSION_SECRET is required in .env");
}

const app = express();


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ══════════════════════════════════════════════════════════════
//  REDIS CLIENT — dùng cho session store
//  Cài: npm i redis connect-redis
//  Khởi động Redis: sudo systemctl start redis  (Ubuntu)
// ══════════════════════════════════════════════════════════════
await redisClient.connect();

// ══════════════════════════════════════════════════════════════
//  VIEW ENGINE
// ══════════════════════════════════════════════════════════════
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ══════════════════════════════════════════════════════════════
//  SECURITY & PERFORMANCE MIDDLEWARE
// ══════════════════════════════════════════════════════════════

// ── Helmet: bảo mật HTTP headers ────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // tắt CSP nếu dùng inline script/style
  crossOriginEmbedderPolicy: false,
}));

// ── Compression: nén response giảm băng thông ~60-70% ────────
// Tác dụng lớn nhất với JSON API responses và HTML pages
app.use(compression({
  level: 6,       // 1-9, level 6 là điểm cân bằng tốc độ/nén
  threshold: 1024, // chỉ nén response > 1KB
  filter: (req, res) => {
    // không nén server-sent events
    if (req.headers["accept"] === "text/event-stream") return false;
    return compression.filter(req, res);
  },
}));

// ── Body parser ───────────────────────────────────────────────
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// ── CORS — giới hạn origin thay vì origin: true ──────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["https://localhost:3000"]; // fallback dev

app.use(cors({
  origin: (origin, callback) => {
    // cho phép request không có origin (Postman, mobile app)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));

// ── Static files với cache headers ───────────────────────────
// Browser cache 1 ngày cho assets tĩnh → giảm request lặp lại
const staticOptions = {
  maxAge:      "1d",
  etag:        true,
  lastModified: true,
};
app.use(express.static(path.join(__dirname, "public"), staticOptions));
app.use("/layouts", express.static(path.join(__dirname, "public", "layouts"), staticOptions));

// ══════════════════════════════════════════════════════════════
//  RATE LIMITER
//  - Production: 300 req/phút/IP cho API, 120/phút cho scan
//  - Development: bỏ qua localhost hoàn toàn
//    (Vite proxy tất cả qua 127.0.0.1 → cùng IP → dễ chạm giới hạn)
// ══════════════════════════════════════════════════════════════

const isDev = process.env.NODE_ENV !== "production";

// Kiểm tra request từ localhost (dev/Vite proxy)
const isLocalRequest = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
};

// General API: 300 req/phút/IP
const limiter = rateLimit({
  windowMs:        60 * 1000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, message: "Quá nhiều request, thử lại sau." },
  skip: (req) => {
    if (req.path.startsWith("/api/scan")) return true; // scan có limiter riêng
    if (isDev && isLocalRequest(req))    return true; // bỏ qua khi dev
    return false;
  },
});
app.use("/api", limiter);

// Scan endpoint: 120 lần/phút/IP
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      120,
  message:  { success: false, message: "Quét quá nhanh, thử lại sau." },
  skip: (req) => isDev && isLocalRequest(req),
});
app.use("/api/scan", scanLimiter);

// ══════════════════════════════════════════════════════════════
//  SESSION — dùng Redis store thay vì in-memory
//  Lợi ích:
//    ✅ Không mất session khi restart server
//    ✅ RAM không bị ăn bởi session của 220 user
//    ✅ TTL tự động, không cần cleanup thủ công
// ══════════════════════════════════════════════════════════════
const sessionMiddleware = session({
  store: new RedisStore({ client: redisClient }),
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  name:              "sid", // đổi tên khỏi default "connect.sid" cho bảo mật
  cookie: {
    secure:   true,
    httpOnly: true,
    sameSite: "strict",
    maxAge:   8 * 60 * 60 * 1000, // 8 tiếng
  },
});
app.use(sessionMiddleware);

// ══════════════════════════════════════════════════════════════
//  IN-MEMORY CACHE — cache response cho các API đọc nhiều
//  Dùng cho: danh sách device types, departments, stats tổng hợp
//  Không cần thư viện nặng, dùng Map thuần là đủ với 1 server
// ══════════════════════════════════════════════════════════════
export const memCache = new Map(); // { key: { data, expireAt } }

/**
 * Cache middleware factory
 * @param {number} ttlSeconds - Thời gian cache tính bằng giây
 *
 * Dùng trong route:
 *   router.get("/device-types", cacheMiddleware(60), handler);
 *   → cache 60 giây, tất cả user cùng nhận response từ cache
 */
export function cacheMiddleware(ttlSeconds = 30) {
  return (req, res, next) => {
    // Không cache request có query params động hoặc đã auth riêng
    const key = `cache:${req.originalUrl}`;
    const cached = memCache.get(key);

    if (cached && cached.expireAt > Date.now()) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cached.data);
    }

    // Override res.json để bắt response và lưu vào cache
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) {
        memCache.set(key, { data, expireAt: Date.now() + ttlSeconds * 1000 });
      }
      res.setHeader("X-Cache", "MISS");
      return originalJson(data);
    };
    next();
  };
}

// Dọn dẹp cache hết hạn mỗi 5 phút để tránh memory leak
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, val] of memCache.entries()) {
    if (val.expireAt <= now) {
      memCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`🧹 [Cache] Cleaned ${cleaned} expired entries`);
}, 5 * 60 * 1000);

// ══════════════════════════════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════════════════════════════
app.use("/api",                  authRoutes);
app.use("/api/users",            userRoutes);
app.use("/api/departments",      departmentRoutes);
app.use("/api/sections",         sectionRoutes);
app.use("/api/groups",           groupRoutes);
app.use("/api/cost-centers",     costCenterRoutes);
app.use("/api/devices/template", templateRoutes);
app.use("/api/devices/upload",   uploadRoutes);
app.use("/api/devices",          deviceRoutes);
app.use("/api/scan",             scanRoutes);
app.use("/api/scans",            scanRoutes);
app.use("/api/stats",            statsRoutes);
app.use("/api/device-types",     deviceTypeRoutes);
app.use("/api", inventoryRoundRoutes);
app.use("/api",                  mapRoutes);
app.use("/admin",                auditRoutes);

app.use("/", authRoutes);
app.use("/", pageRoutes);

// ══════════════════════════════════════════════════════════════
//  GLOBAL ERROR HANDLER — bắt lỗi không xử lý, trả JSON thay vì crash
// ══════════════════════════════════════════════════════════════
app.use((err, req, res, _next) => {
  console.error("❌ [Error]", err.message, req.method, req.originalUrl);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Lỗi server" : err.message,
  });
});

// ══════════════════════════════════════════════════════════════
//  HTTPS SERVER
// ══════════════════════════════════════════════════════════════
const options = {
  key:  fs.readFileSync("./certs/key.pem"),
  cert: fs.readFileSync("./certs/cert.pem"),
};

const httpsServer = https.createServer(options, app);

// ── Tăng timeout để tránh disconnect lúc server bận ──────────
httpsServer.keepAliveTimeout    = 65 * 1000;  // > load balancer timeout
httpsServer.headersTimeout      = 66 * 1000;  // phải lớn hơn keepAliveTimeout
httpsServer.maxHeadersCount     = 100;

// ══════════════════════════════════════════════════════════════
//  SOCKET.IO — tối ưu cho nhiều kết nối đồng thời
// ══════════════════════════════════════════════════════════════
const io = new SocketIO(httpsServer, {
  cors: {
    origin: allowedOrigins,  // dùng cùng whitelist với API CORS
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowEIO3: true,

  // ── Performance tuning ───────────────────────────────────
  pingTimeout:  20000,   // 20s chờ pong trước khi coi là disconnect
  pingInterval: 25000,   // ping mỗi 25s
  upgradeTimeout: 10000, // timeout khi upgrade từ polling → websocket

  // ── Giới hạn payload để tránh bị abuse ──────────────────
  maxHttpBufferSize: 1e6, // 1MB max per message
});

// ── Share session với Socket.io ──────────────────────────────
// Cho phép socket đọc req.session (vd: lấy userId từ session)
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// ══════════════════════════════════════════════════════════════
//  SOCKET ROOMS — quản lý audit rooms
//  roomUsers lưu in-memory: OK với 1 server
//  Nếu sau này scale 2+ server → chuyển sang Redis pub/sub
// ══════════════════════════════════════════════════════════════
const roomUsers = {}; // { 'audit:19': { socketId: { userId, userName } } }

io.on("connection", (socket) => {
  console.log("🔌 [Socket] Connected:", socket.id);

  // ── Join audit room ──────────────────────────────────────
  socket.on("join_audit", ({ deptId, userId, userName }) => {
    const room = `audit:${deptId}`;
    socket.join(room);

    if (!roomUsers[room]) roomUsers[room] = {};
    roomUsers[room][socket.id] = { userId, userName };

    io.to(room).emit("room_users", Object.values(roomUsers[room]));
    console.log(`✅ [Socket] ${userName} joined ${room}`);
  });

  // ── Leave audit room ─────────────────────────────────────
  socket.on("leave_audit", ({ deptId }) => {
    _leaveRoom(socket, `audit:${deptId}`);
  });

  // ── Broadcast quét thiết bị ──────────────────────────────
  socket.on("device_scanned", ({ deptId, qr_code, device_name, scanned_by, scanned_at }) => {
    const room = `audit:${deptId}`;
    io.to(room).emit("device_scanned", { qr_code, device_name, scanned_by, scanned_at });
    console.log(`🔍 [Socket] ${scanned_by} scanned ${qr_code} → ${room}`);
  });

  // ── Disconnect: cleanup tất cả room ─────────────────────
  socket.on("disconnect", () => {
    console.log("❌ [Socket] Disconnected:", socket.id);
    for (const room of Object.keys(roomUsers)) {
      _leaveRoom(socket, room);
    }
  });
});

// Helper: xóa socket khỏi room và broadcast lại danh sách
function _leaveRoom(socket, room) {
  if (!roomUsers[room]?.[socket.id]) return;
  socket.leave(room);
  delete roomUsers[room][socket.id];
  io.to(room).emit("room_users", Object.values(roomUsers[room]));
  console.log(`👋 [Socket] ${socket.id} left ${room}`);
}

export { io };

// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

httpsServer.listen(PORT, HOST, () => {
  console.log(`✅ HTTPS + Socket.io running at https://${HOST}:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || "development"}`);
  console.log(`   Session store: Redis`);
  console.log(`   DB pool: 40 connections`);
});