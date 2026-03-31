import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import { getConnection } from "../config/database.js";
import { checkCanAddDevice } from "../middleware/devicePermission.js";

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/", checkCanAddDevice, upload.single("file"), async (req, res) => {

 try {

  if (!req.file) {
   return res.status(400).json({
    success:false,
    message:"Không có file upload"
   });
  }

  // đọc file Excel
  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const conn = await getConnection();

  const currentUser = req.session.user;

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (let row of rows) {

   const name = row.Name || row.name || null;
   const qrCode = row.QR_Code || row.qr_code || null;
   const departmentName = row.Department || row.department || null;
   const deviceTypeName = row.DeviceType || row.deviceType || null;
   const location = row.Location || row.location || "";

   if (!name || !qrCode || !departmentName) {
    skipped++;
    continue;
   }

   // tìm department
   let [dept] = await conn.execute(
    "SELECT id FROM departments WHERE name=?",
    [departmentName]
   );

   let departmentId;

   if (dept.length === 0) {

    const [result] = await conn.execute(
     "INSERT INTO departments(name) VALUES(?)",
     [departmentName]
    );

    departmentId = result.insertId;

   } else {

    departmentId = dept[0].id;

   }

   // kiểm tra quyền user
   if (
    currentUser.role === "user" &&
    Number(currentUser.department_id) !== Number(departmentId)
   ) {
    skipped++;
    continue;
   }

   // tìm device type
   let deviceTypeId = null;

   if (deviceTypeName) {

    let [dt] = await conn.execute(
     "SELECT id FROM device_types WHERE name=?",
     [deviceTypeName]
    );

    if (dt.length === 0) {

     const [result] = await conn.execute(
      "INSERT INTO device_types(name) VALUES(?)",
      [deviceTypeName]
     );

     deviceTypeId = result.insertId;

    } else {

     deviceTypeId = dt[0].id;

    }

   }

   // kiểm tra QR tồn tại
   const [existing] = await conn.execute(
    "SELECT id FROM devices WHERE qr_code=?",
    [qrCode]
   );

   if (existing.length === 0) {

    await conn.execute(`
     INSERT INTO devices
     (name, qr_code, department_id, device_type_id, location)
     VALUES (?,?,?,?,?)
    `,[name, qrCode, departmentId, deviceTypeId, location]);

    added++;

   } else {

    await conn.execute(`
     UPDATE devices
     SET name=?, department_id=?, device_type_id=?, location=?
     WHERE qr_code=?
    `,[name, departmentId, deviceTypeId, location, qrCode]);

    updated++;

   }

  }

  await conn.end();

  fs.unlinkSync(req.file.path);

  res.json({
   success:true,
   message:`Import xong. Thêm: ${added}, Cập nhật: ${updated}, Bỏ qua: ${skipped}`
  });

 } catch (err) {

  console.error("Import error:",err);

  res.status(500).json({
   success:false,
   message:"Lỗi import Excel"
  });

 }

});

export default router;