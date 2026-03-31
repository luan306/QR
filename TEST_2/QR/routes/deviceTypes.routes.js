import express from "express";
import { getConnection } from "../config/database.js";

const router = express.Router();

/* =========================
GET /api/device-types
========================= */
router.get("/", async (req,res)=>{

 const conn = await getConnection();

 const [rows] = await conn.execute(
  "SELECT * FROM device_types ORDER BY id DESC"
 );

 await conn.end();

 res.json(rows);

});


/* =========================
POST /api/device-types
========================= */
router.post("/", async (req,res)=>{

 const { name } = req.body;

 const conn = await getConnection();

 await conn.execute(
  "INSERT INTO device_types(name) VALUES(?)",
  [name]
 );

 await conn.end();

 res.json({
  success:true,
  message:"Thêm loại thiết bị thành công"
 });

});


/* =========================
PUT /api/device-types/:id
========================= */
router.put("/:id", async (req,res)=>{

 const { name } = req.body;

 const conn = await getConnection();

 await conn.execute(
  "UPDATE device_types SET name=? WHERE id=?",
  [name, req.params.id]
 );

 await conn.end();

 res.json({
  success:true,
  message:"Cập nhật thành công"
 });

});


/* =========================
DELETE /api/device-types/:id
========================= */
router.delete("/:id", async (req,res)=>{

 const conn = await getConnection();

 await conn.execute(
  "DELETE FROM device_types WHERE id=?",
  [req.params.id]
 );

 await conn.end();

 res.json({
  success:true,
  message:"Đã xóa loại thiết bị"
 });

});

export default router;