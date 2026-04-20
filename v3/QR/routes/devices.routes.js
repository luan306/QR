import express from "express";
import { getConnection } from "../config/database.js";

const router = express.Router();

/* =================================================
   GET /api/devices
   lấy danh sách thiết bị + trạng thái scan
   ================================================= */
router.get("/", async (req, res) => {

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

    CASE 
      WHEN s.id IS NULL THEN 'Chưa quét'
      ELSE 'Đã quét'
    END AS status

   FROM devices d

   LEFT JOIN departments dep 
   ON d.department_id = dep.id

   LEFT JOIN device_types dt 
   ON dt.id = d.device_type_id

   LEFT JOIN (
     SELECT device_id, MAX(id) AS id
     FROM scans
     GROUP BY device_id
   ) s1 ON s1.device_id = d.id

   LEFT JOIN scans s 
   ON s.id = s1.id
  `);

  await conn.end();

  res.json(rows);

 } catch (err) {

  console.error("Devices error:", err);

  res.status(500).json({
   success:false,
   message:"Lỗi server"
  });

 }

});


/* =================================================
   POST /api/devices
   thêm thiết bị
   ================================================= */
router.post("/", async (req, res) => {
  try {
    const { qr_code, name, device_type_id, department_id, location } = req.body;

    const conn = await getConnection();

    // 🔥 CHECK QR TRÙNG
    const [exist] = await conn.execute(
      "SELECT * FROM devices WHERE qr_code=?",
      [qr_code]
    );

    // ===============================
    // 🚀 CASE: QR ĐÃ TỒN TẠI
    // ===============================
    if (exist.length > 0) {

      await conn.execute(`
        UPDATE devices 
        SET 
          name = ?, 
          device_type_id = ?, 
          department_id = ?, 
          location = ?
        WHERE qr_code = ?
      `, [name, device_type_id, department_id, location, qr_code]);

      await conn.end();

      return res.json({
        success: true,
        message: "🔁 Thiết bị đã tồn tại → cập nhật & chuyển bộ phận"
      });
    }

    // ===============================
    // ✅ CASE: THÊM MỚI
    // ===============================
    await conn.execute(`
      INSERT INTO devices (qr_code, name, device_type_id, department_id, location)
      VALUES (?, ?, ?, ?, ?)
    `, [qr_code, name, device_type_id, department_id, location]);

    await conn.end();

    res.json({
      success: true,
      message: "✅ Thêm thiết bị thành công"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Lỗi server"
    });
  }
});


/* =================================================
   DELETE /api/devices/:id
   xóa 1 thiết bị
   ================================================= */
router.delete("/:id", async (req,res)=>{

 try{

  const { id } = req.params;

  const conn = await getConnection();

  await conn.execute(
   "DELETE FROM scans WHERE device_id=?",
   [id]
  );

  await conn.execute(
   "DELETE FROM devices WHERE id=?",
   [id]
  );

  await conn.end();

  res.json({
   success:true,
   message:"Đã xóa thiết bị"
  });

 }catch(err){

  console.error(err);

  res.status(500).json({
   success:false,
   message:"Server error"
  });

 }

});


/* =================================================
   DELETE /api/devices
   xóa toàn bộ thiết bị
   ================================================= */
router.delete("/", async (req,res)=>{

 try{

  const conn = await getConnection();

  await conn.execute("DELETE FROM scans");
  await conn.execute("DELETE FROM devices");

  await conn.end();

  res.json({
   success:true,
   message:"Đã xóa toàn bộ thiết bị"
  });

 }catch(err){

  console.error(err);

  res.status(500).json({
   success:false,
   message:"Server error"
  });

 }

});

export default router;