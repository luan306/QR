import { useState, useEffect, useRef, useCallback } from 'react';

const toArray = (d) => Array.isArray(d) ? d : d?.data ?? [];
const API = '/api';
const FLOORS = [{ value: 0, label: 'Tầng trệt' }, { value: 1, label: 'Tầng 1' }];

async function pdfToBase64(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
  ).toString();
  const pdf      = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page     = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/png');
}

function SearchPosition() {
  const [q, setQ]           = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSel]  = useState(null);
  const imgRef  = useRef(null);
  const [imgSz, setImgSz]   = useState({ w: 1, h: 1 });

  const search = async () => {
    if (!q.trim()) return;
    const data = await fetch(`${API}/devices/search-position?q=${encodeURIComponent(q)}`).then(r => r.json()).catch(() => []);
    setResults(toArray(data)); setSel(null);
  };

  const px = selected?.pos_x != null ? (selected.pos_x / 100) * imgSz.w : 0;
  const py = selected?.pos_y != null ? (selected.pos_y / 100) * imgSz.h : 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key==='Enter' && search()}
          placeholder="Tên thiết bị hoặc QR..." className="flex-1 border p-2.5 rounded-lg text-sm" />
        <button onClick={search} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Tìm</button>
      </div>
      {results.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {results.map(dev => (
            <button key={dev.id} onClick={() => setSel(dev)}
              className={`w-full text-left p-3 rounded-xl border text-sm transition-colors ${selected?.id===dev.id?'bg-indigo-50 border-indigo-300':'bg-white hover:bg-gray-50'}`}>
              <div className="font-medium text-gray-800">{dev.name}</div>
              <div className="text-xs text-gray-400">{dev.workshop_name||dev.department_name} · {FLOORS.find(f=>f.value===dev.floor)?.label||`Tầng ${dev.floor}`}</div>
              {dev.pos_x==null ? <span className="text-xs text-amber-500">⚠️ Chưa có vị trí</span>
                : <span className="text-xs text-green-600">📍 X:{dev.pos_x?.toFixed(1)}% Y:{dev.pos_y?.toFixed(1)}%</span>}
            </button>
          ))}
        </div>
      )}
      {selected?.pos_x!=null && selected?.layout_image && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
            📍 {selected.name} — {selected.workshop_name} · {FLOORS.find(f=>f.value===selected.floor)?.label}
          </div>
          <div className="relative">
            <img ref={imgRef} src={selected.layout_image} alt="layout" className="w-full h-auto block"
              onLoad={() => imgRef.current && setImgSz({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight })} />
            {imgSz.w > 1 && (
              <div className="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none" style={{ left: px, top: py }}>
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-amber-400 border-2 border-white shadow-xl flex items-center justify-center animate-bounce">
                    <span className="text-white text-sm">📦</span>
                  </div>
                  <div className="w-0 h-0" style={{ borderLeft:'5px solid transparent', borderRight:'5px solid transparent', borderTop:'7px solid #f59e0b' }} />
                  <div className="mt-1 bg-gray-900 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">{selected.name}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {selected?.pos_x==null && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">⚠️ Thiết bị chưa được ghim vị trí</div>}
    </div>
  );
}

export default function AdminMapTab() {
  const [activeTab,  setActiveTab]  = useState('layouts');
  const [factories,  setFactories]  = useState([]);
  const [workshops,  setWorkshops]  = useState([]);
  const [layouts,    setLayouts]    = useState([]);
  const [devices,    setDevices]    = useState([]);

  // Upload
  const [upFactory,  setUpFactory]  = useState('');
  const [upWorkshop, setUpWorkshop] = useState('');
  const [upFloor,    setUpFloor]    = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [converting, setConverting] = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const fileRef = useRef(null);

  // Map viewer
  const [viewWorkshop, setViewWorkshop] = useState('');
  const [viewFloor,    setViewFloor]    = useState(0);
  const [viewFactory,  setViewFactory]  = useState('');
  const [selected,     setSelected]     = useState(null);
  const [dragMode,     setDragMode]     = useState(false);
  const [zoom,         setZoom]         = useState(1);
  const [imgSize,      setImgSize]      = useState({ w: 0, h: 0 });
  const imgRef = useRef(null);

  // Manage
  const [newFactoryName, setNewFactoryName] = useState('');
  const [newWsName,      setNewWsName]      = useState('');
  const [newWsFactory,   setNewWsFactory]   = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [fac, ws, lay, dev] = await Promise.all([
      fetch(`${API}/factories`).then(r => r.json()).catch(() => []),
      fetch(`${API}/workshops`).then(r => r.json()).catch(() => []),
      fetch(`${API}/layouts`).then(r => r.json()).catch(() => []),
      fetch(`${API}/devices/positions`).then(r => r.json()).catch(() => []),
    ]);
    const facArr = toArray(fac);
    const wsArr  = toArray(ws);
    setFactories(facArr);
    setWorkshops(wsArr);
    setLayouts(toArray(lay));
    setDevices(toArray(dev));
    if (facArr.length) {
      setUpFactory(String(facArr[0].id));
      setNewWsFactory(String(facArr[0].id));
      setViewFactory(String(facArr[0].id));
    }
    if (wsArr.length) { setUpWorkshop(String(wsArr[0].id)); setViewWorkshop(String(wsArr[0].id)); }
  };

  // File select
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf') {
      setConverting(true);
      try { setPreviewUrl(await pdfToBase64(file)); }
      catch (err) { alert('Lỗi convert PDF: ' + err.message); }
      setConverting(false);
    } else {
      const reader = new FileReader();
      reader.onload = ev => setPreviewUrl(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const uploadLayout = async () => {
    if (!previewUrl)   { alert('Chọn file trước'); return; }
    if (!upWorkshop)   { alert('Chọn xưởng trước'); return; }
    setUploading(true);
    try {
      const res  = await fetch(`${API}/layouts/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: upWorkshop, floor: upFloor, image_base64: previewUrl }),
      });
      const data = await res.json();
      if (data.success) { await loadAll(); setPreviewUrl(''); if (fileRef.current) fileRef.current.value=''; alert('✅ Đã lưu layout'); }
      else alert('❌ ' + data.message);
    } catch (err) { alert('❌ ' + err.message); }
    setUploading(false);
  };

  const toggleMap = async (l) => {
    const newVal = l.map_enabled ? 0 : 1;
    const res    = await fetch(`${API}/layouts/${l.id}/toggle-map`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_enabled: newVal }),
    });
    const data = await res.json();
    if (data.success) setLayouts(prev => prev.map(x => x.id===l.id ? {...x, map_enabled: newVal} : x));
    else alert('❌ ' + data.message);
  };

  const toggleLock = async (l) => {
    const newVal = l.locked ? 0 : 1;
    const res    = await fetch(`${API}/layouts/${l.id}/toggle-lock`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: newVal }),
    });
    if ((await res.json()).success) setLayouts(prev => prev.map(x => x.id===l.id ? {...x, locked: newVal} : x));
  };

  // Map
  const onImgLoad = () => { if (imgRef.current) setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight }); };
  const pctToPx   = (px, py) => ({ x: (px/100)*imgSize.w*zoom, y: (py/100)*imgSize.h*zoom });

  const handleMapClick = useCallback(async (e) => {
    if (!dragMode || !selected || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX-rect.left)/rect.width)*100;
    const y = ((e.clientY-rect.top)/rect.height)*100;
    const res = await fetch(`${API}/devices/${selected.id}/position`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor: viewFloor, pos_x: x, pos_y: y, workshop_id: viewWorkshop }),
    });
    if ((await res.json()).success) {
      setDevices(prev => prev.map(d => d.id===selected.id ? {...d, floor: viewFloor, pos_x: x, pos_y: y, workshop_id: viewWorkshop} : d));
      setSelected(s => ({...s, floor: viewFloor, pos_x: x, pos_y: y}));
      setDragMode(false);
    }
  }, [dragMode, selected, viewFloor, viewWorkshop]);

  const clearPos = async (dev) => {
    if (!confirm(`Xóa vị trí "${dev.name}"?`)) return;
    const res = await fetch(`${API}/devices/${dev.id}/position`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor: null, pos_x: null, pos_y: null, workshop_id: null }),
    });
    if ((await res.json()).success) {
      setDevices(prev => prev.map(d => d.id===dev.id ? {...d, floor: null, pos_x: null, pos_y: null, workshop_id: null} : d));
      setSelected(null);
    }
  };

  // Manage
  const addFactory = async () => {
    if (!newFactoryName.trim()) return;
    const res = await fetch(`${API}/factories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFactoryName }) });
    if ((await res.json()).success) { setNewFactoryName(''); loadAll(); }
  };
  const delFactory = async (id) => {
    if (!confirm('Xóa nhà máy?')) return;
    await fetch(`${API}/factories/${id}`, { method: 'DELETE' }); loadAll();
  };
  const addWorkshop = async () => {
    if (!newWsName.trim() || !newWsFactory) return;
    const res = await fetch(`${API}/workshops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newWsName, factory_id: newWsFactory }) });
    if ((await res.json()).success) { setNewWsName(''); loadAll(); }
  };
  const delWorkshop = async (id, name) => {
    if (!confirm(`Xóa xưởng "${name}"?`)) return;
    await fetch(`${API}/workshops/${id}`, { method: 'DELETE' }); loadAll();
  };

  // Derived
  const filteredWs       = workshops.filter(w => !viewFactory || String(w.factory_id)===String(viewFactory));
  const currentLayout    = layouts.find(l => String(l.workshop_id)===String(viewWorkshop) && l.floor===viewFloor);
  const floorDevs        = devices.filter(d => String(d.workshop_id)===String(viewWorkshop) && d.floor===viewFloor && d.pos_x!=null);
  const unpinnedInWs     = devices.filter(d => String(d.workshop_id)===String(viewWorkshop) && d.pos_x==null);
  const upFilteredWs     = workshops.filter(w => !upFactory || String(w.factory_id)===String(upFactory));

  const TABS = [['layouts','📋 Layouts'],['map','🗺️ Map'],['search','🔍 Tìm máy'],['manage','🏭 Nhà máy & Xưởng']];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold">🗺️ Quản lý bản đồ xưởng</h2>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab===id?'bg-white shadow text-indigo-700':'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Layouts ── */}
      {activeTab==='layouts' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow p-5 space-y-4">
            <h3 className="font-semibold text-gray-700">📤 Upload layout mới</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Nhà máy</label>
                <select value={upFactory} onChange={e => { setUpFactory(e.target.value); setUpWorkshop(''); }} className="border p-2 rounded-lg text-sm">
                  <option value="">-- Chọn --</option>
                  {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Xưởng</label>
                <select value={upWorkshop} onChange={e => setUpWorkshop(e.target.value)} className="border p-2 rounded-lg text-sm">
                  <option value="">-- Chọn xưởng --</option>
                  {upFilteredWs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Tầng</label>
                <div className="flex gap-1">
                  {FLOORS.map(f => (
                    <button key={f.value} onClick={() => setUpFloor(f.value)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium ${upFloor===f.value?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <input type="file" ref={fileRef} accept="image/*,application/pdf" onChange={handleFileChange} className="border p-2 rounded-lg text-sm" />
              {converting && <span className="text-xs text-indigo-500 animate-pulse">⏳ Convert PDF...</span>}
              {previewUrl && !converting && (
                <button onClick={uploadLayout} disabled={uploading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                  {uploading ? '⏳ Đang lưu...' : '📤 Lưu layout'}
                </button>
              )}
              {previewUrl && <button onClick={() => { setPreviewUrl(''); if (fileRef.current) fileRef.current.value=''; }} className="px-3 py-2 bg-gray-100 rounded-lg text-sm">✕ Hủy</button>}
            </div>
            {previewUrl && (
              <div className="border rounded-xl overflow-hidden max-w-xs">
                <div className="bg-gray-50 px-3 py-1 text-xs text-gray-400 border-b">Xem trước</div>
                <img src={previewUrl} alt="preview" className="w-full h-auto" />
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
                <th className="p-3">Nhà máy</th><th className="p-3">Xưởng</th>
                <th className="p-3 text-center">Tầng</th><th className="p-3 text-center">Ảnh</th>
                <th className="p-3 text-center">Hiển thị map</th><th className="p-3 text-center">Khóa sửa</th>
              </tr></thead>
              <tbody>
                {layouts.length===0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">Chưa có layout</td></tr>}
                {layouts.map(l => (
                  <tr key={l.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-gray-400 text-xs">{l.factory_name||'—'}</td>
                    <td className="p-3 font-medium text-gray-700">{l.workshop_name||'—'}</td>
                    <td className="p-3 text-center text-xs text-gray-500">{FLOORS.find(f=>f.value===l.floor)?.label}</td>
                    <td className="p-3 text-center">
                      {l.image_url ? <a href={l.image_url} target="_blank" rel="noreferrer" className="text-indigo-500 text-xs hover:underline">Xem ↗</a>
                        : <span className="text-gray-300 text-xs">Chưa có</span>}
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleMap(l)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${l.map_enabled?'bg-green-100 text-green-700 hover:bg-green-200':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {l.map_enabled?'✅ Bật':'⭕ Tắt'}
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleLock(l)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${l.locked?'bg-red-100 text-red-700 hover:bg-red-200':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {l.locked?'🔒 Khóa':'🔓 Mở'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Map ── */}
      {activeTab==='map' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Nhà máy</label>
              <select value={viewFactory} onChange={e => { setViewFactory(e.target.value); setViewWorkshop(''); setSelected(null); }}
                className="border p-2 rounded-lg text-sm min-w-32">
                <option value="">-- Tất cả --</option>
                {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Xưởng</label>
              <select value={viewWorkshop} onChange={e => { setViewWorkshop(e.target.value); setSelected(null); setDragMode(false); }}
                className="border p-2 rounded-lg text-sm min-w-36">
                <option value="">-- Chọn xưởng --</option>
                {filteredWs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Tầng</label>
              <div className="flex gap-1">
                {FLOORS.map(f => (
                  <button key={f.value} onClick={() => { setViewFloor(f.value); setSelected(null); setDragMode(false); }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${viewFloor===f.value?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Zoom</label>
              <div className="flex gap-1 items-center">
                <button onClick={() => setZoom(z => Math.max(0.5,z-0.25))} className="w-8 h-8 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200">−</button>
                <span className="text-sm w-12 text-center">{Math.round(zoom*100)}%</span>
                <button onClick={() => setZoom(z => Math.min(4,z+0.25))} className="w-8 h-8 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200">+</button>
              </div>
            </div>
          </div>

          <div className="flex gap-4 flex-col lg:flex-row">
            <div className="flex-1 bg-white rounded-xl shadow overflow-auto">
              <div className={`relative select-none ${dragMode?'cursor-crosshair':'cursor-default'}`} onClick={handleMapClick}>
                {dragMode && selected && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white text-xs px-4 py-2 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
                    Tap vị trí mới cho "{selected.name}"
                  </div>
                )}
                {currentLayout?.image_url ? (
                  <img ref={imgRef} src={currentLayout.image_url} alt="layout"
                    style={{ width:`${zoom*100}%`, maxWidth:'none' }}
                    className="block" onLoad={onImgLoad} draggable={false} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm gap-2">
                    <span className="text-4xl">🗺️</span>
                    <span>{viewWorkshop ? 'Chưa có layout cho xưởng / tầng này' : 'Chọn xưởng để xem bản đồ'}</span>
                  </div>
                )}
                {currentLayout?.image_url && imgSize.w>0 && floorDevs.map(dev => {
                  const {x,y} = pctToPx(dev.pos_x, dev.pos_y);
                  const isActive = selected?.id===dev.id;
                  const color    = isActive?'#f59e0b':'#6366f1';
                  return (
                    <div key={dev.id} className="absolute z-10 -translate-x-1/2 -translate-y-full" style={{left:x,top:y}}
                      onClick={e=>{e.stopPropagation(); if(!dragMode) setSelected(dev);}}>
                      <div className="flex flex-col items-center cursor-pointer group">
                        <div className={`w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center transition-transform ${isActive?'scale-125':'group-hover:scale-110'}`}
                          style={{backgroundColor:color}}>
                          <span className="text-white text-xs">📦</span>
                        </div>
                        <div className="w-0 h-0" style={{borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:`7px solid ${color}`}} />
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
                          {dev.name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 text-xs text-gray-400 p-3 border-t justify-center">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-indigo-500 inline-block"/>Đã ghim</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"/>Đang chọn</span>
              </div>
            </div>

            <div className="w-full lg:w-60 space-y-3">
              {selected ? (
                <div className="bg-white rounded-xl shadow p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-gray-800 text-sm">{selected.name}</div>
                      <div className="text-xs text-gray-400">{selected.device_type_name}</div>
                      <div className="text-xs text-gray-400">QR: {selected.qr_code}</div>
                      {selected.pos_x!=null && <div className="text-xs text-indigo-500 mt-1">📍 {selected.pos_x?.toFixed(1)}% · {selected.pos_y?.toFixed(1)}%</div>}
                    </div>
                    <button onClick={()=>{setSelected(null);setDragMode(false);}} className="text-gray-300 hover:text-gray-500 text-lg">✕</button>
                  </div>
                  <button onClick={()=>setDragMode(d=>!d)}
                    className={`w-full py-2 rounded-lg text-sm font-medium ${dragMode?'bg-indigo-600 text-white':'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
                    {dragMode?'🎯 Tap vị trí...':'📌 Di chuyển vị trí'}
                  </button>
                  {dragMode && <button onClick={()=>setDragMode(false)} className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">Hủy</button>}
                  {selected.pos_x!=null && <button onClick={()=>clearPos(selected)} className="w-full py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">🗑️ Xóa vị trí</button>}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400 border border-dashed">Tap marker để chỉnh sửa</div>
              )}
              <div className="bg-white rounded-xl shadow p-4">
                <h3 className="font-semibold text-sm text-gray-700 mb-2">{FLOORS.find(f=>f.value===viewFloor)?.label} ({floorDevs.length})</h3>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {floorDevs.length===0 ? <p className="text-xs text-gray-400 text-center py-2">Chưa có thiết bị ghim</p>
                    : floorDevs.map(dev => (
                      <button key={dev.id} onClick={()=>{setSelected(dev);setDragMode(false);}}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selected?.id===dev.id?'bg-indigo-100 text-indigo-700':'hover:bg-gray-50 text-gray-700'}`}>
                        <div className="font-medium">{dev.name}</div>
                        <div className="text-gray-400">{dev.device_type_name}</div>
                      </button>
                    ))}
                </div>
              </div>
              {unpinnedInWs.length>0 && (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <h3 className="font-semibold text-sm text-amber-700 mb-2">⚠️ Chưa ghim ({unpinnedInWs.length})</h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {unpinnedInWs.map(dev => (
                      <button key={dev.id} onClick={()=>{setSelected(dev);setDragMode(true);}}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-amber-100 text-amber-800">
                        <div className="font-medium">{dev.name}</div>
                        <div className="text-amber-500">{dev.department_name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tìm máy ── */}
      {activeTab==='search' && (
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="font-bold text-gray-700 mb-4">🔍 Tìm vị trí thiết bị</h3>
          <SearchPosition />
        </div>
      )}

      {/* ── Nhà máy & Xưởng ── */}
      {activeTab==='manage' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Nhà máy */}
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <h3 className="font-semibold text-gray-700">🏭 Nhà máy</h3>
            <div className="flex gap-2">
              <input value={newFactoryName} onChange={e=>setNewFactoryName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addFactory()}
                placeholder="Tên nhà máy..." className="flex-1 border p-2.5 rounded-lg text-sm" />
              <button onClick={addFactory} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">+ Thêm</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {factories.map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border">
                  <span className="font-medium text-gray-700">{f.name}</span>
                  <button onClick={()=>delFactory(f.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs hover:bg-red-200">Xóa</button>
                </div>
              ))}
            </div>
          </div>

          {/* Xưởng */}
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <h3 className="font-semibold text-gray-700">🏗️ Xưởng</h3>
            <div className="flex gap-2 flex-wrap">
              <select value={newWsFactory} onChange={e=>setNewWsFactory(e.target.value)} className="border p-2 rounded-lg text-sm">
                {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <input value={newWsName} onChange={e=>setNewWsName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addWorkshop()}
                placeholder="Tên xưởng..." className="flex-1 border p-2.5 rounded-lg text-sm min-w-32" />
              <button onClick={addWorkshop} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">+ Thêm</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {workshops.map(w => (
                <div key={w.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border">
                  <div>
                    <span className="font-medium text-gray-700">{w.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{w.factory_name}</span>
                  </div>
                  <button onClick={()=>delWorkshop(w.id,w.name)} className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs hover:bg-red-200">Xóa</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}