import express from 'express';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const LAYOUTS_DIR = path.join(__dirname, '..', 'public', 'layouts');
if (!fs.existsSync(LAYOUTS_DIR)) fs.mkdirSync(LAYOUTS_DIR, { recursive: true });

const router = express.Router();

// ── Factories ──────────────────────────────────────────────────
router.get('/factories', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM factories ORDER BY name');
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/factories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Thiếu tên' });
    const rows = await query('INSERT INTO factories (name) VALUES (?)', [name]);
    res.json({ success: true, id: rows.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/factories/:id', async (req, res) => {
  try {
    await query('DELETE FROM factories WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Workshops (xưởng) ──────────────────────────────────────────
router.get('/workshops', async (req, res) => {
  try {
    const rows = await query(`
      SELECT w.*, f.name AS factory_name
      FROM   workshops w
      LEFT JOIN factories f ON f.id = w.factory_id
      ORDER  BY f.name, w.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/workshops', async (req, res) => {
  try {
    const { name, factory_id } = req.body;
    if (!name || !factory_id) return res.status(400).json({ success: false, message: 'Thiếu tên hoặc nhà máy' });
    const rows = await query('INSERT INTO workshops (name, factory_id) VALUES (?,?)', [name, factory_id]);
    res.json({ success: true, id: rows.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/workshops/:id', async (req, res) => {
  try {
    await query('DELETE FROM workshops WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Layouts ────────────────────────────────────────────────────
router.get('/layouts', async (req, res) => {
  try {
    const rows = await query(`
      SELECT dl.id, dl.workshop_id, dl.floor, dl.image_url,
             dl.map_enabled, dl.locked, dl.updated_at,
             w.name AS workshop_name,
             f.id   AS factory_id,
             f.name AS factory_name
      FROM   department_layouts dl
      LEFT JOIN workshops  w ON w.id = dl.workshop_id
      LEFT JOIN factories  f ON f.id = w.factory_id
      WHERE  dl.workshop_id IS NOT NULL
      ORDER  BY f.name, w.name, dl.floor
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /layouts:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/layouts/enabled', async (req, res) => {
  try {
    const rows = await query(`
      SELECT dl.id, dl.workshop_id, dl.floor, dl.image_url, dl.locked,
             w.name AS workshop_name,
             f.id   AS factory_id,
             f.name AS factory_name
      FROM   department_layouts dl
      LEFT JOIN workshops  w ON w.id = dl.workshop_id
      LEFT JOIN factories  f ON f.id = w.factory_id
      WHERE  dl.map_enabled = 1 AND dl.image_url != '' AND dl.workshop_id IS NOT NULL
      ORDER  BY f.name, w.name, dl.floor
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/layouts/has-enabled', async (req, res) => {
  try {
    const rows = await query(
      'SELECT COUNT(*) AS cnt FROM department_layouts WHERE map_enabled=1 AND image_url!="" AND workshop_id IS NOT NULL'
    );
    res.json({ has_enabled: rows[0].cnt > 0 });
  } catch (err) { res.status(500).json({ has_enabled: false }); }
});

router.post('/layouts/upload', async (req, res) => {
  try {
    const { workshop_id, floor, image_base64 } = req.body;
    if (!workshop_id || !image_base64)
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu' });

    const filename = `ws_${workshop_id}_floor_${floor}_${Date.now()}.png`;
    const b64      = image_base64.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(LAYOUTS_DIR, filename), Buffer.from(b64, 'base64'));
    const imageUrl = `/layouts/${filename}`;

    const exist = await query(
      'SELECT id FROM department_layouts WHERE workshop_id=? AND floor=?',
      [workshop_id, floor]
    );
    if (exist.length > 0) {
      await query(
        'UPDATE department_layouts SET image_url=?, updated_at=NOW() WHERE workshop_id=? AND floor=?',
        [imageUrl, workshop_id, floor]
      );
    } else {
      await query(
        'INSERT INTO department_layouts (workshop_id, floor, image_url) VALUES (?,?,?)',
        [workshop_id, floor, imageUrl]
      );
    }
    res.json({ success: true, image_url: imageUrl });
  } catch (err) {
    console.error('Upload layout:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/layouts/:id/toggle-map', async (req, res) => {
  try {
    const { map_enabled } = req.body;
    const rows = await query(
      'UPDATE department_layouts SET map_enabled=? WHERE id=?',
      [map_enabled ? 1 : 0, req.params.id]
    );
    if (rows.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Không tìm thấy layout id=' + req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/layouts/:id/toggle-lock', async (req, res) => {
  try {
    await query('UPDATE department_layouts SET locked=? WHERE id=?', [req.params.id ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Device positions ───────────────────────────────────────────
router.get('/devices/positions', async (req, res) => {
  try {
    // Join với round active để biết trạng thái kiểm kê
    const rows = await query(`
      SELECT d.id, d.name, d.qr_code, d.floor, d.pos_x, d.pos_y,
             d.location, d.department_id, d.workshop_id,
             dt.name  AS device_type_name,
             dep.name AS department_name,
             -- Trạng thái kiểm kê từ round active
             CASE
               WHEN ri.audited = 1 THEN 'scanned'
               WHEN ri.id IS NOT NULL THEN 'not_scanned'
               ELSE 'no_round'
             END AS inv_status,
             ri.id AS round_item_id
      FROM   devices d
      LEFT JOIN device_types dt  ON dt.id  = d.device_type_id
      LEFT JOIN departments  dep ON dep.id = d.department_id
      -- Join với round đang active
      LEFT JOIN (
        SELECT ir.id, ir.qr_code, ir.audited
        FROM   inventory_round_items ir
        INNER JOIN inventory_rounds r ON r.id = ir.round_id AND r.status = 'active'
      ) ri ON ri.qr_code = d.qr_code
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/devices/:id/position', async (req, res) => {
  try {
    const { floor, pos_x, pos_y, workshop_id } = req.body;
    await query(
      'UPDATE devices SET floor=?, pos_x=?, pos_y=?, workshop_id=? WHERE id=?',
      [floor ?? null, pos_x ?? null, pos_y ?? null, workshop_id ?? null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/devices/search-position', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const rows = await query(`
      SELECT d.id, d.name, d.qr_code, d.floor, d.pos_x, d.pos_y,
             d.department_id, d.workshop_id,
             dt.name  AS device_type_name,
             dep.name AS department_name,
             w.name   AS workshop_name,
             dl.image_url AS layout_image
      FROM   devices d
      LEFT JOIN device_types       dt  ON dt.id  = d.device_type_id
      LEFT JOIN departments        dep ON dep.id = d.department_id
      LEFT JOIN workshops          w   ON w.id   = d.workshop_id
      LEFT JOIN department_layouts dl  ON dl.workshop_id = d.workshop_id AND dl.floor = d.floor
      WHERE  d.name LIKE ? OR d.qr_code LIKE ?
      LIMIT  20
    `, [`%${q}%`, `%${q}%`]);
    res.json(rows);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

export default router;