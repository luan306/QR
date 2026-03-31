import { generateKeyPairSync } from "crypto";
import { writeFileSync } from "fs";
import selfsigned from "selfsigned";

const attrs = [{ name: "commonName", value: "localhost" }];
const pems = selfsigned.generate(attrs, { days: 365 });

writeFileSync("./certs/key.pem", pems.private);
writeFileSync("./certs/cert.pem", pems.cert);

console.log("✅ Đã tạo certs/key.pem và certs/cert.pem");
