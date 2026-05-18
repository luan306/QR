import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import { usePager, Pagination, Card, SectionTitle, Btn } from './adminUtils.jsx';

const API     = '/api';
const toArray = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);

function AuditTab() {
  const { t } = useTranslation();
  const [activeRound,  setActiveRound]  = useState(null);
  const [roundLoading, setRoundLoading] = useState(true);
  const [summary,      setSummary]      = useState({ total: 0, scanned: 0, remaining: 0, sessions: 0, active: 0 });
  const [deptProgress, setDeptProg]     = useState([]);
  const [sessions,     setSessions]     = useState([]);
  const sessionPager = usePager(sessions);
  const [compareData,  setCompareData]  = useState(null);
  const [compareTitle, setCmpTitle]     = useState('');
  const [depts,        setDepts]        = useState([]);
  const [filter,       setFilter]       = useState({ from: '', to: '', dept: '' });

  // ── Load round active ────────────────────────────────────
  useEffect(() => {
    fetch(API + '/inventory-rounds')
      .then(r => r.json())
      .then(data => {
        const list  = toArray(data);
        const active = list.find(r => r.status === 'active') || null;
        setActiveRound(active);
      })
      .catch(() => {})
      .finally(() => setRoundLoading(false));
    fetch(API + '/departments').then(r => r.json()).then(d => setDepts(toArray(d))).catch(() => {});
    loadAudit();
  }, []);

  const loadAudit = useCallback(async (f = filter) => {
    try {
      const deptData = toArray(await fetch(API + '/stats/departments').then(r => r.json()).catch(() => []));
      const params   = [];
      if (f.from) params.push('from=' + f.from);
      if (f.to)   params.push('to='   + f.to);
      if (f.dept) params.push('dept=' + f.dept);
      const sessData = toArray(await fetch(API + '/scan/audit-sessions' + (params.length ? '?' + params.join('&') : '')).then(r => r.json()).catch(() => []));
      const total   = deptData.reduce((s, d) => s + (d.total_devices   || 0), 0);
      const scanned = deptData.reduce((s, d) => s + (d.scanned_devices || 0), 0);
      setSummary({ total, scanned, remaining: total - scanned, sessions: sessData.length, active: sessData.filter(s => !s.ended_at).length });
      setDeptProg(deptData);
      setSessions(sessData);
    } catch {}
  }, [filter]);

  const forceStop = async (id) => {
    if (!confirm(t('audit_confirm_force_stop'))) return;
    const data = await fetch(API + '/scan/force-stop/' + id, { method: 'POST' }).then(r => r.json());
    if (data.success) loadAudit(); else alert(data.message || t('error'));
  };

  const deleteSession = async (id) => {
    if (!confirm(t('audit_confirm_delete_session'))) return;
    const data = await fetch(API + '/scan/audit-session/' + id, { method: 'DELETE' }).then(r => r.json());
    if (data.success) loadAudit(); else alert(data.message || t('error'));
  };

  const showCompare = async (sessionId, deptName) => {
    setCompareData(toArray(await fetch(API + '/scan/audit-compare/' + sessionId).then(r => r.json()).catch(() => [])));
    setCmpTitle(deptName);
  };

  const exportCompare = () => {
    if (!compareData?.length) return;
    const rows = [[t('device_name'), t('qr_code'), t('location'), t('auditor_name'), t('time'), t('status')]];
    compareData.forEach(d => rows.push([
      d.device_name, d.qr_code, d.location || '',
      d.scanned_by || '',
      d.scanned_at || '',
      d.audited ? t('audited') : t('not_audited'),
    ]));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Audit');
    XLSX.writeFile(wb, 'Audit_' + compareTitle + '.xlsx');
  };

  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDur  = s => {
    if (!s.ended_at) return '—';
    const m = Math.round((new Date(s.ended_at) - new Date(s.started_at || s.created_at)) / 60000);
    return m < 60 ? `${m} ${t('minutes')}` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  // ── Banner: không có round active ───────────────────────
  if (!roundLoading && !activeRound) {
    return (
      <div className="space-y-5">
        <SectionTitle>🔍 {t('audit_title')}</SectionTitle>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <p className="font-semibold text-gray-700 text-base">{t('inv_no_rounds')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('audit_no_round_hint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>🔍 {t('audit_title')}</SectionTitle>
        <Btn onClick={() => loadAudit()}>🔄 {t('refresh')}</Btn>
      </div>

      {/* Banner round đang chạy */}
      {activeRound && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <span className="font-semibold text-green-700">{t('inv_rounds_title')}:</span>
          <span className="text-green-900 font-bold truncate">{activeRound.name}</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('total_devices'),  value: summary.total,     color: 'text-[#079DD9]', bg: 'bg-[#e8f6fd]' },
          { label: t('audited'),        value: summary.scanned,   color: 'text-green-600', bg: 'bg-green-50'  },
          { label: t('not_audited'),    value: summary.remaining, color: 'text-red-500',   bg: 'bg-red-50'    },
          { label: t('audit_sessions'), value: summary.sessions,  color: 'text-purple-600', bg: 'bg-purple-50',
            extra: summary.active > 0 ? `${summary.active} ${t('inv_status_active')}` : null },
        ].map((c, i) => (
          <div key={i} className={'rounded-xl p-4 text-center shadow ' + c.bg}>
            <div className={'text-2xl font-bold ' + c.color}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
            {c.extra && <div className="mt-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full inline-block">{c.extra}</div>}
          </div>
        ))}
      </div>

      {/* Filter */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          {[{ label: t('from_date'), key: 'from', type: 'date' }, { label: t('to_date'), key: 'to', type: 'date' }].map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">{f.label}</label>
              <input type={f.type} value={filter[f.key]} onChange={e => setFilter(p => ({...p, [f.key]: e.target.value}))} className="border p-2 rounded-lg text-sm" />
            </div>
          ))}
          <div className="flex flex-col gap-1 flex-1 min-w-32">
            <label className="text-xs text-gray-500">{t('department')}</label>
            <select value={filter.dept} onChange={e => setFilter(p => ({...p, dept: e.target.value}))} className="border p-2 rounded-lg text-sm">
              <option value="">-- {t('all')} --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <Btn onClick={() => loadAudit(filter)}>🔍 {t('filter')}</Btn>
          <Btn color="gray" onClick={() => { const f = { from: '', to: '', dept: '' }; setFilter(f); loadAudit(f); }}>✖ {t('clear_filter')}</Btn>
        </div>
      </Card>

      {/* Dept progress */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-4">🏢 {t('department_progress')}</h3>
        <div className="space-y-4">
          {deptProgress.length === 0 && <p className="text-gray-400 text-sm">{t('no_department_data')}</p>}
          {deptProgress.map((d, i) => {
            const total = d.total_devices || 0, scanned = d.scanned_devices || 0;
            const pct = total > 0 ? Math.round(scanned * 100 / total) : 0;
            const bar = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400';
            const txt = pct >= 80 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-500';
            return (
              <div key={i}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-gray-700 text-sm">{d.department_name}</span>
                  <span className="text-sm text-gray-500">{scanned}/{total} <span className={'font-bold ' + txt}>{pct}%</span></span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className={bar + ' h-2.5 rounded-full transition-all duration-700'} style={{ width: pct + '%' }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Sessions */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-4">📅 {t('audit_sessions')}</h3>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {sessions.length === 0 && <p className="text-gray-400 text-sm text-center py-4">{t('no_audit_sessions')}</p>}
          {sessionPager.paged.map(s => (
            <div key={s.id} className="border rounded-xl p-3 bg-gray-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-medium text-sm">{s.auditor_name || '—'}</div>
                  <div className="text-xs text-gray-500">{s.dept_name || '—'}</div>
                  <div className="text-xs text-gray-400">{fmtDate(s.started_at || s.created_at)} · {fmtDur(s)}</div>
                  <div className="text-xs text-[#079DD9] font-semibold">{t('scanned')}: {s.total_scanned ?? '—'}</div>
                </div>
                {!s.ended_at
                  ? <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{t('in_progress')}</span>
                  : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs shrink-0">{t('inv_status_completed')}</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Btn color="indigo" size="sm" onClick={() => showCompare(s.id, s.dept_name || '')}>📊 {t('detail_compare')}</Btn>
                {!s.ended_at ? <Btn color="orange" size="sm" onClick={() => forceStop(s.id)}>⏹ {t('force_stop')}</Btn>
                             : <Btn color="red"    size="sm" onClick={() => deleteSession(s.id)}>🗑️ {t('delete')}</Btn>}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b text-xs uppercase tracking-wide">
              <th className="pb-2 pr-3">{t('auditor_name')}</th>
              <th className="pb-2 pr-3">{t('department')}</th>
              <th className="pb-2 pr-3">{t('from_date')}</th>
              <th className="pb-2 pr-3">{t('duration')}</th>
              <th className="pb-2 pr-3 text-center">{t('scanned')}</th>
              <th className="pb-2 text-center">{t('status')}</th>
              <th className="pb-2 text-center">{t('action')}</th>
            </tr></thead>
            <tbody>
              {sessions.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400 text-sm">{t('no_audit_sessions')}</td></tr>}
              {sessionPager.paged.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 border-b">
                  <td className="py-2.5 pr-3 font-medium text-sm">{s.auditor_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-600 text-sm">{s.dept_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-500 text-xs">{fmtDate(s.started_at || s.created_at)}</td>
                  <td className="py-2.5 pr-3 text-gray-500 text-xs">{fmtDur(s)}</td>
                  <td className="py-2.5 pr-3 text-center font-semibold text-[#079DD9]">{s.total_scanned ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-center">
                    {!s.ended_at
                      ? <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{t('in_progress')}</span>
                      : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">{t('inv_status_completed')}</span>}
                  </td>
                  <td className="py-2.5 text-center">
                    <div className="flex gap-1 justify-center">
                      <Btn color="indigo" size="sm" onClick={() => showCompare(s.id, s.dept_name || '')}>📊</Btn>
                      {!s.ended_at ? <Btn color="orange" size="sm" onClick={() => forceStop(s.id)}>⏹</Btn>
                                   : <Btn color="red"    size="sm" onClick={() => deleteSession(s.id)}>🗑️</Btn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...sessionPager} />
      </Card>

      {/* Compare modal */}
      {compareData && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="font-bold text-gray-700 text-sm">📊 {t('detail_compare')}: {compareTitle}</h3>
              <div className="flex gap-2">
                <Btn color="green" size="sm" onClick={exportCompare}>📥 Excel</Btn>
                <Btn color="gray"  size="sm" onClick={() => setCompareData(null)}>✕</Btn>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4 flex-shrink-0">
              <div className="bg-green-50 rounded-xl p-3 text-center"><div className="text-xl font-bold text-green-600">{compareData.filter(d => d.audited).length}</div><div className="text-xs text-gray-500">{t('audited')}</div></div>
              <div className="bg-red-50   rounded-xl p-3 text-center"><div className="text-xl font-bold text-red-500">{compareData.filter(d => !d.audited).length}</div><div className="text-xs text-gray-500">{t('not_audited')}</div></div>
              <div className="bg-[#e8f6fd] rounded-xl p-3 text-center"><div className="text-xl font-bold text-[#079DD9]">{compareData.length}</div><div className="text-xs text-gray-500">{t('total_devices')}</div></div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-4">
              <div className="md:hidden space-y-2">
                {compareData.map((d, i) => (
                  <div key={i} className={'border rounded-xl p-3 ' + (d.audited ? 'bg-white' : 'bg-red-50 border-red-200')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{d.device_name}</div>
                        <div className="text-xs text-gray-500">{d.qr_code} · {d.location || '—'}</div>
                        <div className="text-xs text-gray-400">{d.scanned_by || '—'} · {d.scanned_at ? new Date(d.scanned_at).toLocaleString('vi-VN') : '—'}</div>
                      </div>
                      {d.audited
                        ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs shrink-0">✅ {t('audited')}</span>
                        : <span className="bg-red-100   text-red-600   px-2 py-0.5 rounded-full text-xs shrink-0">❌ {t('not_audited')}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <table className="hidden md:table w-full text-sm">
                <thead className="sticky top-0 bg-white border-b"><tr className="text-left text-gray-400 text-xs uppercase">
                  <th className="pb-2 pr-3 pt-2">{t('device')}</th>
                  <th className="pb-2 pr-3">{t('qr_code')}</th>
                  <th className="pb-2 pr-3">{t('location')}</th>
                  <th className="pb-2 pr-3">{t('scanned_by')}</th>
                  <th className="pb-2 pr-3">{t('scanned_at')}</th>
                  <th className="pb-2 text-center">{t('status')}</th>
                </tr></thead>
                <tbody>
                  {compareData.map((d, i) => (
                    <tr key={i} className={'border-b hover:bg-gray-50 ' + (d.audited ? '' : 'bg-red-50')}>
                      <td className="py-2 pr-3 font-medium text-sm">{d.device_name}</td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{d.qr_code}</td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{d.location || '—'}</td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{d.scanned_by || '—'}</td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{d.scanned_at ? new Date(d.scanned_at).toLocaleString('vi-VN') : '—'}</td>
                      <td className="py-2 text-center">
                        {d.audited
                          ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">✅ {t('audited')}</span>
                          : <span className="bg-red-100   text-red-600   px-2 py-0.5 rounded-full text-xs">❌ {t('not_audited')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditTab;