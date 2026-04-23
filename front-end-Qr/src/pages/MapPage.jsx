import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useCurrentUser } from '../hooks/useCurrentUser';

const toArray = (d) => Array.isArray(d) ? d : d?.data ?? [];
const FLOORS  = [{ value: 0, label: 'Tầng trệt' }, { value: 1, label: 'Tầng 1' }];

// ── Camera Scanner (dùng qr-scanner như Scan.jsx) ──────────────
function CameraScanner({ onScanned, onClose }) {
  const videoRef   = useRef(null);
  const scannerRef = useRef(null);
  const recentScans = useRef(new Map());

  useEffect(() => {
    let started = false;

    (async () => {
      const { default: QrScanner } = await import('qr-scanner');
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          let qr = String(typeof result === 'string' ? result : result.data || result).trim();
          if (!qr) return;
          if (qr.includes('$')) qr = qr.split('$')[0].trim();
          // chống duplicate
          const last = recentScans.current.get(qr);
          if (last && Date.now() - last < 1500) return;
          recentScans.current.set(qr, Date.now());
          onScanned(qr);
        },
        { highlightScanRegion: true, returnDetailedScanResult: false }
      );
      try {
        await scannerRef.current.start();
        started = true;
      } catch {
        alert('Không thể truy cập camera. Hãy kiểm tra quyền camera hoặc mở trên HTTPS.');
        onClose();
      }
    })();

    return () => {
      if (scannerRef.current) scannerRef.current.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center gap-4">
      <div className="text-white font-semibold text-sm tracking-wide">📷 Đưa QR code vào khung</div>

      <div className="relative rounded-2xl overflow-hidden bg-black"
        style={{ width: 300, height: 300 }}>
        <video ref={videoRef} className="w-full h-full object-cover block" playsInline muted />
        {/* scan line animation */}
        <div className="absolute left-0 w-full h-[3px] pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, rgba(0,255,150,0.9), rgba(0,200,255,0.9))',
            animation: 'scanline 2s linear infinite',
          }} />
      </div>

      <button onClick={onClose}
        className="px-8 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">
        ✕ Đóng camera
      </button>

      <style>{`@keyframes scanline { 0% { top: 0%; } 100% { top: 100%; } }`}</style>
    </div>
  );
}

// ── Zoomable Map ───────────────────────────────────────────────
function ZoomableMap({ imageUrl, devices, highlightId, pinMode, onMapClick, onPinClick }) {
  const imgRef  = useRef(null);
  const [scale,  setScale]  = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgW,   setImgW]   = useState(1);
  const [imgH,   setImgH]   = useState(1);
  const panning     = useRef(false);
  const lastTouch   = useRef({ x: 0, y: 0 });
  const lastPinDist = useRef(null);

  const onLoad = () => { if (imgRef.current) { setImgW(imgRef.current.offsetWidth); setImgH(imgRef.current.offsetHeight); } };

  const onTouchStart = (e) => {
    if (e.touches.length===1) { panning.current=true; lastTouch.current={x:e.touches[0].clientX,y:e.touches[0].clientY}; }
    lastPinDist.current=null;
  };
  const onTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length===2) {
      const dist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      if (lastPinDist.current) setScale(s=>Math.min(5,Math.max(0.5,s*(dist/lastPinDist.current))));
      lastPinDist.current=dist;
    } else if (e.touches.length===1 && panning.current) {
      setOffset(o=>({x:o.x+e.touches[0].clientX-lastTouch.current.x,y:o.y+e.touches[0].clientY-lastTouch.current.y}));
      lastTouch.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
    }
  };
  const onTouchEnd = () => { panning.current=false; lastPinDist.current=null; };
  const onWheel    = (e) => { e.preventDefault(); setScale(s=>Math.min(5,Math.max(0.5,s-e.deltaY*0.001))); };
  const handleClick = (e) => {
    if (!pinMode||!imgRef.current) return;
    const rect=imgRef.current.getBoundingClientRect();
    onMapClick(((e.clientX-rect.left)/rect.width)*100,((e.clientY-rect.top)/rect.height)*100);
  };
  const pctToPx = (px,py)=>({x:(px/100)*imgW,y:(py/100)*imgH});

  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden"
      style={{height:380,touchAction:'none'}}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onWheel={onWheel} onClick={handleClick}>
      {pinMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none whitespace-nowrap shadow">
          Tap vào đúng vị trí thiết bị trên bản đồ
        </div>
      )}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1">
        <button onClick={e=>{e.stopPropagation();setScale(s=>Math.min(5,s+0.5));}} className="w-9 h-9 bg-white/90 rounded-lg shadow text-gray-700 font-bold text-lg hover:bg-white">+</button>
        <button onClick={e=>{e.stopPropagation();setScale(1);setOffset({x:0,y:0});}} className="w-9 h-9 bg-white/90 rounded-lg shadow text-gray-500 text-xs hover:bg-white">⌂</button>
        <button onClick={e=>{e.stopPropagation();setScale(s=>Math.max(0.5,s-0.5));}} className="w-9 h-9 bg-white/90 rounded-lg shadow text-gray-700 font-bold text-lg hover:bg-white">−</button>
      </div>
      <div style={{transform:`translate(calc(-50% + ${offset.x}px),calc(-50% + ${offset.y}px)) scale(${scale})`,transformOrigin:'center',position:'absolute',top:'50%',left:'50%'}}>
        <img ref={imgRef} src={imageUrl} alt="layout"
          className={`block max-w-none ${pinMode?'cursor-crosshair':'cursor-grab'}`}
          style={{width:600,maxWidth:'none'}} onLoad={onLoad} draggable={false} />
        {devices.map(dev => {
          if (dev.pos_x==null) return null;
          const {x,y}=pctToPx(dev.pos_x,dev.pos_y);
          const isHL=dev.id===highlightId;
          const color=isHL?'#f59e0b':'#6366f1';
          return (
            <div key={dev.id} className="absolute -translate-x-1/2 -translate-y-full z-10" style={{left:x,top:y}}
              onClick={e=>{e.stopPropagation();onPinClick(dev);}}>
              <div className="flex flex-col items-center cursor-pointer">
                <div className={`rounded-full border-2 border-white shadow-lg flex items-center justify-center ${isHL?'w-10 h-10 animate-bounce':'w-7 h-7 hover:scale-110 transition-transform'}`}
                  style={{backgroundColor:color}}>
                  <span className="text-white text-xs">📦</span>
                </div>
                <div className="w-0 h-0" style={{borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:`6px solid ${color}`}} />
                {isHL && <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-0.5 whitespace-nowrap">{dev.name}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function MapPage() {
  const { currentUser } = useCurrentUser();

  const [step,        setStep]        = useState('select'); // select | scanning
  const [showCamera,  setShowCamera]  = useState(false);    // ← MỚI: bật/tắt camera
  const [factories,   setFactories]   = useState([]);
  const [workshops,   setWorkshops]   = useState([]);
  const [layouts,     setLayouts]     = useState([]);
  const [devices,     setDevices]     = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Selection
  const [selFactory,  setSelFactory]  = useState('');
  const [selWorkshop, setSelWorkshop] = useState('');
  const [selFloor,    setSelFloor]    = useState(0);

  // Pin/confirm state
  const [pinDevice,   setPinDevice]   = useState(null);
  const [confirmDev,  setConfirmDev]  = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [pinMode,     setPinMode]     = useState(false);

  // Hardware scanner (USB/Bluetooth — giữ nguyên)
  const scanBuffer  = useRef('');
  const lastInput   = useRef(Date.now());
  const recentScans = useRef(new Map());

  useEffect(() => {
    Promise.all([
      fetch('/api/factories').then(r=>r.json()).catch(()=>[]),
      fetch('/api/workshops').then(r=>r.json()).catch(()=>[]),
      fetch('/api/layouts/enabled').then(r=>r.json()).catch(()=>[]),
      fetch('/api/devices/positions').then(r=>r.json()).catch(()=>[]),
    ]).then(([fac,ws,lay,dev]) => {
      const facArr = toArray(fac);
      const wsArr  = toArray(ws);
      const layArr = toArray(lay);
      setFactories(facArr);
      setWorkshops(wsArr);
      setLayouts(layArr);
      setDevices(toArray(dev));
      if (facArr.length) setSelFactory(String(facArr[0].id));
      setLoading(false);
    });
  }, []);

  // Derived
  const filteredWs    = workshops.filter(w => !selFactory || String(w.factory_id)===String(selFactory));
  const currentLayout = layouts.find(l => String(l.workshop_id)===String(selWorkshop) && l.floor===selFloor);
  const isLocked      = currentLayout?.locked;
  const floorDevices  = devices.filter(d => String(d.workshop_id)===String(selWorkshop) && d.floor===selFloor);

  // Hardware scanner listener (USB/BT — không đổi)
  useEffect(() => {
    if (step !== 'scanning') return;
    const handler = (e) => {
      const now = Date.now();
      if (now - lastInput.current > 100) scanBuffer.current = '';
      lastInput.current = now;
      if (e.key === 'Enter') {
        if (scanBuffer.current.length > 0) {
          let qr = scanBuffer.current.trim();
          if (qr.includes('$')) qr = qr.split('$')[0].trim();
          const last = recentScans.current.get(qr);
          if (!last || now - last > 1500) {
            recentScans.current.set(qr, now);
            handleQrScanned(qr);
          }
          scanBuffer.current = '';
        }
        return;
      }
      if (e.key.length === 1) scanBuffer.current += e.key;
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [step, devices, selWorkshop, selFloor]);

  const handleQrScanned = (qr) => {
    const dev = devices.find(d => (d.qr_code||'').trim() === qr.trim());
    if (!dev) return;
    if (dev.pos_x == null) {
      setPinDevice(dev); setPinMode(true); setConfirmDev(null); setHighlightId(null);
    } else {
      setHighlightId(dev.id); setConfirmDev(dev); setPinMode(false); setPinDevice(null);
    }
  };

  // ← MỚI: callback khi camera quét được QR
  const handleCameraScanned = useCallback((qr) => {
    setShowCamera(false);   // đóng camera
    handleQrScanned(qr);    // xử lý như bình thường
  }, [devices]);

  const handleMapClick = useCallback(async (x, y) => {
    if (!pinDevice || isLocked) return;
    const res = await fetch(`/api/devices/${pinDevice.id}/position`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor: selFloor, pos_x: x, pos_y: y, workshop_id: selWorkshop }),
    });
    if ((await res.json()).success) {
      const updated = { ...pinDevice, floor: selFloor, pos_x: x, pos_y: y, workshop_id: selWorkshop };
      setDevices(prev => prev.map(d => d.id===pinDevice.id ? updated : d));
      setHighlightId(pinDevice.id);
      setConfirmDev(updated);
      setPinDevice(null);
      setPinMode(false);
    }
  }, [pinDevice, selFloor, selWorkshop, isLocked]);

  const confirmPosition = (correct) => {
    if (correct) { setConfirmDev(null); setHighlightId(null); }
    else if (!isLocked) { setPinDevice(confirmDev); setPinMode(true); setConfirmDev(null); }
  };
  const continueScan = () => { setConfirmDev(null); setHighlightId(null); };

  const resetSelection = () => {
    setStep('select'); setShowCamera(false);
    setPinDevice(null); setPinMode(false); setConfirmDev(null); setHighlightId(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-gray-400 animate-pulse text-sm">Đang tải...</div>
    </div>
  );

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />
      <main className="flex-1 flex flex-col p-3 pb-20 gap-3 overflow-auto">

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-indigo-700">🗺️ Bản đồ xưởng</h2>
          <div className="flex items-center gap-2">
            {isLocked && <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">🔒 Đã khóa</span>}
            {step==='scanning' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block"/>Đang scan
              </span>
            )}
          </div>
        </div>

        {/* Chọn nhà máy + xưởng + tầng */}
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          {/* Nhà máy */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Nhà máy</label>
            <div className="flex flex-wrap gap-2">
              {factories.map(f => (
                <button key={f.id}
                  onClick={() => { setSelFactory(String(f.id)); setSelWorkshop(''); resetSelection(); }}
                  disabled={step==='scanning'}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selFactory===String(f.id)?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50'}`}>
                  🏭 {f.name}
                </button>
              ))}
            </div>
          </div>

          {/* Xưởng */}
          {selFactory && filteredWs.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Xưởng</label>
              <div className="flex flex-wrap gap-2">
                {filteredWs.map(w => (
                  <button key={w.id}
                    onClick={() => { setSelWorkshop(String(w.id)); resetSelection(); }}
                    disabled={step==='scanning'}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${selWorkshop===String(w.id)?'bg-indigo-100 text-indigo-700 border border-indigo-300':'bg-gray-50 text-gray-600 border border-gray-200 hover:border-indigo-300 disabled:opacity-50'}`}>
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tầng */}
          {selWorkshop && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Tầng</label>
              <div className="flex gap-2">
                {FLOORS.map(f => (
                  <button key={f.value}
                    onClick={() => { setSelFloor(f.value); resetSelection(); }}
                    disabled={step==='scanning'}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${selFloor===f.value?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nút scan */}
          {currentLayout?.image_url && (
            <div className="flex gap-2 pt-1 border-t">
              {step === 'select' ? (
                // Bước chưa scan: chỉ có nút "Bắt đầu scan"
                <button onClick={() => setStep('scanning')}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
                  ▶️ Bắt đầu scan
                </button>
              ) : (
                // Bước đang scan: nút Camera + nút Kết thúc
                <>
                  <button onClick={() => setShowCamera(true)}
                    className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600">
                    📷 Quét camera
                  </button>
                  <button onClick={resetSelection}
                    className="flex-1 py-3 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">
                    ⏹ Kết thúc
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        {currentLayout?.image_url ? (
          <ZoomableMap
            imageUrl={currentLayout.image_url}
            devices={floorDevices}
            highlightId={highlightId}
            pinMode={pinMode && !isLocked && step==='scanning'}
            onMapClick={handleMapClick}
            onPinClick={dev => {
              if (step!=='scanning') return;
              setHighlightId(dev.id); setConfirmDev(dev); setPinMode(false); setPinDevice(null);
            }}
          />
        ) : selWorkshop ? (
          <div className="bg-white rounded-xl shadow flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
            <span className="text-4xl">🗺️</span>
            <span>Chưa có layout cho tầng này</span>
            <span className="text-xs text-gray-300">Admin cần upload layout</span>
          </div>
        ) : selFactory ? (
          <div className="bg-white rounded-xl shadow flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
            <span className="text-4xl">🏗️</span>
            <span>Chọn xưởng để xem bản đồ</span>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
            <span className="text-4xl">🏭</span>
            <span>Chọn nhà máy để bắt đầu</span>
          </div>
        )}

        {/* Legend */}
        {currentLayout?.image_url && (
          <div className="flex gap-4 text-xs text-gray-400 justify-center">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-indigo-500 inline-block"/>Đã ghim</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"/>Đang xem</span>
          </div>
        )}

        {/* Panel đang ghim */}
        {pinDevice && pinMode && !isLocked && step==='scanning' && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="font-semibold text-indigo-700">📌 Ghim vị trí: {pinDevice.name}</div>
                <div className="text-xs text-indigo-400 mt-0.5">{pinDevice.device_type_name} · QR: {pinDevice.qr_code}</div>
              </div>
              <button onClick={() => { setPinMode(false); setPinDevice(null); }}
                className="text-xs text-gray-400 hover:text-gray-600 border px-3 py-1.5 rounded-lg">Bỏ qua</button>
            </div>
            <p className="text-xs text-indigo-500 mt-2">Tap lên bản đồ phía trên để đặt vị trí chính xác của thiết bị</p>
          </div>
        )}

        {/* Panel xác nhận */}
        {confirmDev && (
          <div className="bg-white rounded-xl shadow p-4 border border-indigo-100">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-bold text-gray-800">{confirmDev.name}</div>
                <div className="text-xs text-gray-400">{confirmDev.device_type_name} · {confirmDev.department_name}</div>
                <div className="text-xs text-gray-400">QR: {confirmDev.qr_code}</div>
                {confirmDev.pos_x!=null && (
                  <div className="text-xs text-indigo-500 mt-1">
                    📍 {FLOORS.find(f=>f.value===confirmDev.floor)?.label} · X:{confirmDev.pos_x?.toFixed(1)}% Y:{confirmDev.pos_y?.toFixed(1)}%
                  </div>
                )}
              </div>
              <button onClick={continueScan} className="text-gray-300 hover:text-gray-500 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-600 mb-3">Vị trí này có chính xác không?</p>
            <div className="flex gap-2 mb-2">
              <button onClick={() => confirmPosition(true)} className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600">✅ Đúng rồi</button>
              {!isLocked && <button onClick={() => confirmPosition(false)} className="flex-1 py-2.5 bg-red-100 text-red-600 rounded-xl text-sm font-medium hover:bg-red-200">❌ Sai, ghim lại</button>}
            </div>
            <button onClick={continueScan} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
              ➡️ Tiếp tục scan
            </button>
          </div>
        )}

      </main>

      {/* Camera overlay — chỉ hiện khi showCamera=true */}
      {showCamera && (
        <CameraScanner
          onScanned={handleCameraScanned}
          onClose={() => setShowCamera(false)}
        />
      )}

      <BottomNav currentUser={currentUser} />
    </div>
  );
}