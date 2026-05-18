import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

// ══════════════════════════════════════════════════════════
//  POOL CONFIG — tối ưu cho 200 thiết bị đồng thời
//  connectionLimit 50: đủ cho 200 user (mỗi query giữ ~5-10ms)
//  queueLimit 500: xếp hàng thay vì reject lúc spike
// ══════════════════════════════════════════════════════════
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  user:               process.env.DB_USER     || "root",
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME     || "inventory",
  port:               process.env.DB_PORT     || 3306,
  connectionLimit:    100,    // ↑ từ 50 → 100 cho 200 user đồng thời
  queueLimit:         500,
  waitForConnections: true,
  connectTimeout:     10_000,
  idleTimeout:        60_000,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 10_000,
  charset:            "utf8mb4",
  timezone:           "+07:00",
});

pool.on("connection", (conn) => {
  conn.query("SET SESSION wait_timeout = 300, interactive_timeout = 300");
});

pool.getConnection()
  .then(conn => {
    console.log("✅ MySQL pool connected (limit=100, queue=500)");
    conn.release();
  })
  .catch(err => {
    console.error("❌ MySQL pool error:", err.message);
  });

// Keepalive mỗi 4 phút
setInterval(async () => {
  try { await pool.execute("SELECT 1"); }
  catch (e) { console.warn("⚠️ Pool keepalive failed:", e.message); }
}, 4 * 60_000);

// Monitor pool mỗi 30s
setInterval(() => {
  try {
    const p      = pool.pool;
    const used   = p._allConnections?.length  ?? 0;
    const free   = p._freeConnections?.length ?? 0;
    const queued = p._connectionQueue?.length ?? 0;
    const limit  = p.config?.connectionLimit  ?? 100;
    const pct    = limit > 0 ? Math.round((used / limit) * 100) : 0;
    console.log(`📊 [Pool] ${used}/${limit} (${pct}%) | Free: ${free} | Queued: ${queued}`);
    if (queued > 10) console.warn(`⚠️ [Pool] High queue: ${queued}`);
    if (pct >= 90)   console.warn(`⚠️ [Pool] Critical: ${pct}%`);
  } catch { /* mysql2 version không có private API */ }
}, 30_000);

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function transaction(callback) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function withConnection(callback) {
  const conn = await pool.getConnection();
  try {
    return await callback(conn);
  } finally {
    conn.release();
  }
}

export { pool };