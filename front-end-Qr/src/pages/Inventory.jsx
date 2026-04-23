import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTranslation } from "react-i18next";

export default function Inventory() {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const [assets,       setAssets]       = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [deviceTypes,  setDeviceTypes]  = useState([]);

  // Load devices
  const loadDevices = useCallback(async () => {
    try {
      const res  = await fetch('/api/devices');
      const data = await res.json();
      let mapped = data.map((d) => ({
        id:            d.id,
        name:          d.name,
        qr:            d.qr_code,
        device_type:   d.device_type_name || '-',
        dept:          d.department_name || d.department || 'Chưa rõ',
        department_id: d.department_id || d.department?.id || null,
        note:          d.location || '',
        scanned:       d.status === 'Đã quét' || d.status === 'scanned',
      }));
      if (currentUser?.role && currentUser.role !== 'admin') {
        mapped = mapped.filter((a) => a.department_id === currentUser.department_id);
      }
      setAssets(mapped);
    } catch {
      setAssets([]);
    }
  }, [currentUser]);

  // Load device types for filter
  useEffect(() => {
    fetch('/api/device-types')
      .then((r) => r.json())
      .then(setDeviceTypes)
      .catch(() => {});
    loadDevices();
  }, [loadDevices]);

  // Download scans as Excel
  const downloadScans = async () => {
    try {
      const res  = await fetch('/api/scans/export');
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { alert('⚠️ ' + t("no_data_found")); return; }

      // Dynamic import XLSX
      const XLSX = await import('xlsx');
      const rows = [[
        t("qr_code"),
        t("device_name"),
        t("department"),
        t("scanned_at"),
        t("scanned_by"),
        t("time")
      ]];
      data.forEach((s) =>
        rows.push([s.qr_code || '', s.device_name || '', s.device_department || '', s.scan_department || '', s.user_name || '', s.scanned_at || ''])
      );
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Scans');
      XLSX.writeFile(wb, t("scanned_file_name") + ".xlsx");
    } catch { alert('❌ ' + t("file_download_error")); }
  };

  // Filtered list
  const filtered = assets.filter((a) => {
    const matchType   = !typeFilter || a.device_type === typeFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'scanned' && a.scanned) ||
      (statusFilter === 'not_scanned' && !a.scanned);
    const matchSearch =
      (a.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.qr || '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchStatus && matchSearch;
  });

  // Stats by dept
  const stats = {};
  filtered.forEach((a) => (stats[a.dept] = (stats[a.dept] || 0) + 1));

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />

      <main className="flex-1 p-4 pb-20 overflow-auto">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">📋 {t("inventory_title")}</h2>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:space-x-2 mb-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex-1 p-3 rounded-xl border shadow mb-2 sm:mb-0"
          >
            <option value="">-- {t("all_device_types")} --</option>
            {deviceTypes.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder={`🔍 ${t("search")}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 p-3 rounded-xl border shadow"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setStatusFilter('scanned')}     className="flex-1 px-4 py-2 bg-green-200 text-green-700 rounded-xl shadow hover:bg-green-300">📗 {t("scanned")}</button>
          <button onClick={() => setStatusFilter('not_scanned')} className="flex-1 px-4 py-2 bg-red-200 text-red-700 rounded-xl shadow hover:bg-red-300">📕 {t("not_scanned")}</button>
          <button onClick={() => setStatusFilter('all')}         className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-xl shadow hover:bg-gray-300"> {t("all")}</button>
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
                <div
                  key={a.qr}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-4 rounded-2xl shadow-md flex justify-between items-center"
                >
                  <div>
                    <div className="text-lg font-bold">
                      {a.name} <span className="text-sm font-medium">({a.device_type})</span>
                    </div>
                    <div className="text-xs opacity-90">{t("qr_code")}: {a.qr}</div>
                    <div className="text-xs opacity-90">{t("department")}: {a.dept}</div>
                    {a.note && <div className="text-xs opacity-90">{a.note}</div>}
                  </div>
                  <div className="ml-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm ${
                        a.scanned ? 'bg-green-400 text-green-900' : 'bg-red-400 text-red-900'
                      }`}
                    >
                      {a.scanned ? t("scanned") : t("not_scanned")}
                    </span>
                  </div>
                </div>
              ))
            : <div className="text-sm text-gray-500">{t("no_devices_found")}</div>}
        </div>
      </main>

      <BottomNav currentUser={currentUser} />
    </div>
  );
}