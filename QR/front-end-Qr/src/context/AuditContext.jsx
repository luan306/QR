import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const AuditContext = createContext(null);

const SESSION_KEY = 'audit_session_state';
const saveSession = (state) => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch {} };
const loadSession = () => { try { const s = sessionStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
const clearSession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch {} };

export function AuditProvider({ children }) {
  const saved = loadSession();

  const [running,        setRunning]        = useState(saved?.running        || false);
  const [auditDeptId,    setAuditDeptId]    = useState(saved?.auditDeptId    || null);
  const [auditDeptName,  setAuditDeptName]  = useState(saved?.auditDeptName  || '');
  const [auditSessionId, setAuditSessionId] = useState(saved?.auditSessionId || null);
  const [sessionTime,    setSessionTime]    = useState(saved?.sessionTime    || '');
  const [auditDevices,   setAuditDevices]   = useState(saved?.auditDevices   || []);

  // Lưu lại mỗi khi state thay đổi
  useEffect(() => {
    if (running || auditSessionId) {
      saveSession({ running, auditDeptId, auditDeptName, auditSessionId, sessionTime, auditDevices });
    }
  }, [running, auditDeptId, auditDeptName, auditSessionId, sessionTime, auditDevices]);

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
      return devices;
    } catch { return []; }
  }, []);

  const startAudit = useCallback(async (selectedDept, deptName, currentUserId) => {
    let sessionId;
    try {
      const res  = await fetch('/api/scan/start-audit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user_id: currentUserId, department_id: selectedDept }),
      });
      const data = await res.json();
      sessionId  = data.session_id || Date.now();
    } catch { sessionId = Date.now(); }

    setAuditDeptId(selectedDept);
    setAuditSessionId(sessionId);
    setAuditDeptName(deptName);
    setSessionTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    setRunning(true);
    await loadAuditDevices(selectedDept, sessionId);
  }, [loadAuditDevices]);

  const stopAudit = useCallback(async () => {
    if (auditSessionId) {
      try {
        await fetch('/api/scan/stop-audit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ session_id: auditSessionId }),
        });
      } catch {}
    }
    clearSession();
    setRunning(false);
    setAuditDeptId(null);
    setAuditSessionId(null);
    setAuditDeptName('');
    setAuditDevices([]);
    setSessionTime('');
  }, [auditSessionId]);

  const markDeviceScanned = useCallback((qrCode) => {
    const normalizedQr = qrCode.includes('$') ? qrCode.split('$')[0].trim() : qrCode.trim();
    setAuditDevices((prev) =>
      prev.map((d) => {
        const dqr = (d.qr_code || d.qr || '').trim();
        return (!d.scanned && (dqr === normalizedQr || dqr === qrCode.trim()))
          ? { ...d, scanned: true } : d;
      })
    );
  }, []);

  // Restore khi app load lại
  useEffect(() => {
    if (saved?.running && saved?.auditDeptId && saved?.auditSessionId) {
      loadAuditDevices(saved.auditDeptId, saved.auditSessionId);
    }
  }, []);

  return (
    <AuditContext.Provider value={{
      running, auditDeptId, auditDeptName, auditSessionId, sessionTime,
      auditDevices, startAudit, stopAudit, markDeviceScanned, loadAuditDevices,
    }}>
      {children}
    </AuditContext.Provider>
  );
}

export const useAudit = () => useContext(AuditContext);