import express from "express";
import { getConnection } from "../config/database.js";

const router = express.Router();

/* GET /api/departments */
router.get("/", async (req, res) => {

 try {

  const conn = await getConnection();

  const [rows] = await conn.execute(
   "SELECT * FROM departments"
  );

  await conn.end();

  res.json(rows);

 } catch (err) {

  console.error(err);

  res.status(500).json({
   success:false,
   message:"Server error"
  });

 }

});
/* DELETE department */
router.delete("/:id", async (req, res) => {

try {

const conn = await getConnection();

const id = req.params.id;

await conn.execute(
"DELETE FROM departments WHERE id=?",
[id]
);

await conn.end();

res.json({
success:true,
message:"Xóa bộ phận thành công"
});

} catch(err){

console.error(err);

res.status(500).json({
success:false,
message:"Lỗi server"
});

}

});

/* GET /api/departments/:deptId/devices */
router.get("/:deptId/devices", async (req, res) => {

 try {

  const { deptId } = req.params;

  const conn = await getConnection();

  const [rows] = await conn.execute(`
SELECT 
  d.id,
  d.name,
  d.qr_code,
  d.location,

  dep.name AS device_department,
  dep_scan.name AS current_department,

  dt.name AS device_type_name,

  CASE 
    WHEN s.id IS NULL THEN 'Chưa quét'

    WHEN d.department_id = s.scan_department 
      THEN CONCAT('Đang ở ', dep_scan.name)

    WHEN d.department_id != s.scan_department 
      AND s.scan_department = ?
      THEN CONCAT('Chuyển từ ', dep.name)

    WHEN d.department_id != s.scan_department 
      AND d.department_id = ?
      THEN CONCAT('Đã chuyển đến ', dep_scan.name)

    ELSE '-'
  END AS status

FROM devices d

LEFT JOIN device_types dt 
ON dt.id = d.device_type_id

LEFT JOIN departments dep 
ON dep.id = d.department_id

/* 🔥 lấy scan mới nhất */
LEFT JOIN (
  SELECT s1.*
  FROM scans s1
  INNER JOIN (
    SELECT device_id, MAX(scanned_at) AS max_time
    FROM scans
    GROUP BY device_id
  ) latest
  ON s1.device_id = latest.device_id 
  AND s1.scanned_at = latest.max_time
) s ON s.device_id = d.id

LEFT JOIN departments dep_scan 
ON dep_scan.id = s.scan_department

WHERE 
  d.department_id = ?
  OR s.scan_department = ?
`, [deptId, deptId, deptId, deptId]);
  await conn.end();

  res.json(rows);

 } catch (err) {

  console.error(err);

  res.status(500).json({
   success:false,
   message:"Server error"
  });

 }

});

export default router;