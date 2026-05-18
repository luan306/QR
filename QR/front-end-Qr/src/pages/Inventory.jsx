import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import RoundStatusBanner from '../components/RoundStatusBanner';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTranslation } from "react-i18next";

export default function Inventory() {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();

  const [assets,       setAssets]       = useState([]);
  const [activeRound,  setActiveRound]  = useState(null);
  const [roundStatus,  setRoundStatus]  = useState('loading');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [deviceTypes,  setDeviceTypes]  = useState([]);

  const loadDevices = useCallback(async () => {
    try {
      const roundRes  = await fetch('/api/inventory-rounds');
      const roundJson = await roundRes.json().catch(() => []);
      const rounds    = Array.isArray(roundJson) ? roundJson : (roundJson?.data ?? []);
      const active    = rounds.find(r => r.status === 'active');

      if (!active) {
        const hasEnded = rounds.some(r => r.status === 'completed' || r.status === 'closed');
        setRoundStatus(hasEnded ? 'ended' : 'none');
        setActiveRound(null);
        setAssets([]);
        return;
      }

      setActiveRound(active);
      setRoundStatus('active');

      const itemsRes  = await fetch(`/api/inventory-rounds/${active.id}/items`);
      const itemsData = await itemsRes.json().catch(() => []);
      const items     = Array.isArray(itemsData) ? itemsData : (itemsData?.data ?? []);

      // QR nào user này đã quét
      const myScannedQRs = new Set(
        items
          .filter(d =>
            d.audited &&
            (d.scanned_by_name === currentUser?.full_name ||
             d.audited_by      === currentUser?.id ||
             d.audited_by_name === currentUser?.full_name)
          )
          .map(d => d.qr_code)
      );

      let mapped = items.map((d) => {
        const scanned  = d.audited === 1 || d.audited === true;
        const isNew    = !scanned && (d.is_new === 1 || d.is_new === true);
        const iScanned = myScannedQRs.has(d.qr_code);

        // Bộ phận đã quét (từ đúng field API trả về)
        const scannedByDept   = d.scanned_dept_name || null;
        const scannedByDeptId = d.scanned_dept_id   || null;

        // Màu cam: đã quét bởi bộ phận KHÁC với bộ phận sở hữu thiết bị
        const isScannedByOtherDept =
          scanned &&
          scannedByDeptId &&
          d.department_id &&
          String(scannedByDeptId) !== String(d.department_id);

        return {
          id:                 d.id,
          name:               d.device_name      || 'N/A',
          qr:                 d.qr_code          || 'N/A',
          device_type:        d.device_type_name || d.device_type || 'N/A',
          dept:               d.department_name  || 'N/A',
          department_id:      d.department_id    || null,
          note:               d.location         || '',
          pic:                d.pic              || null,
          scanned,
          isNew,
          iScanned,
          scannedByDept,
          scannedByDeptId,
          isScannedByOtherDept,
        };
      });

      if (currentUser?.role && currentUser.role !== 'admin') {
        mapped = mapped.filter((a) =>
          String(a.department_id) === String(currentUser.department_id) || a.iScanned
        );
      }

      setAssets(mapped);
    } catch (err) {
      console.error('[Inventory] loadDevices error:', err);
      setAssets([]);
    }
  }, [currentUser]);

  useEffect(() => {
    fetch('/api/device-types').then(r => r.json()).then(setDeviceTypes).catch(() => {});
    loadDevices();
  }, [loadDevices]);

  const downloadScans = async () => {
    try {
      const res  = await fetch('/api/scans/export');
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { alert('⚠️ ' + t("no_data_found")); return; }
      const XLSX = await import('xlsx');
      const rows = [[t("qr_code"), t("device_name"), t("department"), t("scanned_at"), t("scanned_by"), t("time")]];
      data.forEach(s => rows.push([s.qr_code||'N/A', s.device_name||'N/A', s.device_department||'N/A', s.scan_department||'N/A', s.user_name||'N/A', s.scanned_at||'N/A']));
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Scans');
      XLSX.writeFile(wb, t("scanned_file_name") + ".xlsx");
    } catch { alert('❌ ' + t("file_download_error")); }
  };

  const filtered = assets.filter((a) => {
    const matchType   = !typeFilter || a.device_type === typeFilter;
    const matchStatus =
      statusFilter === 'all'         ||
      (statusFilter === 'scanned'     &&  a.scanned)             ||
      (statusFilter === 'not_scanned' && !a.scanned && !a.isNew) ||
      (statusFilter === 'new'         &&  a.isNew);
    const matchSearch =
      (a.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.qr   || '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchStatus && matchSearch;
  });

  const stats = {};
  filtered.forEach((a) => (stats[a.dept] = (stats[a.dept] || 0) + 1));

  const StatusBadge = ({ asset }) => {
    if (asset.scanned) return <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-400 text-green-900">✅ {t("scanned")}</span>;
    if (asset.isNew)   return <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-400 text-blue-900">🆕 {t("new_device")}</span>;
    return <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-400 text-red-900">❌ {t("not_scanned")}</span>;
  };

  // Chọn màu card
  const cardBg = (a) => {
    if (a.isNew)                return 'bg-gradient-to-r from-blue-400 to-cyan-500 text-white';
    if (a.isScannedByOtherDept) return 'bg-gradient-to-r from-orange-400 to-amber-500 text-white';
    return 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white';
  };

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />
      <main className="flex-1 p-4 pb-20 overflow-auto">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">📋 {t("inventory_title")}</h2>

        {roundStatus === 'loading' && (
          <div className="text-center text-gray-400 py-6">Đang kiểm tra đợt kiểm kê...</div>
        )}
        <RoundStatusBanner roundStatus={roundStatus} />
        {roundStatus === 'active' && activeRound && (
          <div className="mb-3 bg-green-50 border border-green-200 rounded-xl p-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-green-700">📋 {activeRound.name}</span>
            <span className="ml-auto text-xs text-green-600">
              {assets.filter(a => a.scanned).length}/{assets.length} đã quét
              {assets.filter(a => a.isNew).length > 0 && <span className="ml-2 text-blue-600">· {assets.filter(a => a.isNew).length} mới</span>}
            </span>
          </div>
        )}

        {roundStatus === 'active' && <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:space-x-2 mb-3">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="flex-1 p-3 rounded-xl border shadow mb-2 sm:mb-0">
              <option value="">-- {t("all_device_types")} --</option>
              {deviceTypes.map(dt => <option key={dt.id} value={dt.name}>{dt.name}</option>)}
            </select>
            <input type="text" placeholder={`🔍 ${t("search")}`} value={search} onChange={e => setSearch(e.target.value)} className="flex-1 p-3 rounded-xl border shadow" />
          </div>

          {/* Status filter buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => setStatusFilter('scanned')}     className="flex-1 px-4 py-2 bg-green-200 text-green-700 rounded-xl shadow hover:bg-green-300">📗 {t("scanned")}</button>
            <button onClick={() => setStatusFilter('not_scanned')} className="flex-1 px-4 py-2 bg-red-200 text-red-700 rounded-xl shadow hover:bg-red-300">📕 {t("not_scanned")}</button>
            <button onClick={() => setStatusFilter('new')}         className="flex-1 px-4 py-2 bg-blue-200 text-blue-700 rounded-xl shadow hover:bg-blue-300">🆕 {t("new_device")}</button>
            <button onClick={() => setStatusFilter('all')}         className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-xl shadow hover:bg-gray-300">{t("all")}</button>
            <button onClick={downloadScans}                        className="px-4 py-2 bg-green-600 text-white rounded-xl shadow">📥 {t("download_scans")}</button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {Object.entries(stats).length > 0
              ? Object.entries(stats).map(([dept, count]) => (
                  <div key={dept} className="bg-indigo-100 p-3 rounded-xl shadow text-center">
                    <div className="font-bold text-indigo-600">{dept}</div>
                    <div className="text-lg">{count} {t("devices")}</div>
                  </div>
                ))
              : <div className="text-sm text-gray-500">{t("no_data_found")}</div>}
          </div>

          {/* List */}
          <div className="space-y-4">
            {filtered.length > 0
              ? filtered.map((a) => (
                  <div key={a.qr} className={`p-4 rounded-2xl shadow-md flex justify-between items-start ${cardBg(a)}`}>

                    {/* Nội dung — căn trái */}
                    <div className="text-left">
                      <div className="text-lg font-bold">
                        {a.name}
                        {a.device_type && a.device_type !== 'N/A' && (
                          <span className="text-sm font-medium"> ({a.device_type})</span>
                        )}
                        {a.isNew && (
                          <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">Mới thêm</span>
                        )}
                      </div>
                      <div className="text-xs opacity-90">{t("qr_code")}: {a.qr}</div>
                      <div className="text-xs opacity-90">{t("department")}: {a.dept}</div>
                      {a.pic && (
                        <div className="text-xs opacity-90">👤 PIC: {a.pic}</div>
                      )}
                      {a.note && (
                        <div className="text-xs opacity-90">{a.note}</div>
                      )}

                      {/* Cảnh báo đã quét bởi bộ phận khác */}
                      {a.isScannedByOtherDept && (
                        <div className="mt-1.5 inline-flex items-center gap-1 bg-white/25 rounded-lg px-2 py-0.5 text-xs font-semibold">
                          🔄 Đã quét bởi: <span className="bg-white/30 px-1.5 py-0.5 rounded-md">📍 {a.scannedByDept || 'Bộ phận khác'}</span>
                        </div>
                      )}
                    </div>

                    {/* Badge */}
                    <div className="ml-4 flex-shrink-0">
                      <StatusBadge asset={a} />
                    </div>
                  </div>
                ))
              : <div className="text-sm text-gray-500">{t("no_devices_found")}</div>}
          </div>
        </>}
      </main>
      <BottomNav currentUser={currentUser} />
    </div>
  );
}