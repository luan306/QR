import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import { getConnection } from "../config/database.js";
import { checkAdmin } from "../middleware/admin.js";

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post(
 "/devices/upload",
 checkAdmin,
 upload.single("file"),
 async (req, res) => {

  const workbook = XLSX.readFile(req.file.path);

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet);

  const conn = await getConnection();

  let added = 0;

  for (let row of rows) {

   const { name, qr_code, department_id } = row;

   if (!name || !qr_code) continue;

   await conn.execute(
    `INSERT INTO devices
    (name,qr_code,department_id)
    VALUES(?,?,?)`,
    [name, qr_code, department_id]
   );

   added++;

  }

  fs.unlinkSync(req.file.path);

  res.json({
   success: true,
   added
  });

 });

export default router;