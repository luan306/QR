import express from "express";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const router = express.Router();

router.get("/", (req, res) => {

 const data = [
  {
   qr_code: "QR001",
   name: "Thiết bị A",
   device_type_id: 1,
   department_id: 1,
   location: "Kho"
  }
 ];

 const ws = XLSX.utils.json_to_sheet(data);
 const wb = XLSX.utils.book_new();

 XLSX.utils.book_append_sheet(wb, ws, "Devices");

 const filePath = path.join("uploads", "device_template.xlsx");

 if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
 }

 XLSX.writeFile(wb, filePath);

 res.download(filePath, "device_template.xlsx");
});

export default router;