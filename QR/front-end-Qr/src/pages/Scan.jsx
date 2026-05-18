import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import Toast from '../components/Toast';
import RoundStatusBanner from '../components/RoundStatusBanner';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useToast } from '../hooks/useToast';
import { useAudit } from '../context/AuditContext';
import { useTranslation } from "react-i18next";

const DUPLICATE_WINDOW_MS = 1500;

// ── Popup sau mỗi lần quét ────────────────────────────────────
function ScanPopup({ result, onClose, onAddDevice }) {
  if (!result) return null;

  const isSuccess  = result.type === 'success';
  const isAlready  = result.type === 'already';
  const isNotFound = result.type === 'not_found';
  const isNotInList= result.type === 'not_in_list';
  const isError    = result.type === 'error';

  const cfg = isSuccess   ? { bg: '#f0fdf4', border: '#16a34a', icon: '✅', title: 'Quét thành công',   color: '#15803d' }
            : isAlready   ? { bg: '#fffbeb', border: '#d97706', icon: '⚠️', title: 'Đã quét trước đó', color: '#b45309' }
            : isNotFound  ? { bg: '#fef2f2', border: '#dc2626', icon: '❌', title: 'Không tìm thấy',   color: '#dc2626' }
            : isNotInList ? { bg: '#fef2f2', border: '#dc2626', icon: '❌', title: 'Không có trong danh sách', color: '#dc2626' }
            :               { bg: '#fef2f2', border: '#dc2626', icon: '⚠️', title: 'Lỗi',              color: '#dc2626' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ background: cfg.bg, border: `2px solid ${cfg.border}` }}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `1px solid ${cfg.border}30` }}>
          <span className="text-3xl">{cfg.icon}</span>
          <span className="text-base font-bold" style={{ color: cfg.color }}>{cfg.title}</span>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-2">
          {result.device_name && (
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-base flex-shrink-0">📦</span>
              <span className="font-semibold">{result.device_name}</span>
            </div>
          )}

          {result.qr && !result.device_name && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="text-base flex-shrink-0">🔍</span>
              <span className="font-mono">{result.qr}</span>
            </div>
          )}
          {result.extra && (
            <div className="text-xs text-gray-500 mt-1">{result.extra}</div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2">
          {isNotFound && onAddDevice && (
            <button
              onClick={onAddDevice}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors"
            >
              ➕ Thêm thiết bị
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
            style={{ background: cfg.color }}
            autoFocus
          >
            OK — Quét tiếp
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Scan() {
  const { t } = useTranslation();
  const navigate                           = useNavigate();
  const { currentUser }                    = useCurrentUser();
  const { toast, showSuccess, showError }  = useToast();
  const { running, auditSessionId, auditDeptId, auditDeptName, broadcastScan } = useAudit();

  const videoRef       = useRef(null);
  const scannerRef     = useRef(null);
  const recentScans    = useRef(new Map());
  const scanBuffer     = useRef('');
  const lastInput      = useRef(Date.now());
  const hiddenInputRef = useRef(null);

  const [scanning,    setScanning]    = useState(false);
  const [scanResult,  setScanResult]  = useState("");
  const [roundStatus, setRoundStatus] = useState(null);
  const [roundName,   setRoundName]   = useState('');
  const [lastQr,      setLastQr]      = useState('');
  const [activeTab,   setActiveTab]   = useState('camera');
  const [manualInput, setManualInput] = useState('');

  // ── Popup state ───────────────────────────────────────────────
  const [popup, setPopup] = useState(null); // null | { type, device_name, department, qr, extra }

  const closePopup = useCallback(() => {
    setPopup(null);
    hiddenInputRef.current?.focus({ preventScroll: true });
  }, []);

  // ── Kiểm tra đợt kiểm kê ─────────────────────────────────────
  useEffect(() => {
    const checkRound = async () => {
      try {
        const res    = await fetch('/api/inventory-rounds');
        const json   = await res.json().catch(() => []);
        const rounds = Array.isArray(json) ? json : (json.data || []);
        const active = rounds.find(r => r.status === 'active');
        if (active) { setRoundStatus('active'); setRoundName(active.name); setScanResult(t("not_scanned")); return; }
        if (!rounds.length) { setRoundStatus('none'); }
        else {
          const latest = rounds[0];
          setRoundStatus(latest.status === 'completed' || latest.status === 'closed' ? 'ended' : 'none');
        }
        setScanResult('');
      } catch { setScanResult(t("server_error")); }
    };
    checkRound();
  }, [t]);

  useEffect(() => {
    if (roundStatus !== 'active' && scanning) stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundStatus]);

  const canProcess    = (qr) => { const ts = recentScans.current.get(qr); return !ts || Date.now() - ts > DUPLICATE_WINDOW_MS; };
  const markProcessed = (qr) => recentScans.current.set(qr, Date.now());

  const onQrScanned = useCallback(async (qr) => {
    setScanResult(`⏳ ${t("processing_qr")}: ${qr}`);

    try {
      const res = await fetch('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser?.id, qr_code: qr, session_id: auditSessionId || null }),
      });

      let data;
      try { data = await res.json(); }
      catch {
        setPopup({ type: 'error', extra: t("server_error") });
        setScanResult(`⚠️ ${t("server_error")}`);
        return;
      }

      if (data?.round_no_round || data?.round_not_started) {
        setRoundStatus('none'); setScanResult('');
        setPopup({ type: 'error', extra: t("inv_round_status_none_title") }); return;
      }
      if (data?.round_completed) {
        setRoundStatus('ended'); setScanResult('');
        setPopup({ type: 'error', extra: t("inv_round_status_none_title") }); return;
      }
      if (data?.already) {
        setScanResult(`⚠️ ${t("already_scanned")}`);
        setPopup({ type: 'already', device_name: data.device_name }); return;
      }
      if (data?.success) {
        if (running) broadcastScan(auditDeptId, { qr_code: qr, device_name: data.device_name, scanned_by: currentUser?.full_name, scanned_at: new Date().toISOString() });
        setScanResult(`✅ ${t("scan_success")}: ${data.device_name || '-'}`);
        setPopup({ type: 'success', device_name: data.device_name }); return;
      }
      if (data?.not_in_list) {
        setScanResult(`❌ ${t("not_in_audit")}`);
        setPopup({ type: 'not_in_list', device_name: data.device_name }); return;
      }
      if (data?.device_not_found) {
        setScanResult(`❌ ${t("device_not_found")}: ${qr}`);
        setLastQr(qr);
        setPopup({ type: 'not_found', qr }); return;
      }
      setScanResult(`⚠️ ${data?.message || t("server_error")}`);
      setPopup({ type: 'error', extra: data?.message || t("server_error") });
    } catch {
      setScanResult(`⚠️ ${t("server_error")}`);
      setPopup({ type: 'error', extra: t("server_error") });
    }
  }, [currentUser, auditSessionId, auditDeptId, running, broadcastScan, t]);

  const startScanner = async () => {
    if (scanning) return;
    const { default: QrScanner } = await import('qr-scanner');
    const video = videoRef.current;
    scannerRef.current = new QrScanner(
      video,
      (result) => {
        const qr = String(typeof result === 'string' ? result : result.data || result).trim();
        if (!qr || !canProcess(qr)) return;
        markProcessed(qr);
        onQrScanned(qr);
      },
      { highlightScanRegion: true, returnDetailedScanResult: false }
    );
    try {
      await scannerRef.current.start();
      setScanning(true);
      setScanResult(`🔍 ${t("scanning")}`);
    } catch { alert(t("camera_error")); }
  };

  const stopScanner = () => {
    if (scannerRef.current && scanning) scannerRef.current.stop();
    setScanning(false);
    setScanResult(`⏹ ${t("stopped")}`);
  };

  // ── Hardware / keyboard wedge ─────────────────────────────────
  const refocusHidden = useCallback(() => {
    if (popup) return; // đang có popup → không refocus
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    hiddenInputRef.current?.focus({ preventScroll: true });
  }, [popup]);

  useEffect(() => {
    hiddenInputRef.current?.focus({ preventScroll: true });
    document.addEventListener('click', refocusHidden);
    document.addEventListener('touchend', refocusHidden);
    return () => {
      document.removeEventListener('click', refocusHidden);
      document.removeEventListener('touchend', refocusHidden);
    };
  }, [refocusHidden]);

  useEffect(() => {
    const BUFFER_TIMEOUT = 400;
    let bufferTimer = null;
    const flushBuffer = () => {
      let qr = scanBuffer.current.trim();
      scanBuffer.current = '';
      if (!qr) return;
      qr = qr.replace(/[\r\n\t\x00-\x1F\x7F]/g, '').trim();
      qr = qr.replace(/^[>;]+|[>;]+$/g, '').trim();
      if (qr.includes('$')) qr = qr.split('$')[0].trim();
      if (qr.length < 3) return;
      if (canProcess(qr)) { markProcessed(qr); onQrScanned(qr); }
    };
    const handler = (e) => {
      if (popup) return; // đang có popup → chặn scan mới
      if (activeTab === 'manual') return;
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); clearTimeout(bufferTimer); flushBuffer(); return; }
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
      scanBuffer.current += e.key;
      lastInput.current = Date.now();
      clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => { if (scanBuffer.current.length > 0) flushBuffer(); }, BUFFER_TIMEOUT);
    };
    const el = hiddenInputRef.current;
    el?.addEventListener('keydown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      el?.removeEventListener('keydown', handler);
      document.removeEventListener('keydown', handler);
      clearTimeout(bufferTimer);
    };
  }, [onQrScanned, activeTab, popup]);

  useEffect(() => () => { if (scannerRef.current) scannerRef.current.stop(); }, []);

  const canScan = roundStatus === 'active';
  const resultColor = scanResult.startsWith('✅') ? '#16a34a'
    : scanResult.startsWith('❌') ? '#dc2626'
    : scanResult.startsWith('⚠️') ? '#d97706'
    : '#4b5563';

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />

      <main className="flex-1 pb-20">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold text-[#079DD9] flex items-center gap-2">
            <span className="text-xl">📷</span> {t("scan_qr")}
          </h2>
          {running && canScan && (
            <div className="mt-2 bg-[#e8f6fd] border border-[#079DD9]/30 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="text-xs font-semibold text-[#0589c0]">{t("auditing")}: {auditDeptName}</span>
            </div>
          )}
          {canScan && roundName && (
            <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="text-xs font-semibold text-green-700">📋 {roundName}</span>
            </div>
          )}
        </div>

        {roundStatus === null && <div className="text-center text-gray-400 py-16">{t("checking")}</div>}
        {roundStatus !== null && !canScan && <div className="px-4 mt-2"><RoundStatusBanner roundStatus={roundStatus} /></div>}

        {canScan && (
          <>
            {/* Mobile tab switcher */}
            <div className="flex sm:hidden mx-4 mt-3 rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
              <button onClick={() => setActiveTab('camera')}
                className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'camera' ? 'bg-[#079DD9] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                📷 {t("start_scanning") || "Quét camera"}
              </button>
              <button onClick={() => setActiveTab('manual')}
                className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'manual' ? 'bg-[#079DD9] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                ⌨️ {t("or_enter_manually") || "Nhập tay"}
              </button>
            </div>

            <div className="mt-3 px-4 flex flex-col sm:flex-row gap-4 items-stretch">

              {/* Camera panel */}
              <div className={`flex-1 min-w-0 flex-col ${activeTab === 'camera' ? 'flex' : 'hidden'} sm:flex`}>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#079DD9]/5 to-transparent">
                    <span className="text-base">📷</span>
                    <span className="text-sm font-bold text-[#079DD9]">{t("start_scanning") || "Quét QR bằng camera"}</span>
                  </div>
                  <div className="flex flex-col items-center p-4 flex-1">
                    <div className="relative rounded-xl overflow-hidden bg-black w-full" style={{ aspectRatio: '1/1', maxWidth: 320 }}>
                      <video ref={videoRef} className="w-full h-full object-cover block" playsInline muted />
                      <div className="absolute left-0 w-full h-[2px]"
                        style={{ background: 'linear-gradient(90deg, rgba(0,255,150,0.9), rgba(0,200,255,0.9))', animation: scanning ? 'scan 2s linear infinite' : 'none', opacity: scanning ? 1 : 0 }} />
                      {!scanning && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-2">
                          <span className="text-4xl">📷</span>
                          <span className="text-white text-xs font-medium opacity-80">{t("start_scanning") || "Nhấn Bắt đầu"}</span>
                        </div>
                      )}
                    </div>

                    {/* Result */}
                    {scanResult && (
                      <div className="mt-3 w-full rounded-xl px-3 py-2.5 text-xs font-mono whitespace-pre-wrap leading-relaxed"
                        style={{ background: scanResult.startsWith('✅') ? '#f0fdf4' : scanResult.startsWith('❌') ? '#fef2f2' : scanResult.startsWith('⚠️') ? '#fffbeb' : '#f8fafc', border: `1px solid ${resultColor}30`, color: resultColor }}>
                        {scanResult}
                      </div>
                    )}

                    <div className="mt-4 flex gap-2 w-full">
                      <button onClick={startScanner} disabled={scanning}
                        className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow disabled:opacity-50 transition-all active:scale-95"
                        style={{ background: scanning ? '#94a3b8' : 'linear-gradient(135deg,#079DD9,#06b6d4)' }}>
                        ▶ {t("start_scanning")}
                      </button>
                      <button onClick={stopScanner} disabled={!scanning}
                        className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl shadow disabled:opacity-50 transition-all active:scale-95"
                        style={{ background: !scanning ? '#94a3b8' : 'linear-gradient(135deg,#F24444,#e11d48)' }}>
                        ■ {t("stop_scanning")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="hidden sm:flex flex-col items-center justify-center gap-2 flex-shrink-0 w-8">
                <div className="flex-1 w-px bg-gray-200" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">{t("or") || "Hoặc"}</span>
                <div className="flex-1 w-px bg-gray-200" />
              </div>

              {/* Manual panel */}
              <div className={`flex-1 min-w-0 flex-col ${activeTab === 'manual' ? 'flex' : 'hidden'} sm:flex`}>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#079DD9]/5 to-transparent">
                    <span className="text-base">⌨️</span>
                    <span className="text-sm font-bold text-[#079DD9]">{t("or_enter_manually") || "Nhập mã QR / Barcode"}</span>
                  </div>
                  <div className="flex flex-col p-4 flex-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">📟 {t("enter_qr_code") || "Nhập mã QR / Barcode"}</label>
                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#079DD9] opacity-50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                          <path d="M14 14h.01M14 18h.01M18 14h.01M18 18h.01M18 21v.01M21 18h.01" />
                        </svg>
                        <input
                          ref={hiddenInputRef}
                          tabIndex={0}
                          type="text"
                          value={manualInput}
                          onChange={e => {
                            let raw = e.target.value;
                            if (raw.includes('$')) {
                              const val = raw.split('$')[0].replace(/[\r\n\t\x00-\x1F]/g, '').trim();
                              if (val.length >= 3 && canProcess(val)) { markProcessed(val); onQrScanned(val); setManualInput(''); }
                              return;
                            }
                            setManualInput(raw);
                          }}
                          placeholder={t("scan_or_type_qr") || "Quét hoặc gõ mã vào đây…"}
                          className="w-full rounded-xl text-sm font-mono text-gray-700 placeholder-gray-300 outline-none transition-all"
                          style={{ padding: '10px 14px 10px 38px', border: '1.5px solid #e2e8f0', background: '#f8fafc' }}
                          onFocus={e => { e.currentTarget.style.border = '1.5px solid #079DD9'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(7,157,217,0.12)'; e.currentTarget.style.background = '#fff'; }}
                          onBlur={e => { e.currentTarget.style.border = '1.5px solid #e2e8f0'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#f8fafc'; }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              let val = manualInput.replace(/[\r\n\t\x00-\x1F]/g, '').trim();
                              if (val.includes('$')) val = val.split('$')[0].trim();
                              if (val && canProcess(val)) { markProcessed(val); onQrScanned(val); setManualInput(''); }
                            }
                          }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        let val = manualInput.replace(/[\r\n\t\x00-\x1F]/g, '').trim();
                        if (val.includes('$')) val = val.split('$')[0].trim();
                        if (val && canProcess(val)) { markProcessed(val); onQrScanned(val); setManualInput(''); }
                        hiddenInputRef.current?.focus();
                      }}
                      className="w-full py-2.5 rounded-xl font-bold text-white text-sm transition-all active:scale-95 hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #079DD9 0%, #06b6d4 100%)', boxShadow: '0 2px 8px rgba(7,157,217,0.3)' }}>
                      {t("submit") || "Gửi mã"}
                    </button>
                    <p className="text-xs text-gray-400 leading-relaxed">⌨️ {t("hardware_scanner_hint") || "Dùng máy quét cầm tay: đặt con trỏ vào ô rồi bóp cò"}</p>

                    {scanResult ? (
                      <div className="mt-auto rounded-xl px-3 py-2.5 text-xs font-mono whitespace-pre-wrap leading-relaxed"
                        style={{ background: scanResult.startsWith('✅') ? '#f0fdf4' : scanResult.startsWith('❌') ? '#fef2f2' : scanResult.startsWith('⚠️') ? '#fffbeb' : '#f8fafc', border: `1px solid ${resultColor}30`, color: resultColor }}>
                        {scanResult}
                      </div>
                    ) : (
                      <div className="mt-auto rounded-xl px-3 py-8 text-center border border-dashed border-gray-200 text-gray-300 text-xs">
                        {t("not_scanned") || "Chưa có kết quả"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <BottomNav currentUser={currentUser} />
      <Toast {...toast} />

      {/* ── Popup kết quả quét ─────────────────────────────────── */}
      <ScanPopup
        result={popup}
        onClose={closePopup}
        onAddDevice={popup?.type === 'not_found' ? () => navigate('/add', { state: { qr: lastQr } }) : null}
      />

      <audio id="beep-sound" preload="auto">
        <source src="https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg" type="audio/ogg" />
      </audio>
      <style>{`@keyframes scan { 0% { top: 0%; } 100% { top: 100%; } }`}</style>
    </div>
  );
}