import XLSX from "xlsx";

export function readExcel(filePath){

 const workbook = XLSX.readFile(filePath);

 const sheet = workbook.Sheets[workbook.SheetNames[0]];

 return XLSX.utils.sheet_to_json(sheet);

}

export function createTemplate(){

 const data = [
  {
   qr_code: "QR001",
   name: "Thiết bị A",
   department_id: 1,
   location: "Kho"
  }
 ];

 const ws = XLSX.utils.json_to_sheet(data);

 const wb = XLSX.utils.book_new();

 XLSX.utils.book_append_sheet(wb, ws, "Devices");

 return wb;

}