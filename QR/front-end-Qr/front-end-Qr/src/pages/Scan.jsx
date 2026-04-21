import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import Toast from '../components/Toast';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useToast } from '../hooks/useToast';

const DUPLICATE_WINDOW_MS = 1500;

export default function Scan() {
  const { currentUser } = useCurrentUser();
  const { toast, showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const videoRef    = useRef(null);
  const scannerRef  = useRef(null);
  const recentScans = useRef(new Map());
  const scanBuffer  = useRef('');
  const lastInput   = useRef(Date.now());
  const auditSession = useRef(null); // Shared via context/zustand in larger apps

  const [scanning,   setScanning]   = useState(false);
  const [scanResult, setScanResult] = useState('Chưa quét mã');
  const [showAddBtn, setShowAddBtn] = useState(false);
  const [lastQr,     setLastQr]     = useState('');

  // ── QR dedup ────────────────────────────────────────────────
  const canProcess = (qr) => {
    const t = recentScans.current.get(qr);
    return !t || Date.now() - t > DUPLICATE_WINDOW_MS;
  };
  const markProcessed = (qr) => recentScans.current.set(qr, Date.now());

  // ── Process scanned QR ──────────────────────────────────────
  const onQrScanned = useCallback(
    async (qr) => {
      setScanResult(`⏳ Xử lý QR: ${qr}`);
      setShowAddBtn(false);

      try {
        const res  = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id:    currentUser?.id,
            qr_code:    qr,
            session_id: auditSession.current || null,
          }),
        });
        const data = await res.json().catch(() => ({ success: false, message: 'Dữ liệu lỗi từ server' }));

        if (data?.success) {
          setScanResult(
            `✅ ${data.device_name || '-'}\n🏢 Thuộc: ${data.device_department || '-'}\n📍 Quét tại: ${data.scan_department || '-'}\n⚡ ${data.status || ''}`
          );
          showSuccess(`✅ ${data.device_name}`);
          return;
        }
        if (data?.not_in_list) {
          setScanResult(`❌ ${data.device_name || '-'}\n${data.message}\n📍 ${data.status || ''}`);
          showError('Không thuộc bộ phận audit');
          return;
        }
        if (data?.already) {
          setScanResult(`⚠️ ${data.device_name || '-'}\n${data.message}\n📍 ${data.status || ''}`);
          showError('Đã quét trong phiên này');
          return;
        }

        const message = data?.message || 'Không tìm thấy thiết bị';
        setScanResult(`⚠️ ${message}`);
        setShowAddBtn(true);
        setLastQr(qr);
        showError(message);
      } catch {
        setScanResult('⚠️ Lỗi kết nối server');
        setShowAddBtn(true);
        setLastQr(qr);
        showError('Lỗi server');
      }
    },
    [currentUser, showSuccess, showError]
  );

  // ── Camera scanner ──────────────────────────────────────────
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
      setScanResult('🔍 Đang quét...');
    } catch {
      alert('Không thể truy cập camera. Hãy kiểm tra quyền camera hoặc mở trên HTTPS.');
    }
  };

  const stopScanner = () => {
    if (scannerRef.current && scanning) scannerRef.current.stop();
    setScanning(false);
    setScanResult('⏹ Đã dừng quét');
  };

  // ── Zebra / DataWedge hardware scanner ──────────────────────
  useEffect(() => {
    const handler = (e) => {
      const now = Date.now();
      if (now - lastInput.current > 100) scanBuffer.current = '';
      lastInput.current = now;

      if (e.key === 'Enter') {
        if (scanBuffer.current.length > 0) {
          let qr = scanBuffer.current.trim();
          if (qr.includes('$')) qr = qr.split('$')[0].trim();
          if (canProcess(qr)) {
            markProcessed(qr);
            onQrScanned(qr);
          }
          scanBuffer.current = '';
        }
        return;
      }
      if (e.key.length === 1) scanBuffer.current += e.key;
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onQrScanned]);

  // Cleanup on unmount
  useEffect(() => () => { if (scannerRef.current) scannerRef.current.stop(); }, []);

  const handleGoAdd = () => {
    navigate('/add', { state: { qr: lastQr } });
  };

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />

      <main className="flex-1 p-4 pb-20 text-center">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">📷 Quét mã QR</h2>

        {/* Video viewer */}
        <div
          className="relative mx-auto rounded-2xl overflow-hidden bg-black"
          style={{ width: 320, maxWidth: '92vw', height: 320, maxHeight: '60vh' }}
        >
          <video ref={videoRef} className="w-full h-full object-cover block" playsInline muted />
          {/* Laser animation */}
          <div
            className="absolute left-0 w-full h-[3px]"
            style={{
              background: 'linear-gradient(90deg, rgba(0,255,150,0.9), rgba(0,200,255,0.9))',
              animation: 'scan 2s linear infinite',
            }}
          />
        </div>

        {/* Result */}
        <pre className="mt-4 text-gray-700 whitespace-pre-wrap text-sm">{scanResult}</pre>

        {showAddBtn && (
          <div className="mt-4">
            <button
              onClick={handleGoAdd}
              className="px-6 py-3 bg-green-500 text-white rounded-xl shadow hover:bg-green-600"
            >
              ➕ Thêm thiết bị mới
            </button>
          </div>
        )}

        <div className="mt-4 flex justify-center space-x-3">
          <button
            onClick={startScanner}
            disabled={scanning}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl shadow hover:bg-indigo-700 disabled:opacity-50"
          >
            Bắt đầu
          </button>
          <button
            onClick={stopScanner}
            disabled={!scanning}
            className="px-6 py-3 bg-red-500 text-white rounded-xl shadow hover:bg-red-600 disabled:opacity-50"
          >
            Ngừng
          </button>
        </div>
      </main>

      <BottomNav currentUser={currentUser} />
      <Toast {...toast} />

      {/* Beep audio */}
      <audio id="beep-sound" preload="auto">
        <source src="https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg" type="audio/ogg" />
      </audio>

      {/* Laser keyframe */}
      <style>{`@keyframes scan { 0% { top: 0%; } 100% { top: 100%; } }`}</style>
    </div>
  );
}