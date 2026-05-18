import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import { Chart, registerables } from 'chart.js';
import { usePager, Pagination, Card, SectionTitle, Btn } from './adminUtils.jsx';

const API            = '/api';
const toArray        = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_ALL     = 9999;
Chart.register(...registerables);

function ActiveRoundPanel() {
  const { t } = useTranslation();
  const [rounds,   setRounds]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);

  const STATUS_LABEL = {
    active:    { text: t('inv_status_active'),    cls: 'bg-green-400/20 text-green-100'  },
    draft:     { text: t('inv_status_draft'),     cls: 'bg-white/20 text-white/80'       },
    paused:    { text: t('inv_status_paused'),    cls: 'bg-yellow-400/20 text-yellow-100'},
    completed: { text: t('inv_status_completed'), cls: 'bg-blue-400/20 text-blue-100'   },
    closed:    { text: t('inv_status_completed'), cls: 'bg-blue-400/20 text-blue-100'   },
  };

  useEffect(() => {
    fetch('/api/inventory-rounds')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        setRounds(list);
        const def = list.find(r => r.status === 'active') || list[0] || null;
        setSelected(def);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected?.id) { setItems([]); return; }
    fetch(`/api/inventory-rounds/${selected.id}/items`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [selected?.id]);

  if (loading) return <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />;
  if (!rounds.length) return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center text-gray-400 text-sm">
      📋 {t('inv_no_rounds')}
    </div>
  );

  const round   = selected;
  const total   = items.length;
  const scanned = items.filter(i => i.audited).length;
  const isNew   = items.filter(i => !i.audited && i.is_new).length;
  const pct     = total > 0 ? Math.round(scanned * 100 / total) : 0;
  const badge   = STATUS_LABEL[round?.status] || STATUS_LABEL.draft;

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <select
            value={round?.id ?? ''}
            onChange={e => setSelected(rounds.find(r => String(r.id) === e.target.value) || null)}
            className="w-full text-gray-800 font-semibold text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 cursor-pointer"
          >
            {rounds.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} — {STATUS_LABEL[r.status]?.text || r.status}
              </option>
            ))}
          </select>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
          round?.status === 'active'
            ? 'bg-green-100 text-green-700'
            : round?.status === 'completed' || round?.status === 'closed'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500'
        }`}>
          {badge.text}
        </span>
      </div>

      {/* Tên đợt + ngày */}
      {round && (
        <div className="px-5 pt-3 pb-1 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-gray-900 text-base truncate">{round.name}</div>
            {round.description && <div className="text-xs text-gray-400 mt-0.5 truncate">{round.description}</div>}
          </div>
          <div className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
            {round.started_at ? new Date(round.started_at).toLocaleDateString('vi-VN') : '—'}
            {' → '}
            {round.closed_at || round.end_date
              ? new Date(round.closed_at || round.end_date).toLocaleDateString('vi-VN')
              : t('inv_status_active')}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-5 py-4">
        {[
          { label: t('inv_total_devices'),                        value: total,                    icon: '📦', color: 'text-[#079DD9]', bg: 'bg-[#e8f6fd]' },
          { label: t('scanned'),                                  value: scanned,                  icon: '✅', color: 'text-green-600', bg: 'bg-green-50'  },
          { label: t('not_scanned'),                              value: total - scanned - isNew,  icon: '❌', color: 'text-red-500',   bg: 'bg-red-50'    },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.bg}`}>
            <div className="text-lg mb-0.5">{s.icon}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-5">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{t('inv_progress')}</span>
          <span className="font-bold text-[#079DD9]">{pct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: pct + '%', background: 'linear-gradient(90deg, #079DD9, #0589c0)' }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{scanned} {t('scanned')}</span>
          <span>{total - scanned} {t('inv_remaining')}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────
function Dashboard() {
  const { t } = useTranslation();

  const [rounds,       setRounds]       = useState([]);
  const [activeId,     setActiveId]     = useState(null);
  const [items,        setItems]        = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [deptDevices,  setDeptDevices]  = useState(null);
  const [deptName,     setDeptName]     = useState('');

  const overallRef = useRef(null);
  const deptRef    = useRef(null);
  const charts     = useRef({});

  useEffect(() => {
    fetch(API + '/inventory-rounds')
      .then(r => r.json())
      .then(data => {
        const list = toArray(data);
        setRounds(list);
        const active = list.find(r => r.status === 'active') || list[0] || null;
        if (active) setActiveId(active.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setLoadingItems(true);
    fetch(API + '/inventory-rounds/' + activeId + '/items')
      .then(r => r.json())
      .then(data => setItems(toArray(data)))
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
  }, [activeId]);

  const stats = useMemo(() => {
    const map = {};
    items.forEach(item => {
      const key = item.department_name || t('unknown');
      const dId = item.department_id   || null;
      if (!map[key]) map[key] = { department_name: key, department_id: dId, total: 0, scanned: 0 };
      map[key].total++;
      if (item.audited) map[key].scanned++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [items, t]);

  const totalAll   = items.length;
  const scannedAll = items.filter(i => i.audited).length;

  useEffect(() => {
    if (!totalAll) return;

    if (overallRef.current) {
      charts.current.overall?.destroy();
      charts.current.overall = new Chart(overallRef.current, {
        type: 'doughnut',
        data: {
          labels: [t('scanned'), t('not_scanned')],
          datasets: [{
            data: [scannedAll, Math.max(0, totalAll - scannedAll)],
            backgroundColor: ['#079DD9', '#F24444'],
            borderWidth: 0,
          }],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }

    if (deptRef.current && stats.length) {
      charts.current.dept?.destroy();
      charts.current.dept = new Chart(deptRef.current, {
        type: 'bar',
        data: {
          labels: stats.map(s => s.department_name),
          datasets: [
            { label: t('scanned'),     data: stats.map(s => s.scanned),           backgroundColor: '#079DD9' },
            { label: t('not_scanned'), data: stats.map(s => s.total - s.scanned), backgroundColor: '#F24444' },
          ],
        },
        options: {
          responsive: true,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          onClick: (_, els) => {
            if (els.length > 0) viewDept(stats[els[0].index].department_name);
          },
        },
      });
    }

    return () => { charts.current.overall?.destroy(); charts.current.dept?.destroy(); };
  }, [stats, totalAll, scannedAll, t]);

  const viewDept = useCallback((name) => {
    const filtered = items.filter(i => (i.department_name || t('unknown')) === name);
    setDeptDevices(filtered);
    setDeptName(name);
  }, [items, t]);

  const exportDept = () => {
    if (!deptDevices?.length) { alert(t('no_data_found')); return; }
    const rows = deptDevices.map(d => ({
      [t('qr_code')]:    d.qr_code,
      [t('device_name')]: d.device_name,
      [t('location')]:   d.location || '',
      [t('status')]:     d.audited ? t('scanned') : t('not_scanned'),
      [t('scanned_by')]: d.scanned_by_name || '',
      [t('time')]:       d.audited_at ? new Date(d.audited_at).toLocaleString('vi-VN') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, deptName.slice(0, 31));
    XLSX.writeFile(wb, 'Dept_' + deptName + '.xlsx');
  };

  return (
    <div className="space-y-5">
      <SectionTitle>📊 {t('dashboard')}</SectionTitle>

      <ActiveRoundPanel />

      {loadingItems ? (
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">{t('total_devices')}</h3>
            <div className="flex justify-center"><div className="w-44 h-44"><canvas ref={overallRef} /></div></div>
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">{t('department_progress')}</h3>
            <canvas ref={deptRef} height={160} />
            {stats.length > 0 && (
              <p className="text-xs text-gray-400 mt-2 text-center">{t('inv_click_col_detail')}</p>
            )}
          </Card>
        </div>
      )}

      {deptDevices && (
        <Card>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-bold text-gray-700">📋 {deptName}</h3>
            <div className="flex gap-2">
              <Btn color="green" size="sm" onClick={exportDept}>📤 {t('export_excel')}</Btn>
              <Btn color="gray"  size="sm" onClick={() => setDeptDevices(null)}>✕</Btn>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead><tr className="bg-gray-100 text-left">
                <th className="p-2 border text-xs">{t('qr_code')}</th>
                <th className="p-2 border text-xs">{t('device_name')}</th>
                <th className="p-2 border text-xs hidden sm:table-cell">{t('location')}</th>
                <th className="p-2 border text-xs text-center">{t('status')}</th>
              </tr></thead>
              <tbody>
                {deptDevices.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border p-2 text-xs font-mono">{d.qr_code}</td>
                    <td className="border p-2 text-sm">{d.device_name}</td>
                    <td className="border p-2 text-xs hidden sm:table-cell">{d.location || '—'}</td>
                    <td className={'border p-2 text-center text-xs font-medium ' + (d.audited ? 'text-green-600' : 'text-red-500')}>
                      {d.audited ? t('scanned') : t('not_scanned')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export { ActiveRoundPanel, Dashboard };