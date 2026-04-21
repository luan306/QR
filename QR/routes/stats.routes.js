import express from "express";
import { getConnection } from "../config/database.js";

const router = express.Router();

router.get("/departments", async (req, res) => {

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

  console.error(err);

  res.status(500).json({
   success:false,
   message:"Server error"
  });

 }

});

export default router;