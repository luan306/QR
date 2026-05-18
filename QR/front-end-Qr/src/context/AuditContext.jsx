import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const AuditContext = createContext(null);

const SESSION_KEY  = 'audit_session_state';
const saveSession  = (s) => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {} };
const loadSession  = ()  => { try { const s = sessionStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
const clearSession = ()  => { try { sessionStorage.removeItem(SESSION_KEY); } catch {} };

export function AuditProvider({ children }) {
  const saved = loadSession();

  const [running,        setRunning]        = useState(saved?.running        || false);
  const [auditDeptId,    setAuditDeptId]    = useState(saved?.auditDeptId    || null);
  const [auditDeptName,  setAuditDeptName]  = useState(saved?.auditDeptName  || '');
  const [auditSessionId, setAuditSessionId] = useState(saved?.auditSessionId || null);
  const [sessionTime,    setSessionTime]    = useState(saved?.sessionTime    || '');
  const [onlineUsers,    setOnlineUsers]    = useState([]);

  const socketRef   = useRef(null);
  const currentUser = useRef(null); // set từ ngoài

  // Lưu metadata (không lưu devices)
  useEffect(() => {
    if (running || auditSessionId) {
      saveSession({ running, auditDeptId, auditDeptName, auditSessionId, sessionTime });
    }
  }, [running, auditDeptId, auditDeptName, auditSessionId, sessionTime]);

  // Khởi tạo socket 1 lần
  useEffect(() => {
    const BACKEND_URL = window.location.origin;
    const socket = io(BACKEND_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      secure: true,
      rejectUnauthorized: false,
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => console.log('[Socket] connected:', socket.id));
    socket.on('connect_error', (err) => console.error('[Socket] error:', err.message));

    return () => { socket.disconnect(); };
  }, []);

  // Hàm join room
  const joinRoom = useCallback((deptId, user) => {
    const socket = socketRef.current;
    if (!socket || !deptId || !user) return;
    
    // ⭐ Ensure user name luôn có giá trị hợp lệ
    const userName = user.full_name || user.name || 'User';
    
    socket.emit('join_audit', {
      deptId,
      userId:   user.id,
      userName: userName,  // ⭐ Không bao giờ "Unknown"
    });
  }, []);

  const leaveRoom = useCallback((deptId) => {
    const socket = socketRef.current;
    if (!socket || !deptId) return;
    socket.emit('leave_audit', { deptId });
    setOnlineUsers([]);
  }, []);

  // Broadcast khi quét thành công
  const broadcastScan = useCallback((deptId, scanData) => {
    const socket = socketRef.current;
    if (!socket || !deptId) return;
    socket.emit('device_scanned', { deptId, ...scanData });
  }, []);

  // ⭐ Start audit: kiểm tra phiên cũ theo DEPARTMENT
  const startAudit = useCallback(async (selectedDept, deptName, user, forceNew = false) => {
    currentUser.current = user;
    
    try {
      const res = await fetch('/api/scan/start-audit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ 
          user_id: user.id, 
          department_id: selectedDept, 
          force_new: forceNew 
        }),
      });
      const data = await res.json();

      // ⭐ Nếu có phiên cũ của DEPARTMENT này (không phải user_id)
      if (data.has_existing && !forceNew) {
        return { 
          hasExisting: true, 
          sessionId: data.session_id, 
          scannedCount: data.scanned_count, 
          startedAt: data.started_at,
          auditorName: data.auditor_name,  // ⭐ Tên người đang audit
        };
      }

      // Tạo phiên mới thành công
      if (data.success || data.has_existing === false) {
        const sessionId = data.session_id || Date.now();
        
        setAuditDeptId(selectedDept);
        setAuditSessionId(sessionId);
        setAuditDeptName(deptName);
        setSessionTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
        setRunning(true);
        joinRoom(selectedDept, user);
        
        return { hasExisting: false, sessionId };
      }

      // Lỗi khác
      return { hasExisting: false, error: data.message };
    } catch (err) {
      console.error('startAudit error:', err);
      return { hasExisting: false, error: err.message };
    }
  }, [joinRoom]);

  // ⭐ Resume audit: tiếp tục phiên cũ
  const resumeAudit = useCallback((selectedDept, deptName, sessionId, user) => {
    currentUser.current = user;
    
    setAuditDeptId(selectedDept);
    setAuditSessionId(sessionId);
    setAuditDeptName(deptName);
    setSessionTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    setRunning(true);
    joinRoom(selectedDept, user);
  }, [joinRoom]);

  const stopAudit = useCallback(async (deptId) => {
    const sessionId = auditSessionId;

    // Leave socket room
    leaveRoom(deptId || auditDeptId);

    // Reset state ngay
    setRunning(false);
    setAuditDeptId(null);
    setAuditSessionId(null);
    setAuditDeptName('');
    setSessionTime('');
    setOnlineUsers([]);
    clearSession();

    if (sessionId) {
      try {
        await fetch('/api/scan/stop-audit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ session_id: sessionId }),
        });
      } catch {}
    }
  }, [auditSessionId, auditDeptId, leaveRoom]);

  return (
    <AuditContext.Provider value={{
      running, auditDeptId, auditDeptName, auditSessionId, sessionTime, onlineUsers,
      startAudit, resumeAudit, stopAudit, broadcastScan,
      socketRef, joinRoom,
      setOnlineUsers,
    }}>
      {children}
    </AuditContext.Provider>
  );
}

export const useAudit = () => useContext(AuditContext);