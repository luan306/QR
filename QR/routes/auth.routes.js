import express from "express";
import bcrypt  from "bcrypt";
import { query } from "../config/database.js";

const router        = express.Router();
const MAX_ATTEMPTS  = 5;
const TARGET_ROUNDS = 10;

// ── Cache kết quả bcrypt trong RAM ───────────────────────────
// Key: username, Value: { hash, result, expireAt }
// Tránh bcrypt.compare lặp lại cho cùng 1 user trong 60s
const bcryptCache = new Map();
const CACHE_TTL   = 60 * 1000; // 60 giây

// Dọn cache mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of bcryptCache.entries()) {
    if (v.expireAt < now) bcryptCache.delete(k);
  }
}, 5 * 60 * 1000);

async function cachedBcryptCompare(username, plain, hash) {
  const key    = `${username}:${plain.length}`; // key nhẹ, không lưu password
  const cached = bcryptCache.get(key);

  // Cache hit: cùng user, cùng hash → trả kết quả cũ
  if (cached && cached.hash === hash && cached.expireAt > Date.now()) {
    return cached.result;
  }

  const result = await bcrypt.compare(plain, hash);

  // Chỉ cache kết quả đúng — sai không cache (tránh brute force bypass)
  if (result) {
    bcryptCache.set(key, { hash, result, expireAt: Date.now() + CACHE_TTL });
  }

  return result;
}

// ── Semaphore: giới hạn bcrypt đồng thời ─────────────────────
const MAX_BCRYPT = 40;
let   bcryptRunning = 0;
const bcryptQueue   = [];

function bcryptCompare(username, plain, hash) {
  return new Promise((resolve, reject) => {
    const run = () => {
      bcryptRunning++;
      cachedBcryptCompare(username, plain, hash)
        .then(resolve).catch(reject)
        .finally(() => {
          bcryptRunning--;
          if (bcryptQueue.length > 0) bcryptQueue.shift()();
        });
    };
    bcryptRunning < MAX_BCRYPT ? run() : bcryptQueue.push(run);
  });
}

/* ── POST /api/login ─────────────────────────────────────── */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "Thiếu username hoặc password" });

  try {
    const rows = await query(
      `SELECT id, username, full_name, password, role,
              department_id, section_id, group_id, cost_center_id,
              login_attempts, locked_at
       FROM users WHERE username=? LIMIT 1`,
      [username]
    );

    if (!rows.length)
      return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });

    const user = rows[0];

    if (user.locked_at)
      return res.status(403).json({
        success: false, locked: true,
        message: "Tài khoản đã bị khoá. Vui lòng liên hệ admin.",
      });

    const match = await bcryptCompare(username, password, user.password);

    if (!match) {
      const attempts = (user.login_attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await query("UPDATE users SET login_attempts=?, locked_at=NOW() WHERE id=?", [attempts, user.id]);
        return res.status(403).json({
          success: false, locked: true,
          message: "Tài khoản bị khoá do sai 5 lần.",
        });
      }
      await query("UPDATE users SET login_attempts=? WHERE id=?", [attempts, user.id]);
      // Xóa cache khi sai password
      bcryptCache.delete(`${username}:${password.length}`);
      return res.status(401).json({
        success: false,
        message: `Sai mật khẩu. Còn ${MAX_ATTEMPTS - attempts} lần thử.`,
        attemptsLeft: MAX_ATTEMPTS - attempts,
      });
    }

    // Reset login attempts
    await query("UPDATE users SET login_attempts=0, locked_at=NULL WHERE id=?", [user.id]);

    // Auto re-hash background nếu cost cao
    try {
      if (bcrypt.getRounds(user.password) > TARGET_ROUNDS) {
        bcrypt.hash(password, TARGET_ROUNDS)
          .then(h => {
            query("UPDATE users SET password=? WHERE id=?", [h, user.id]);
            bcryptCache.delete(`${username}:${password.length}`); // clear cache khi đổi hash
          })
          .catch(() => {});
      }
    } catch {}

    req.session.userId = user.id;
    req.session.user   = {
      id:             user.id,
      username:       user.username,
      full_name:      user.full_name,
      role:           user.role,
      department_id:  user.department_id,
      section_id:     user.section_id,
      group_id:       user.group_id,
      cost_center_id: user.cost_center_id,
    };

    res.json({ success: true, user: req.session.user });

  } catch (err) {
    console.error("[Login] error:", err.message);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

/* ── POST /api/logout ────────────────────────────────────── */
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* ── GET /api/current-user ───────────────────────────────── */
router.get("/current-user", async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ user: null });
  try {
    const rows = await query(
      `SELECT id, username, full_name, role,
              department_id, section_id, group_id, cost_center_id
       FROM users WHERE id=? LIMIT 1`,
      [req.session.userId]
    );
    if (!rows.length) return res.status(401).json({ user: null });
    req.session.user = rows[0];
    res.json({ user: rows[0] });
  } catch {
    if (req.session?.user) return res.json({ user: req.session.user });
    res.status(500).json({ user: null });
  }
});

export default router;