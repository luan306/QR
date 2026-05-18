/**
 * test_realistic.cjs — test sát thực tế
 * Mỗi user dùng account riêng, QR thật từ DB, timing tự nhiên
 *
 * Chạy: node test_realistic.cjs 200 https://192.168.169.1:3000 admin Adminlocal
 */
const https = require('https');
const http  = require('http');

const NUM_DEVICES = parseInt(process.argv[2] || '50');
const HOST        = process.argv[3] || 'https://192.168.169.1:3000';
const ADMIN_USER  = process.argv[4] || 'admin';
const ADMIN_PASS  = process.argv[5] || 'Adminlocal';
const isHttps     = HOST.startsWith('https');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const c = {
  reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m',
  yellow:'\x1b[33m', cyan:'\x1b[36m', gray:'\x1b[90m', bold:'\x1b[1m',
};

const sleep  = (ms) => new Promise(r => setTimeout(r, ms));
const avg    = (a) => a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length) : 0;
const p95    = (a) => { if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length*0.95)]; };
const maxv   = (a) => a.length ? Math.max(...a) : 0;
const rand   = (min,max) => Math.floor(Math.random()*(max-min+1))+min;

function request(method, path, body, cookie) {
  return new Promise((resolve) => {
    const url     = new URL(HOST + path);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method,
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie  ? { 'Cookie': cookie } : {}),
      },
    };
    const t0  = Date.now();
    const lib = isHttps ? https : http;
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch {}
        const raw    = res.headers['set-cookie'] || [];
        const cookie = raw.map(c => c.split(';')[0]).join('; ');
        resolve({ statusCode: res.statusCode, data: json, elapsed: Date.now()-t0, ok: res.statusCode < 400, cookie });
      });
    });
    req.on('error', () => resolve({ statusCode:0, data:{}, elapsed:Date.now()-t0, ok:false, cookie:'' }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ statusCode:0, data:{}, elapsed:15000, ok:false, cookie:'' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Stats ─────────────────────────────────────────────────────
const stats = {
  login:  { ok:0, fail:0, lat:[] },
  scan:   { ok:0, fail:0, lat:[] },
  browse: { ok:0, fail:0, lat:[] },
  socket: { ok:0, fail:0, lat:[] },
};

// ── Lấy QR codes thật từ DB ───────────────────────────────────
async function getRealQRCodes(cookie) {
  const res = await request('GET', '/api/devices', null, cookie);
  if (!res.ok) return [];
  const devs = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  return devs.map(d => d.qr_code).filter(Boolean);
}

// ── Lấy danh sách users thật ──────────────────────────────────
async function getRealUsers(cookie) {
  const res = await request('GET', '/api/users', null, cookie);
  if (!res.ok) return [];
  const users = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  return users.filter(u => u.username && u.username !== ADMIN_USER);
}

// ── Giả lập 1 thiết bị/user thật ─────────────────────────────
async function simulateDevice(deviceIdx, accounts, qrCodes) {
  // Delay tự nhiên — thiết bị thật không đăng nhập cùng lúc
  await sleep(rand(0, 5000));

  // Chọn account — luôn dùng admin vì password user thật không biết
  const acc = { username: ADMIN_USER, password: ADMIN_PASS };

  // Login
  const t0    = Date.now();
  const login = await request('POST', '/api/login', { username: acc.username, password: acc.password }, null);
  stats.login.lat.push(login.elapsed);
  if (!login.ok) { stats.login.fail++; return; }
  stats.login.ok++;

  const cookie = login.cookie;

  // Thiết bị thật: load trang inventory sau khi login
  await sleep(rand(500, 2000)); // user mất vài giây nhìn màn hình
  const browse = await request('GET', '/api/inventory-rounds', null, cookie);
  stats.browse.lat.push(browse.elapsed);
  browse.ok ? stats.browse.ok++ : stats.browse.fail++;

  // Scan QR (chọn QR thật ngẫu nhiên)
  await sleep(rand(1000, 4000)); // user di chuyển đến thiết bị, quét
  const qr   = qrCodes.length > 0
    ? qrCodes[rand(0, qrCodes.length-1)]
    : `QR-${String(rand(1,9999)).padStart(6,'0')}`;
  const scan = await request('POST', '/api/scan', { qr_code: qr }, cookie);
  stats.scan.lat.push(scan.elapsed);
  (scan.ok || scan.statusCode === 404 || scan.statusCode === 200)
    ? stats.scan.ok++ : stats.scan.fail++;

  // Thiết bị thật: có thể scan thêm 1-3 QR nữa
  const extraScans = rand(0, 2);
  for (let i = 0; i < extraScans; i++) {
    await sleep(rand(500, 2000));
    const qr2   = qrCodes.length > 0 ? qrCodes[rand(0,qrCodes.length-1)] : `QR-${rand(1,9999)}`;
    const scan2 = await request('POST', '/api/scan', { qr_code: qr2 }, cookie);
    stats.scan.lat.push(scan2.elapsed);
    (scan2.ok || scan2.statusCode === 404) ? stats.scan.ok++ : stats.scan.fail++;
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}=== REALISTIC DEVICE TEST ===${c.reset}`);
  console.log(`${c.cyan}Devices : ${NUM_DEVICES}${c.reset}`);
  console.log(`${c.cyan}Server  : ${HOST}${c.reset}`);
  console.log(`${c.gray}Mode    : Realistic (random delay 0-5s login, 1-4s scan)${c.reset}\n`);

  // Admin login để lấy data
  process.stdout.write('Admin login... ');
  const adminLogin = await request('POST', '/api/login', { username: ADMIN_USER, password: ADMIN_PASS }, null);
  if (!adminLogin.ok) { console.log(`${c.red}FAILED${c.reset}`); process.exit(1); }
  console.log(`${c.green}OK${c.reset}`);

  // Lấy QR codes thật
  process.stdout.write('Loading real QR codes... ');
  const qrCodes = await getRealQRCodes(adminLogin.cookie);
  console.log(`${c.green}${qrCodes.length} QR codes${c.reset}`);

  // Lấy accounts thật
  process.stdout.write('Loading user accounts... ');
  const accounts = await getRealUsers(adminLogin.cookie);
  console.log(`${c.green}${accounts.length} users${c.reset}`);

  if (accounts.length === 0) {
    console.log(`${c.yellow}⚠️  Không có user nào ngoài admin — tất cả dùng account admin${c.reset}`);
  }
  if (qrCodes.length === 0) {
    console.log(`${c.yellow}⚠️  Không có QR thật — dùng QR giả${c.reset}`);
  }
  console.log();

  console.log(`${c.bold}Simulating ${NUM_DEVICES} devices over ~10s...${c.reset}\n`);
  let done = 0;
  const t0 = Date.now();

  await Promise.all(
    Array.from({ length: NUM_DEVICES }, (_, i) =>
      simulateDevice(i, accounts, qrCodes)
        .then(() => { done++; process.stdout.write(`\rProgress: ${done}/${NUM_DEVICES} (${Math.round(done/NUM_DEVICES*100)}%)   `); })
        .catch(() => { done++; })
    )
  );

  const totalMs = Date.now() - t0;
  console.log('\n');

  // ── Kết quả ───────────────────────────────────────────────
  console.log(`${c.bold}=== KẾT QUẢ ===${c.reset}\n`);

  const rows = [
    ['Login',   stats.login],
    ['Browse',  stats.browse],
    ['Scan QR', stats.scan],
  ];

  const col1=12, col2=8, col3=8, col4=10, col5=10, col6=10;
  console.log(c.bold+'Action'.padEnd(col1)+'OK'.padStart(col2)+'FAIL'.padStart(col3)+'AVG ms'.padStart(col4)+'P95 ms'.padStart(col5)+'MAX ms'.padStart(col6)+c.reset);
  console.log('-'.repeat(col1+col2+col3+col4+col5+col6));

  for (const [name, s] of rows) {
    const total = s.ok + s.fail;
    const rate  = total > 0 ? Math.round(s.ok/total*100) : 0;
    const col   = rate>=95?c.green:rate>=80?c.yellow:c.red;
    const mx    = maxv(s.lat);
    console.log(
      name.padEnd(col1)+
      col+String(s.ok).padStart(col2)+c.reset+
      (s.fail>0?c.red:c.gray)+String(s.fail).padStart(col3)+c.reset+
      String(avg(s.lat)).padStart(col4)+
      String(p95(s.lat)).padStart(col5)+
      (mx>2000?c.red:mx>1000?c.yellow:c.gray)+String(mx).padStart(col6)+c.reset
    );
  }
  console.log('-'.repeat(col1+col2+col3+col4+col5+col6));

  const loginRate = stats.login.ok + stats.login.fail > 0
    ? Math.round(stats.login.ok/(stats.login.ok+stats.login.fail)*100) : 0;
  const scanRate  = stats.scan.ok + stats.scan.fail > 0
    ? Math.round(stats.scan.ok/(stats.scan.ok+stats.scan.fail)*100) : 0;
  const totalScans = stats.scan.ok + stats.scan.fail;

  console.log(`\n${c.bold}Summary:${c.reset}`);
  console.log(`  Thiết bị hoàn thành : ${stats.login.ok}/${NUM_DEVICES}`);
  console.log(`  Tổng QR đã quét     : ${totalScans} (avg ${avg(stats.scan.lat)}ms/scan)`);
  console.log(`  Login success rate  : ${loginRate>=95?c.green:c.yellow}${loginRate}%${c.reset}`);
  console.log(`  Scan success rate   : ${scanRate>=95?c.green:c.yellow}${scanRate}%${c.reset}`);
  console.log(`  Thời gian tổng      : ${(totalMs/1000).toFixed(1)}s`);
  console.log(`  Scan throughput     : ${c.bold}${(totalScans/(totalMs/1000)).toFixed(1)} scan/s${c.reset}`);

  console.log();
  if (loginRate >= 95 && scanRate >= 90) {
    console.log(`${c.green}${c.bold}✅ Server sẵn sàng cho ${NUM_DEVICES} thiết bị thật đồng thời!${c.reset}`);
    console.log(`${c.cyan}💡 Thử tăng: node test_realistic.cjs ${NUM_DEVICES+100} ${HOST} ${ADMIN_USER} ${ADMIN_PASS}${c.reset}`);
  } else if (loginRate >= 80) {
    console.log(`${c.yellow}${c.bold}⚠️  Server chịu được nhưng có nguy cơ chậm lúc cao điểm.${c.reset}`);
  } else {
    console.log(`${c.red}${c.bold}❌ Server cần tối ưu thêm trước khi deploy ${NUM_DEVICES} thiết bị.${c.reset}`);
  }
  console.log();
}

main().catch(console.error);
