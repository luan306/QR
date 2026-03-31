import express from "express";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret:            process.env.SESSION_SECRET || "secret",
  resave:            false,
  saveUninitialized: false
}));

// ═══════════════════════════════════════════════════
//  /api routes — PHẢI đứng TRƯỚC app.use("/", ...)
// ═══════════════════════════════════════════════════
app.use("/api",                  authRoutes);
app.use("/api/users",            userRoutes);
app.use("/api/departments",      departmentRoutes);
app.use("/api/devices/template", templateRoutes);   // specific trước generic
app.use("/api/devices/upload",   uploadRoutes);     // specific trước generic
app.use("/api/devices",          deviceRoutes);
app.use("/api/scan",             scanRoutes);       // scan + audit-sessions nằm trong scanRoutes
app.use("/api/scans",            scanRoutes);
app.use("/api/stats",            statsRoutes);
app.use("/api/device-types",     deviceTypeRoutes);

// auditRoutes chỉ phục vụ trang EJS /admin/audit-dashboard
app.use("/admin",                auditRoutes);

// ═══════════════════════════════════════════════════
//  Page routes — SAU CÙNG
// ═══════════════════════════════════════════════════
app.use("/", authRoutes);
app.use("/", pageRoutes);

const options = {
  key:  fs.readFileSync("./certs/key.pem"),
  cert: fs.readFileSync("./certs/cert.pem")
};

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

https.createServer(options, app).listen(PORT, HOST, () => {
  console.log(`✅ HTTPS server running at https://${HOST}:${PORT}`);
});