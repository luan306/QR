import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import Toast from '../components/Toast';
import RoundStatusBanner from '../components/RoundStatusBanner';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useDropdowns } from '../hooks/useDropdowns';
import { useToast } from '../hooks/useToast';
import { useAudit } from '../context/AuditContext';
import { useTranslation } from "react-i18next";

const DUPLICATE_WINDOW_MS = 1500;

export default function Audit() {
  const { t } = useTranslation();
  const { currentUser }    = useCurrentUser();
  const { departments }    = useDropdowns();
  const { toast, showSuccess, showError } = useToast();

  const {
    running, auditDeptId, auditDeptName, auditSessionId, sessionTime, onlineUsers,
    startAudit, stopAudit, resumeAudit, broadcastScan, socketRef, joinRoom, setOnlineUsers,
  } = useAudit();

  // ── Round active ─────────────────────────────────────────
  const [activeRound,   setActiveRound]   = useState(null);
  const [roundStatus,   setRoundStatus]   = useState('loading');

  useEffect(() => {
    fetch('/api/inventory-rounds')
      .then(r => r.json())
      .then(data => {
        const list   = Array.isArray(data) ? data : (data?.data ?? []);
        const active = list.find(r => r.status === 'active') || null;
        setActiveRound(active);
        if (active) {
          setRoundStatus('active');
        } else {
          const hasEnded = list.some(r => r.status === 'completed' || r.status === 'closed');
          setRoundStatus(hasEnded ? 'ended' : 'none');
        }
      })
      .catch(() => setRoundStatus('none'));
  }, []);

  const [selectedDept,      setSelectedDept]      = useState(auditDeptId || '');
  const [compareData,       setCompareData]        = useState([]);
  const [showList,          setShowList]           = useState(false);
  const [loading,           setLoading]            = useState(false);
  const [compareTab,        setCompareTab]         = useState('all');
  const [showResumeDialog,  setShowResumeDialog]   = useState(false);
  const [resumeInfo,        setResumeInfo]         = useState(null);

  const recentScans  = useRef(new Map());
  const scanBuffer   = useRef('');
  const lastInput    = useRef(Date.now());
  const sessionIdRef = useRef(auditSessionId);
  const runningRef   = useRef(running);
  const deptIdRef    = useRef(auditDeptId);

  useEffect(() => { runningRef.current = running;     }, [running]);
  useEffect(() => { deptIdRef.current  = auditDeptId; }, [auditDeptId]);

  // ── Load compare từ server ────────────────────────────────
  const loadCompare = useCallback(async (deptId, sessionId) => {
    if (!deptId) return;
    setLoading(true);
    try {
      const [devRes, userRes, auditRes] = await Promise.all([
        fetch('/api/devices'),
        fetch(`/api/scan/user-scans/${deptId}`),
        sessionId ? fetch(`/api/scan/session/${sessionId}`) : Promise.resolve(null),
      ]);
      const devData    = await devRes.json();
      const userScans  = userRes.ok   ? await userRes.json()  : [];
      const auditScans = auditRes?.ok ? await auditRes.json() : [];

      const devices  = Array.isArray(devData) ? devData.filter(d => String(d.department_id) === String(deptId) && d.status !== 'new') : [];
      const userQrs  = new Set((Array.isArray(userScans)  ? userScans  : []).map(s => s.qr_code));
      const auditQrs = new Set((Array.isArray(auditScans) ? auditScans : []).map(s => s.qr_code));
      const auditMap = {};
      (Array.isArray(auditScans) ? auditScans : []).forEach(s => { auditMap[s.qr_code] = s; });

      const compared = devices.map(d => {
        const qr        = (d.qr_code || '').trim();
        const userDone  = userQrs.has(qr);
        const auditDone = auditQrs.has(qr);
        const auditInfo = auditMap[qr] || null;
        let matchStatus;
        if      (userDone && auditDone) matchStatus = 'match';
        else if (auditDone)             matchStatus = 'audit_only';
        else if (userDone)              matchStatus = 'user_only';
        else                            matchStatus = 'none';
        return { ...d, userDone, auditDone, matchStatus, auditInfo };
      });

      setCompareData(compared);
      setShowList(true);
    } catch (err) {
      console.error('loadCompare error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Restore session khi vào lại ──────────────────────────
  useEffect(() => {
    if (running && auditDeptId && auditSessionId) {
      setSelectedDept(String(auditDeptId));
      loadCompare(auditDeptId, auditSessionId);
      if (currentUser) joinRoom(auditDeptId, currentUser);
    }
    if (!running) { setCompareData([]); setShowList(false); }
  }, [running, auditDeptId, auditSessionId]);

  // ── Socket listeners ─────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const onDeviceScanned = ({ qr_code, device_name, scanned_by, scanned_at }) => {
      setCompareData(prev => prev.map(d => {
        if ((d.qr_code || '').trim() !== (qr_code || '').trim()) return d;
        return { ...d, auditDone: true, matchStatus: d.userDone ? 'match' : 'audit_only', auditInfo: { scanned_by, scanned_at } };
      }));
      showSuccess(`🔍 ${scanned_by} ${t('audit_just_scanned')}: ${device_name || qr_code}`);
    };
    const onRoomUsers = (users) => setOnlineUsers(users);
    socket.on('device_scanned', onDeviceScanned);
    socket.on('room_users',     onRoomUsers);
    return () => { socket.off('device_scanned', onDeviceScanned); socket.off('room_users', onRoomUsers); };
  }, []);

  // ── Thống kê ─────────────────────────────────────────────
  const matchCount     = compareData.filter(d => d.matchStatus === 'match').length;
  const auditOnlyCount = compareData.filter(d => d.matchStatus === 'audit_only').length;
  const userOnlyCount  = compareData.filter(d => d.matchStatus === 'user_only').length;
  const noneCount      = compareData.filter(d => d.matchStatus === 'none').length;
  const progressPct    = compareData.length > 0 ? Math.round((matchCount / compareData.length) * 100) : 0;

  // ── Start / Stop ─────────────────────────────────────────
  const handleStart = async () => {
    if (!selectedDept || !currentUser || !activeRound) return;
    const deptName = departments.find(d => String(d.id) === String(selectedDept))?.name || '';
    const result = await startAudit(selectedDept, deptName, currentUser);
    if (result?.hasExisting) { setResumeInfo(result); setShowResumeDialog(true); }
  };

  const handleJoinExisting = () => {
    if (!resumeInfo || !currentUser) return;
    setShowResumeDialog(false);
    const deptName = departments.find(d => String(d.id) === String(selectedDept))?.name || '';
    resumeAudit(selectedDept, deptName, resumeInfo.sessionId, currentUser);
    loadCompare(selectedDept, resumeInfo.sessionId);
    showSuccess(`${t('audit_joined')} ${resumeInfo.auditorName}`);
  };

  const handleCancelJoin = () => { setShowResumeDialog(false); setResumeInfo(null); };

  const handleStop = async () => { await stopAudit(auditDeptId); setSelectedDept(''); };

  // ── Cập nhật local khi mình quét ─────────────────────────
  const markAuditScanned = useCallback((qrCode, deviceName) => {
    const qr  = qrCode.includes('$') ? qrCode.split('$')[0].trim() : qrCode.trim();
    const now = new Date().toISOString();
    const by  = currentUser?.full_name || currentUser?.name || 'Me';
    setCompareData(prev => prev.map(d => {
      if ((d.qr_code || '').trim() !== qr) return d;
      return { ...d, auditDone: true, matchStatus: d.userDone ? 'match' : 'audit_only', auditInfo: { scanned_by: by, scanned_at: now } };
    }));
    broadcastScan(deptIdRef.current, { qr_code: qr, device_name: deviceName || qr, scanned_by: by, scanned_at: now });
  }, [currentUser, broadcastScan]);

  // ── QR scan handler — truyền round_id ───────────────────
  const onQrScanned = useCallback(async (qr) => {
    if (!runningRef.current) return;
    const sessionId = sessionIdRef.current;
    const doFetch = () => fetch('/api/scan', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_id:    currentUser?.id,
        qr_code:    qr,
        session_id: sessionId,
        round_id:   activeRound?.id ?? null,   // ← gắn với đợt
      }),
    });
    try {
      let res;
      try { res = await doFetch(); }
      catch { await new Promise(r => setTimeout(r, 800)); res = await doFetch(); }

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { success: false, message: 'Parse error: ' + text }; }

      if      (data?.success)      { markAuditScanned(qr, data.device_name); showSuccess(`✅ ${data.device_name || qr}`); }
      else if (data?.already)      { markAuditScanned(qr, data.device_name); showError('⚠️ ' + (data.message || t('already_scanned'))); }
      else if (data?.not_in_list)  { showError('❌ ' + t('not_in_audit')); }
      else                         { showError(data?.message || t('device_not_found')); }
    } catch { showError(t('server_error')); }
  }, [currentUser, activeRound, markAuditScanned, showSuccess, showError, t]);

  // ── Keyboard handler ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const now = Date.now();
      if (now - lastInput.current > 100) scanBuffer.current = '';
      lastInput.current = now;
      if (e.key === 'Enter') {
        if (scanBuffer.current.length > 0) {
          let qr = scanBuffer.current.trim();
          if (qr.includes('$')) qr = qr.split('$')[0].trim();
          const last = recentScans.current.get(qr);
          if (!last || Date.now() - last > DUPLICATE_WINDOW_MS) { recentScans.current.set(qr, Date.now()); onQrScanned(qr); }
          scanBuffer.current = '';
        }
        return;
      }
      if (e.key.length === 1) scanBuffer.current += e.key;
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onQrScanned]);

  const handleDeptChange = async (deptId) => {
    setSelectedDept(deptId);
    if (!deptId || running) return;
    await loadCompare(deptId, null);
  };

  const filteredDevices = compareData.filter(d =>
    compareTab === 'all'        ? true :
    compareTab === 'match'      ? d.matchStatus === 'match' :
    compareTab === 'user_only'  ? d.matchStatus === 'user_only' :
    compareTab === 'audit_only' ? d.matchStatus === 'audit_only' :
    compareTab === 'none'       ? d.matchStatus === 'none' : true
  ).sort((a, b) => {
    const order = { none: 0, user_only: 1, audit_only: 2, match: 3 };
    return (order[a.matchStatus] || 0) - (order[b.matchStatus] || 0);
  });

  const statusConfig = {
    match:      { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700',   icon: '✅', label: t('audit_match')       },
    user_only:  { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',       icon: '❌', label: t('audit_user_only')   },
    audit_only: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', icon: '⚠️', label: t('audit_audit_only')  },
    none:       { bg: 'bg-white',     border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-500',     icon: '⬜', label: t('audit_none')        },
  };

  const roundBlocked = roundStatus !== 'active';

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />

      <main className="flex-1 p-4 pb-20 overflow-auto">
        <h2 className="text-xl font-bold mb-4 text-[#079DD9]">🧾 {t('audit_assets')}</h2>

        {/* Banner khi không có round */}
        <RoundStatusBanner roundStatus={roundStatus} />

        {/* Banner round đang chạy */}
        {roundStatus === 'active' && activeRound && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
            <span className="font-semibold text-green-700">{t('inv_rounds_title')}:</span>
            <span className="text-green-900 font-bold truncate">{activeRound.name}</span>
          </div>
        )}

        {/* Banner phiên audit đang chạy */}
        {running && (
          <div className="mb-3 bg-[#e8f6fd] border border-[#079DD9]/30 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                <span className="text-sm font-semibold text-[#0589c0]">{t('audit_in_progress')}:</span>
                <span className="text-sm font-bold text-[#0589c0]">{auditDeptName}</span>
              </div>
              <span className="text-xs text-gray-400">{sessionTime}</span>
            </div>
            {onlineUsers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {onlineUsers.map((u, i) => (
                  <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🟢 {u.userName}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className={`bg-white p-4 rounded-xl shadow space-y-3 ${roundBlocked ? 'opacity-60 pointer-events-none' : ''}`}>
          <select
            value={selectedDept}
            onChange={e => handleDeptChange(e.target.value)}
            disabled={running || roundBlocked}
            className="w-full p-3 rounded-xl border"
          >
            <option value="">-- {t('select_department')} --</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="flex space-x-2">
            <button
              onClick={handleStart}
              disabled={running || !selectedDept || loading || roundBlocked}
              className="flex-1 bg-[#079DD9] hover:bg-[#0589c0] text-white p-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              {loading ? `⏳ ${t('inv_loading')}` : `▶️ ${t('start_audit')}`}
            </button>
            <button
              onClick={handleStop}
              disabled={!running}
              className="flex-1 bg-[#F24444] hover:bg-[#d93a3a] text-white p-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              ⏹ {t('stop_audit')}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="mt-6 flex flex-col items-center justify-center py-10 text-[#079DD9]">
            <div className="w-8 h-8 border-4 border-[#079DD9] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">{t('inv_loading_devices')}</p>
          </div>
        )}

        {/* So sánh */}
        {!loading && showList && (
          <>
            {/* Thống kê */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-green-100 p-3 rounded-xl text-center">
                <div className="text-2xl font-bold text-green-700">{matchCount}</div>
                <div className="text-xs text-green-800">✅ {t('audit_match')}</div>
              </div>
              <div className="bg-red-100 p-3 rounded-xl text-center">
                <div className="text-2xl font-bold text-red-700">{userOnlyCount}</div>
                <div className="text-xs text-red-800">❌ {t('audit_user_only')}</div>
              </div>
              <div className="bg-yellow-100 p-3 rounded-xl text-center">
                <div className="text-2xl font-bold text-yellow-700">{auditOnlyCount}</div>
                <div className="text-xs text-yellow-800">⚠️ {t('audit_audit_only')}</div>
              </div>
              <div className="bg-gray-100 p-3 rounded-xl text-center">
                <div className="text-2xl font-bold text-gray-600">{noneCount}</div>
                <div className="text-xs text-gray-600">⬜ {t('audit_none')}</div>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-[#079DD9] h-3 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="text-xs text-gray-400 text-right mt-1">{progressPct}% {t('audit_match').toLowerCase()} ({matchCount}/{compareData.length})</div>
            </div>

            {/* Tabs */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200 mt-3 text-xs">
              {[
                { key: 'all',        label: `${t('all')} (${compareData.length})`, color: 'bg-[#079DD9]' },
                { key: 'match',      label: `✅ ${matchCount}`,                    color: 'bg-green-500'  },
                { key: 'user_only',  label: `❌ ${userOnlyCount}`,                 color: 'bg-red-500'    },
                { key: 'audit_only', label: `⚠️ ${auditOnlyCount}`,                color: 'bg-yellow-500' },
                { key: 'none',       label: `⬜ ${noneCount}`,                     color: 'bg-gray-400'   },
              ].map(tab => (
                <button key={tab.key} onClick={() => setCompareTab(tab.key)}
                  className={`flex-1 py-2 font-semibold transition-colors ${compareTab === tab.key ? `${tab.color} text-white` : 'bg-white text-gray-600'}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Danh sách */}
            <div className="space-y-2 mt-3 max-h-[60vh] overflow-y-auto pr-1">
              {filteredDevices.length > 0
                ? filteredDevices.map(d => {
                    const cfg = statusConfig[d.matchStatus] || statusConfig.none;
                    return (
                      <div key={d.id} className={`p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-800 text-sm truncate">{d.name}</div>
                            <div className="text-xs text-gray-400">QR: {d.qr_code}{d.location ? ` · ${d.location}` : ''}</div>
                          </div>
                          <span className={`ml-3 flex-shrink-0 px-2 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${d.userDone ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                            👤 {t('user')}: {d.userDone ? t('scanned') : t('not_scanned')}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${d.auditDone ? 'bg-[#e8f6fd] text-[#0589c0]' : 'bg-gray-100 text-gray-400'}`}>
                            🔍 {t('audit')}: {d.auditDone ? t('audited') : t('not_audited')}
                          </span>
                          {d.auditDone && d.auditInfo?.scanned_by && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#e8f6fd] text-[#0589c0]">
                              by {d.auditInfo.scanned_by}
                              {d.auditInfo.scanned_at && ` · ${new Date(d.auditInfo.scanned_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                : <p className="text-gray-400 text-sm text-center py-6">{t('no_devices_found')}</p>
              }
            </div>
          </>
        )}
      </main>

      <BottomNav currentUser={currentUser} />
      <Toast {...toast} />

      <audio id="beep-sound" preload="auto">
        <source src="https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg" type="audio/ogg" />
      </audio>

      {/* Dialog: có người đang audit */}
      {showResumeDialog && resumeInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="text-4xl mb-2">👥</div>
              <h3 className="text-lg font-bold text-gray-800">{t('audit_session_active')}</h3>
            </div>
            <div className="bg-[#e8f6fd] rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('auditor_name')}:</span>
                <span className="font-semibold text-[#0589c0]">{resumeInfo.auditorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('scanned')}:</span>
                <span className="font-semibold">{resumeInfo.scannedCount} {t('devices')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('from_date')}:</span>
                <span className="font-semibold">
                  {resumeInfo.startedAt ? new Date(resumeInfo.startedAt).toLocaleTimeString('vi-VN') : '--'}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-600 text-center">{t('audit_join_prompt')}</p>
            <div className="flex gap-3">
              <button onClick={handleCancelJoin}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium hover:bg-gray-50">
                {t('cancel')}
              </button>
              <button onClick={handleJoinExisting}
                className="flex-1 py-3 rounded-xl bg-[#079DD9] text-white font-medium hover:bg-[#0589c0]">
                {t('audit_join_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}