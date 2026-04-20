import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import Toast from '../components/Toast';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useDropdowns } from '../hooks/useDropdowns';
import { useToast } from '../hooks/useToast';

const DUPLICATE_WINDOW_MS = 1500;

export default function Audit() {
  const { currentUser }    = useCurrentUser();
  const { departments }    = useDropdowns();
  const { toast, showSuccess, showError } = useToast();

  const [selectedDept,   setSelectedDept]   = useState('');
  const [auditDeptId,    setAuditDeptId]     = useState(null);
  const [auditSessionId, setAuditSessionId]  = useState(null);
  const [auditDeptName,  setAuditDeptName]   = useState('');
  const [sessionTime,    setSessionTime]     = useState('');
  const [running,        setRunning]         = useState(false);
  const [auditDevices,   setAuditDevices]    = useState([]);
  const [showDeviceList, setShowDeviceList]  = useState(false);

  const recentScans = useRef(new Map());
  const scanBuffer  = useRef('');
  const lastInput   = useRef(Date.now());

  const canProcess   = (qr) => { const t = recentScans.current.get(qr); return !t || Date.now() - t > DUPLICATE_WINDOW_MS; };
  const markProcessed = (qr) => recentScans.current.set(qr, Date.now());

  // ── Counters ────────────────────────────────────────────────
  const scannedCount  = auditDevices.filter((d) => d.scanned).length;
  const remaining     = auditDevices.length - scannedCount;
  const progressPct   = auditDevices.length > 0 ? Math.round((scannedCount / auditDevices.length) * 100) : 0;

  // ── Load devices for dept ───────────────────────────────────
  const loadAuditDevices = useCallback(async (deptId, sessionId) => {
    try {
      const res  = await fetch('/api/devices');
      const data = await res.json();
      let devices = Array.isArray(data)
        ? data.filter((d) => String(d.department_id) === String(deptId)).map((d) => ({ ...d, scanned: false }))
        : [];

      if (sessionId) {
        try {
          const sr = await fetch(`/api/scans/session/${sessionId}`);
          if (sr.ok) {
            const scannedList = await sr.json();
            const scannedQrs  = new Set(scannedList.map((s) => s.qr_code));
            devices = devices.map((d) => ({ ...d, scanned: scannedQrs.has(d.qr_code) }));
          }
        } catch {}
      }

      setAuditDevices(devices);
      setShowDeviceList(true);
    } catch (err) {
      console.error('loadAuditDevices error', err);
    }
  }, []);

  // ── Start audit ──────────────────────────────────────────────
  const startAudit = async () => {
    if (!selectedDept) return;
    const deptName = departments.find((d) => String(d.id) === String(selectedDept))?.name || '';
    let sessionId;
    try {
      const res  = await fetch('/api/scan/start-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser?.id, department_id: selectedDept }),
      });
      const data = await res.json();
      sessionId = data.session_id || Date.now();
    } catch {
      sessionId = Date.now();
    }

    setAuditDeptId(selectedDept);
    setAuditSessionId(sessionId);
    setAuditDeptName(deptName);
    setSessionTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    setRunning(true);
    await loadAuditDevices(selectedDept, sessionId);
  };

  // ── Stop audit ───────────────────────────────────────────────
  const stopAudit = async () => {
    if (auditSessionId) {
      try {
        await fetch('/api/scan/stop-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: auditSessionId }),
        });
      } catch {}
    }
    setRunning(false);
    setAuditDeptId(null);
    setAuditSessionId(null);
    setAuditDeptName('');
    setAuditDevices([]);
    setShowDeviceList(false);
    setSelectedDept('');
  };

  // ── Mark device scanned ──────────────────────────────────────
  const markDeviceScanned = useCallback((qrCode) => {
    const normalizedQr = qrCode.includes('$') ? qrCode.split('$')[0].trim() : qrCode.trim();
    setAuditDevices((prev) =>
      prev.map((d) => {
        const dqr = (d.qr_code || d.qr || '').trim();
        if (!d.scanned && (dqr === normalizedQr || dqr === qrCode.trim())) {
          return { ...d, scanned: true };
        }
        return d;
      })
    );
  }, []);

  // ── On QR scanned during audit ───────────────────────────────
  const onQrScanned = useCallback(
    async (qr) => {
      if (!running) return;
      try {
        const res  = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser?.id, qr_code: qr, session_id: auditSessionId }),
        });
        const data = await res.json().catch(() => ({ success: false }));

        if (data?.success) {
          markDeviceScanned(qr);
          showSuccess(`✅ ${data.device_name || qr}`);
        } else if (data?.already) {
          markDeviceScanned(qr);
          showError('Đã quét trong phiên này');
        } else if (data?.not_in_list) {
          showError('Không thuộc bộ phận audit');
        } else {
          showError(data?.message || 'Không tìm thấy thiết bị');
        }
      } catch {
        showError('Lỗi kết nối server');
      }
    },
    [running, currentUser, auditSessionId, markDeviceScanned, showSuccess, showError]
  );

  // ── Hardware scanner (Zebra/DataWedge) ──────────────────────
  useEffect(() => {
    const handler = (e) => {
      const now = Date.now();
      if (now - lastInput.current > 100) scanBuffer.current = '';
      lastInput.current = now;
      if (e.key === 'Enter') {
        if (scanBuffer.current.length > 0) {
          let qr = scanBuffer.current.trim();
          if (qr.includes('$')) qr = qr.split('$')[0].trim();
          if (canProcess(qr)) { markProcessed(qr); onQrScanned(qr); }
          scanBuffer.current = '';
        }
        return;
      }
      if (e.key.length === 1) scanBuffer.current += e.key;
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onQrScanned]);

  // Preview devices when selecting dept (before starting)
  const handleDeptChange = async (deptId) => {
    setSelectedDept(deptId);
    if (!deptId) { setShowDeviceList(false); setAuditDevices([]); return; }
    if (!running) await loadAuditDevices(deptId, null);
  };

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />

      <main className="flex-1 p-4 pb-20 overflow-auto">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">🧾 Audit tài sản</h2>

        {/* Running banner */}
        {running && (
          <div className="mb-3 bg-indigo-50 border border-indigo-300 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2" />
              <span className="text-sm font-semibold text-indigo-700">Đang audit: </span>
              <span className="text-sm text-indigo-900 font-bold">{auditDeptName}</span>
            </div>
            <span className="text-xs text-gray-400">{sessionTime}</span>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl shadow space-y-3">
          <select
            value={selectedDept}
            onChange={(e) => handleDeptChange(e.target.value)}
            disabled={running}
            className="w-full p-3 rounded-xl border"
          >
            <option value="">-- Chọn bộ phận cần audit --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <div className="flex space-x-2">
            <button
              onClick={startAudit}
              disabled={running || !selectedDept}
              className="flex-1 bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
            >
              ▶️ Bắt đầu Audit
            </button>
            <button
              onClick={stopAudit}
              disabled={!running}
              className="flex-1 bg-red-500 text-white p-3 rounded-xl hover:bg-red-600 disabled:opacity-50"
            >
              ⏹ Kết thúc
            </button>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-green-100 p-3 rounded-xl text-center">
            <div className="text-2xl font-bold text-green-700">{scannedCount}</div>
            <div className="text-sm text-green-800">Đã quét</div>
          </div>
          <div className="bg-red-100 p-3 rounded-xl text-center">
            <div className="text-2xl font-bold text-red-700">{remaining}</div>
            <div className="text-sm text-red-800">Chưa quét</div>
          </div>
        </div>

        {/* Device list */}
        {showDeviceList && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-700">📋 Danh sách thiết bị cần kiểm kê</h3>
              <div className="flex gap-3 text-sm">
                <span className="text-green-600 font-semibold">✅ Đã quét: {scannedCount}</span>
                <span className="text-red-500 font-semibold">⬜ Chưa quét: {remaining}</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {auditDevices.length > 0
                ? auditDevices.map((d) => (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        d.scanned ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-gray-800 text-sm">{d.name}</div>
                        <div className="text-xs text-gray-400">
                          QR: {d.qr_code}{d.location ? ` · ${d.location}` : ''}
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          d.scanned ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {d.scanned ? '✅ Đã quét' : '⬜ Chưa quét'}
                      </span>
                    </div>
                  ))
                : <p className="text-gray-400 text-sm text-center py-4">Không có thiết bị nào</p>}
            </div>
          </div>
        )}
      </main>

      <BottomNav currentUser={currentUser} />
      <Toast {...toast} />

      <audio id="beep-sound" preload="auto">
        <source src="https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg" type="audio/ogg" />
      </audio>
    </div>
  );
}