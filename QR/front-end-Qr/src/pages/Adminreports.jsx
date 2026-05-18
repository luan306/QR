import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import { usePager, Pagination, Card, SectionTitle, Btn } from './adminUtils.jsx';

const API            = '/api';
const toArray        = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_ALL     = 9999;

function Reports() {
  const { t } = useTranslation();
  const [scans, setScans] = useState([]);
  const scanPager = usePager(scans);

  useEffect(() => { fetch(API + '/scans').then(r => r.json()).then(d => setScans(Array.isArray(d) ? d : d?.scans ?? [])).catch(() => {}); }, []);

  const exportReport = () => {
    if (!scans.length) { alert(t('no_data_found')); return; }
    const rows = [['Tên Thiết Bị','QR Code','Người Quét','Thời Gian']];
    scans.forEach(s => rows.push([s.device_name, s.qr_code, s.user_name, s.scanned_at]));
    const wb2 = XLSX.utils.book_new();
    const ws2 = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb2, ws2, 'BaoCao');
    XLSX.writeFile(wb2, 'BaoCaoThietBiDaQuet.xlsx');
  };

  const clearReports = async () => {
    if (!confirm(t('confirm_clear_reports'))) return;
    const data = await fetch(API + '/scans', { method: 'DELETE' }).then(r => r.json());
    alert(data.success ? data.message : data.message); if (data.success) setScans([]);
  };

  return (
    <div className="space-y-5">
      <SectionTitle>📋 {t('reports')}</SectionTitle>
      <Card>
        <div className="flex gap-2 mb-4 flex-wrap">
          <Btn color="indigo" onClick={exportReport}>📤 {t('export_excel')}</Btn>
          <Btn color="red"    onClick={clearReports}>🗑️ {t('delete_all')}</Btn>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {scans.length === 0 && <p className="text-gray-400 text-sm text-center py-8">{t('no_data_found')}</p>}
          {scanPager.paged.map((s, i) => (
            <div key={i} className={'border rounded-xl p-3 ' + (s.status?.includes('Sai') ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200')}>
              <div className="font-semibold text-gray-800 text-sm">{s.device_name} <span className="text-xs text-gray-500 font-normal">({s.qr_code})</span></div>
              <div className="text-xs text-gray-500 mt-0.5">Thuộc: {s.device_department} · Quét tại: {s.scan_department}</div>
              <div className="text-xs text-gray-400">{s.user_name} · {s.scanned_at}</div>
            </div>
          ))}
        </div>
        <Pagination {...scanPager} />
      </Card>
    </div>
  );
}


export default Reports;