<script>
  // showTab phải ở global scope — KHÔNG đặt trong type="module"
  function showTab(tabId, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.remove('text-indigo-600');
      b.classList.add('text-gray-500');
    });

    document.querySelectorAll('[data-tab]').forEach(el => {
      el.classList.remove('text-indigo-600');
      el.classList.add('text-gray-500');
    });

    const nav = document.querySelector(`[data-tab="${tabId}"]`);
    if (nav) {
      nav.classList.add('text-indigo-600');
      nav.classList.remove('text-gray-500');
    }

    if (tabId === 'tab-inventory') {
      // renderInventory được expose ra window trong module bên dưới
      if (typeof window.renderInventory === 'function') window.renderInventory();
    }
  }

  function logout()  { window.location.href = '/logout'; }
  function goAdmin() { window.location.href = '/admin'; }
</script>

<!-- ============================================================
     FIX 2: Xóa khối try/catch thừa nằm ngoài hàm (gây SyntaxError)
             Gộp toàn bộ logic vào 1 module duy nhất, sạch sẽ
     ============================================================ -->
<script type="module">
  import QrScanner from "https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.min.js";

  // ── State ──────────────────────────────────────────────────
  let qrScanner       = null;
  let scanning        = false;
  let assets          = [];
  let statusFilter    = "all";
  let currentUser     = {};
  let auditDepartmentId = null;
  let auditSessionId    = null;   // FIX 3: khai báo thiếu trong bản gốc

  const recentScans       = new Map();
  const DUPLICATE_WINDOW_MS = 1500;

  // ── Helpers ────────────────────────────────────────────────
  function canProcessQr(qr) {
    const t = recentScans.get(qr);
    return !t || (Date.now() - t) > DUPLICATE_WINDOW_MS;
  }
  function markQrProcessed(qr) { recentScans.set(qr, Date.now()); }

  // ── Current user ───────────────────────────────────────────
  async function loadCurrentUser() {
    try {
      const res  = await fetch('/api/current-user');
      if (!res.ok) throw new Error('no current user');
      const data = await res.json();
      currentUser = data.user || data;
      if (!currentUser?.id) { window.location.href = "/login"; return; }
      document.getElementById("welcome-user").innerText =
        "👋 Xin chào, " + (currentUser.full_name || currentUser.name || 'User');
      applyRoleUI(currentUser.role);
    } catch (err) {
      console.warn('Không lấy được current user — dùng demo', err);
      currentUser = { id: 1, full_name: 'Demo User', role: 'admin' };
      document.getElementById("welcome-user").innerText = "👋 Xin chào, " + currentUser.full_name;
      applyRoleUI('admin');
    }
  }

  // ── Role-based UI ──────────────────────────────────────────
  // admin   → tất cả tab + nút Admin
  // auditor → Quét QR, Kiểm kê, Audit (KHÔNG thấy Thêm)
  // user    → Quét QR, Kiểm kê, Thêm (KHÔNG thấy Audit)
  function applyRoleUI(role) {
    const isAdmin   = role === 'admin';
    const isAuditor = role === 'auditor';
    const isUser    = role === 'user';

    // Nút Admin trên header — chỉ admin
    document.getElementById('admin-btn')?.classList.toggle('hidden', !isAdmin);

    // Tab Thêm — tất cả đều thấy (user, auditor, admin)
    document.getElementById('nav-add')?.classList.remove('hidden');

    // Tab Audit — auditor + admin, user KHÔNG thấy
    document.getElementById('nav-audit')?.classList.toggle('hidden', !(isAdmin || isAuditor));

    // Chặn user truy cập tab audit
    if (isUser) {
      document.getElementById('tab-audit')?.classList.add('hidden');
    }
  }

  // ── Scanner ────────────────────────────────────────────────
  window.startScanner = async function () {
    if (scanning) return;
    const video = document.getElementById('qr-video');
    qrScanner = new QrScanner(video, result => {
      const qr = String(typeof result === 'string' ? result : (result.data || result)).trim();
      if (!qr || !canProcessQr(qr)) return;
      markQrProcessed(qr);
      onQrScanned(qr);
    }, { highlightScanRegion: true, returnDetailedScanResult: false });

    try {
      await qrScanner.start();
      scanning = true;
      document.getElementById('scan-result').innerText = '🔍 Đang quét...';
      document.getElementById('start-btn').disabled = true;
      document.getElementById('stop-btn').disabled  = false;
    } catch (err) {
      console.error('Không thể truy cập camera', err);
      alert('Không thể truy cập camera. Hãy kiểm tra quyền camera hoặc mở trên HTTPS.');
    }
  };

  window.stopScanner = function () {
    if (qrScanner && scanning) qrScanner.stop();
    scanning = false;
    document.getElementById('scan-result').innerText = '⏹ Đã dừng quét';
    document.getElementById('start-btn').disabled = false;
    document.getElementById('stop-btn').disabled  = true;
  };

  // ── onQrScanned ────────────────────────────────────────────
  async function onQrScanned(qr) {
    document.getElementById('scan-result').innerHTML = `⏳ Xử lý QR: <b>${qr}</b>`;

    try {
      // Backend chỉ có /api/scan — dùng cho cả scan thường lẫn audit
      // Khi audit: truyền thêm session_id để backend tự lấy department_id từ audit_sessions
      const apiUrl = '/api/scan';

      const body = {
        user_id:    currentUser.id,
        qr_code:    qr,
        session_id: auditSessionId || null
      };

      const res  = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({ success: false, message: "Dữ liệu lỗi từ server" }));

      const addBtn = document.getElementById('add-new-btn');

      if (data?.success) {
        document.getElementById('scan-result').innerHTML = `
          ✅ <b>${data.device_name || "-"}</b><br>
          🏢 Thuộc: ${data.device_department || "-"}<br>
          📍 Quét tại: ${data.scan_department || "-"}<br>
          ⚡ ${data.status || ""}`;
        addBtn.classList.add('hidden');
        let asset = assets.find(a => a.qr === qr);
        if (asset) { asset.scanned = true; }
        else {
          assets.push({ qr, name: data.device_name || 'Không rõ', device_type: '-',
            dept: data.device_department || 'Chưa rõ', note: '', scanned: true });
        }
        showScanSuccess(`✅ ${data.device_name}`);
        // Cập nhật real-time danh sách audit nếu đang trong phiên audit
        if (auditDepartmentId) {
          markAuditDeviceScanned(qr);
        } else {
          // Chỉ reload inventory khi quét thường (không phải audit)
          await loadDevices();
          window.renderInventory();
        }
        return;
      }

      if (data?.not_in_list) {
        document.getElementById('scan-result').innerHTML = `
          ❌ <b>${data.device_name || "-"}</b><br>
          ${data.message}<br>📍 ${data.status || ""}`;
        addBtn.classList.add('hidden');
        showScanError("Không thuộc bộ phận audit");
        return;
      }

      if (data?.already) {
        document.getElementById('scan-result').innerHTML = `
          ⚠️ <b>${data.device_name || "-"}</b><br>
          ${data.message}<br>📍 ${data.status || ""}`;
        addBtn.classList.add('hidden');
        showScanError("Đã quét trong phiên này");
        // Vẫn đánh dấu trong danh sách nếu chưa được tick
        if (auditDepartmentId) markAuditDeviceScanned(qr);
        return;
      }

      const message = data?.message || "Không tìm thấy thiết bị";
      document.getElementById('scan-result').innerHTML = `⚠️ ${message}`;
      addBtn.classList.remove('hidden');
      document.getElementById('add-qr').value = qr;
      showScanError(message);

    } catch (err) {
      console.error('Lỗi gọi API', err);
      document.getElementById('scan-result').innerText = '⚠️ Lỗi kết nối server';
      document.getElementById('add-new-btn').classList.remove('hidden');
      document.getElementById('add-qr').value = qr;
      showScanError('Lỗi server');
    }
  }

  // ── Audit helpers ──────────────────────────────────────────
  async function updateAuditStats() {
    if (!auditSessionId) return;
    try {
      const res  = await fetch(`/api/scan/audit-summary/${auditSessionId}`);
      const data = await res.json();
      document.getElementById('audit-scanned').innerText     = data.total   || 0;
      document.getElementById('audit-not-scanned').innerText = data.correct || 0;
    } catch (err) { console.error("Lỗi stats audit", err); }
  }

  // Danh sách thiết bị audit (dùng để update real-time khi quét)
  let auditDevices = [];

  window.startAudit = async function () {
    const sel  = document.getElementById('audit-department');
    const dept = sel.value;
    if (!dept) {
      sel.classList.add('border-red-400');
      setTimeout(() => sel.classList.remove('border-red-400'), 1500);
      return;
    }
    const deptName = sel.options[sel.selectedIndex].text;

    try {
      const res  = await fetch('/api/scan/start-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, department_id: dept })
      });
      const data = await res.json();
      if (!data.success) {
        // Nếu đang có session cũ chưa kết thúc → tiếp tục session đó
        if (data.session_id) {
          auditDepartmentId = dept;
          auditSessionId    = data.session_id;
        } else {
          alert('❌ ' + (data.message || 'Không thể bắt đầu audit'));
          return;
        }
      } else {
        auditDepartmentId = dept;
        auditSessionId    = data.session_id;
      }
    } catch (err) {
      console.error('Lỗi start-audit', err);
      auditDepartmentId = dept;
      auditSessionId    = Date.now();
    }

    document.getElementById('audit-running-banner').classList.remove('hidden');
    document.getElementById('audit-dept-name').innerText = deptName;
    document.getElementById('audit-session-time').innerText =
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('audit-department').disabled = true;
    document.getElementById('btn-start-audit').disabled  = true;
    document.getElementById('btn-stop-audit').disabled   = false;

    // Load danh sách thiết bị của bộ phận
    await loadAuditDevices(auditDepartmentId);
  };

  window.stopAudit = async function () {
    if (auditSessionId) {
      try {
        await fetch('/api/scan/stop-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: auditSessionId })
        });
      } catch (err) { console.error('Lỗi stop-audit', err); }
    }

    auditDepartmentId = null;
    auditSessionId    = null;
    auditDevices      = [];

    document.getElementById('audit-running-banner').classList.add('hidden');
    document.getElementById('audit-device-list').classList.add('hidden');
    document.getElementById('audit-device-table').innerHTML = '';
    document.getElementById('audit-department').disabled = false;
    document.getElementById('btn-start-audit').disabled  = false;
    document.getElementById('btn-stop-audit').disabled   = true;
    document.getElementById('audit-scanned').innerText     = "0";
    document.getElementById('audit-not-scanned').innerText = "0";
    document.getElementById('audit-count-scanned').innerText   = "0";
    document.getElementById('audit-count-remaining').innerText = "0";
    document.getElementById('audit-progress-bar').style.width  = "0%";
  };

  async function loadAuditDevices(deptId) {
    try {
      const res  = await fetch('/api/devices');
      const data = await res.json();

      // Lọc thiết bị theo department_id
      auditDevices = Array.isArray(data)
        ? data.filter(d => String(d.department_id) === String(deptId))
        : [];

      // Nếu có session → load danh sách đã quét trong session để đánh dấu sẵn
      if (auditSessionId) {
        try {
          const sr = await fetch(`/api/scans/session/${auditSessionId}`);
          if (sr.ok) {
            const scannedList = await sr.json();
            const scannedQrs  = new Set(scannedList.map(s => s.qr_code));
            auditDevices.forEach(d => {
              if (scannedQrs.has(d.qr_code)) d.scanned = true;
            });
          }
        } catch(e) { /* Nếu API chưa có thì bỏ qua */ }
      }

      renderAuditDevices();
      document.getElementById('audit-device-list').classList.remove('hidden');
    } catch (err) {
      console.error('loadAuditDevices error', err);
    }
  }

  function renderAuditDevices() {
    const container  = document.getElementById('audit-device-table');
    const total      = auditDevices.length;
    const scannedCount = auditDevices.filter(d => d.scanned).length;

    container.innerHTML = auditDevices.map(d => `
      <div id="audit-dev-${d.id}" class="flex items-center justify-between p-3 rounded-xl border ${d.scanned ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}">
        <div>
          <div class="font-medium text-gray-800 text-sm">${d.name}</div>
          <div class="text-xs text-gray-400">QR: ${d.qr_code}${d.location ? ' · ' + d.location : ''}</div>
        </div>
        <span id="audit-dev-status-${d.id}" class="px-3 py-1 rounded-full text-xs font-semibold ${d.scanned ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">
          ${d.scanned ? '✅ Đã quét' : '⬜ Chưa quét'}
        </span>
      </div>`).join('') || '<p class="text-gray-400 text-sm text-center py-4">Không có thiết bị nào</p>';

    updateAuditCounter();
  }

  function updateAuditCounter() {
    const total        = auditDevices.length;
    const scannedCount = auditDevices.filter(d => d.scanned).length;
    const remaining    = total - scannedCount;
    const pct          = total > 0 ? Math.round(scannedCount * 100 / total) : 0;

    document.getElementById('audit-count-scanned').innerText   = scannedCount;
    document.getElementById('audit-count-remaining').innerText = remaining;
    document.getElementById('audit-progress-bar').style.width  = pct + '%';
    document.getElementById('audit-scanned').innerText         = scannedCount;
    document.getElementById('audit-not-scanned').innerText     = remaining;
  }

  // Gọi sau khi quét thành công — cập nhật row real-time
  function markAuditDeviceScanned(qrCode) {
    console.log("[AUDIT] markAuditDeviceScanned called:", qrCode);
    console.log("[AUDIT] auditDevices:", auditDevices.map(d => d.qr_code));

    // Chuẩn hoá QR giống backend (cắt $ nếu có)
    const normalizedQr = qrCode.includes('$') ? qrCode.split('$')[0].trim() : qrCode.trim();

    const device = auditDevices.find(d => {
      const dqr = (d.qr_code || d.qr || '').trim();
      return dqr === normalizedQr || dqr === qrCode.trim();
    });

    console.log("[AUDIT] matched device:", device);
    if (!device || device.scanned) return;

    device.scanned = true;

    const row = document.getElementById(`audit-dev-${device.id}`);
    if (row) {
      row.className = 'flex items-center justify-between p-3 rounded-xl border bg-green-50 border-green-200';
    }
    const statusEl = document.getElementById(`audit-dev-status-${device.id}`);
    if (statusEl) {
      statusEl.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700';
      statusEl.innerText = '✅ Đã quét';
    }
    updateAuditCounter();
  }

  // ── Toast / Sound ──────────────────────────────────────────
  function showScanSuccess(message = '✅ Quét thành công!') {
    const toast = document.getElementById('scan-success-toast');
    try { const b = document.getElementById('beep-sound'); b.currentTime = 0; b.play().catch(() => {}); } catch (e) {}
    toast.textContent = message;
    toast.style.backgroundColor = '#16a34a';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1200);
  }

  function showScanError(message = '⚠️ Lỗi') {
    const toast = document.getElementById('scan-success-toast');
    try { const b = document.getElementById('beep-sound'); b.currentTime = 0; b.play().catch(() => {}); } catch (e) {}
    toast.textContent = message;
    toast.style.backgroundColor = '#dc2626';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1500);
  }

  // ── Dropdowns ──────────────────────────────────────────────
  async function loadDropdowns() {
    try {
      const resDepts = await fetch('/api/departments');
      if (resDepts.ok) {
        const depts     = await resDepts.json();
        const deptSelect  = document.getElementById('add-department');
        const auditSelect = document.getElementById('audit-department');
        deptSelect.innerHTML  = '<option value="">-- Chọn bộ phận --</option>';
        auditSelect.innerHTML = '<option value="">-- Chọn bộ phận audit --</option>';
        depts.forEach(d => {
          [deptSelect, auditSelect].forEach(sel => {
            const opt = document.createElement('option');
            opt.value = d.id; opt.textContent = d.name;
            sel.appendChild(opt);
          });
        });
      }

      const resTypes = await fetch('/api/device-types');
      if (resTypes.ok) {
        const types     = await resTypes.json();
        const typeAdd    = document.getElementById('add-device-type');
        const typeFilter = document.getElementById('device-filter');
        typeAdd.innerHTML    = '<option value="">-- Chọn loại thiết bị --</option>';
        typeFilter.innerHTML = '<option value="">-- Tất cả loại thiết bị --</option>';
        types.forEach(t => {
          const o1 = document.createElement('option'); o1.value = t.id;   o1.textContent = t.name; typeAdd.appendChild(o1);
          const o2 = document.createElement('option'); o2.value = t.name; o2.textContent = t.name; typeFilter.appendChild(o2);
        });
      }
    } catch (err) { console.error('Lỗi loadDropdowns', err); }
  }

  // ── Devices ────────────────────────────────────────────────
  async function loadDevices() {
    try {
      const res  = await fetch('/api/devices');
      if (!res.ok) throw new Error('no devices');
      const data = await res.json();
      assets = data.map(d => ({
        id:            d.id,
        name:          d.name,
        qr:            d.qr_code,
        device_type:   d.device_type_name || '-',
        dept:          d.department_name || d.department || 'Chưa rõ',
        department_id: d.department_id || (d.department?.id) || null,
        note:          d.location || '',
        scanned:       d.status === "Đã quét" || d.status === "scanned"
      }));
      if (currentUser.role && currentUser.role !== "admin") {
        assets = assets.filter(a => a.department_id === currentUser.department_id);
      }
      window.renderInventory();
    } catch (err) {
      console.warn('Không load được devices', err);
      assets = [];
      window.renderInventory();
    }
  }

  // ── Inventory render ───────────────────────────────────────
  window.setStatusFilter = function (status) { statusFilter = status; window.renderInventory(); };

  window.renderInventory = function () {
    const val        = (document.getElementById('search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('device-filter')?.value || '';

    const filtered = assets.filter(a => {
      const matchType   = !typeFilter || a.device_type === typeFilter;
      const matchStatus = statusFilter === 'all' ||
        (statusFilter === 'scanned' && a.scanned) ||
        (statusFilter === 'not_scanned' && !a.scanned);
      const matchSearch = (a.name || '').toLowerCase().includes(val) || (a.qr || '').toLowerCase().includes(val);
      return matchType && matchStatus && matchSearch;
    });

    const stats = {};
    filtered.forEach(a => stats[a.dept] = (stats[a.dept] || 0) + 1);
    document.getElementById('stats').innerHTML = Object.entries(stats).map(([d, c]) => `
      <div class="bg-indigo-100 p-3 rounded-xl shadow text-center">
        <div class="font-bold text-indigo-600">${d}</div>
        <div class="text-lg">${c} thiết bị</div>
      </div>`).join('') || '<div class="text-sm text-gray-500">Không có dữ liệu</div>';

    document.getElementById('inventory-list').innerHTML = filtered.map(a => `
      <div class="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-4 rounded-2xl shadow-md flex justify-between items-center">
        <div class="text-left">
          <div class="text-lg font-bold">${a.name} <span class="text-sm font-medium">(${a.device_type})</span></div>
          <div class="text-xs opacity-90">Mã QR: ${a.qr}</div>
          <div class="text-xs opacity-90">Bộ phận: ${a.dept}</div>
          <div class="text-xs opacity-90">${a.note || ''}</div>
        </div>
        <div class="ml-4">
          <span class="px-3 py-1 rounded-full text-sm ${a.scanned ? 'bg-green-400 text-green-900' : 'bg-red-400 text-red-900'}">
            ${a.scanned ? 'Đã quét' : 'Chưa quét'}
          </span>
        </div>
      </div>`).join('') || '<div class="text-sm text-gray-500">Không có thiết bị</div>';
  };

  // ── Add form ───────────────────────────────────────────────
  document.getElementById('add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res  = await fetch('/api/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data?.success) {
        const deptText = document.getElementById('add-department').selectedOptions[0]?.text || '';
        const typeText = document.getElementById('add-device-type').selectedOptions[0]?.text || '';
        assets.push({ qr: payload.qr_code, name: payload.name, device_type: typeText, dept: deptText, note: payload.location || '', scanned: false });
        alert('✅ Đã thêm thiết bị!');
        e.target.reset();
        showTab('tab-inventory');
        window.renderInventory();
      } else {
        alert('❌ Lỗi thêm: ' + (data?.message || 'Unknown'));
      }
    } catch (err) {
      console.error('Lỗi khi thêm thiết bị', err);
      alert('❌ Lỗi server khi thêm thiết bị');
    }
  });

  // ── Export Excel ───────────────────────────────────────────
  window.downloadScans = async function () {
    try {
      const res  = await fetch("/api/scans/export");
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { alert("⚠️ Chưa có dữ liệu"); return; }
      const rows = [["QR Code","Tên thiết bị","Thuộc bộ phận","Quét tại","Người quét","Thời gian"]];
      data.forEach(s => rows.push([s.qr_code||"", s.device_name||"", s.device_department||"", s.scan_department||"", s.user_name||"", s.scanned_at||""]));
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Scans");
      XLSX.writeFile(wb, "DanhSachDaQuet.xlsx");
    } catch (err) { console.error(err); alert("❌ Lỗi tải file"); }
  };

  // ── Zebra DataWedge (hardware scanner) ────────────────────
  const hiddenInput = document.createElement('input');
  hiddenInput.type  = 'text';
  hiddenInput.setAttribute('readonly', '');   // FIX 5: tránh bàn phím ảo mobile
  hiddenInput.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px;';
  document.body.appendChild(hiddenInput);
  hiddenInput.focus();

  hiddenInput.addEventListener('input', e => {
    const val = e.target.value.trim();
    if (val.length > 0 && canProcessQr(val)) {
      markQrProcessed(val);
      onQrScanned(val);
    }
    e.target.value = '';
  });
  document.addEventListener('click', e => {
    const tag = e.target.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    hiddenInput.focus();
  });
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    hiddenInput.focus();
  });

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    await loadCurrentUser();
    await loadDropdowns();
    await loadDevices();
    showTab('tab-scan');
    document.getElementById('stop-btn').disabled = true;
  }

  document.getElementById('search')?.addEventListener('input', window.renderInventory);
  document.getElementById('device-filter')?.addEventListener('change', window.renderInventory);

  // Load preview danh sách thiết bị ngay khi chọn bộ phận audit
  document.getElementById('audit-department')?.addEventListener('change', async function() {
    const deptId = this.value;
    if (!deptId) {
      document.getElementById('audit-device-list').classList.add('hidden');
      auditDevices = [];
      return;
    }
    await loadAuditDevices(deptId);
  });

  init();
</script>