import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { io } from 'socket.io-client';
import { useTranslation } from 'react-i18next';

const API = '/api';

const toArray = (d) => {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (d.data && Array.isArray(d.data)) return d.data;
  if (d.result && Array.isArray(d.result)) return d.result;
  if (d.items && Array.isArray(d.items)) return d.items;
  if (d.roundItems && Array.isArray(d.roundItems)) return d.roundItems;
  if (typeof d === 'object') {
    for (const key in d) { if (Array.isArray(d[key])) return d[key]; }
  }
  return [];
};

// ── Kiểm tra đợt có hết hạn chưa ──────────────────────────────────────────
const isExpired = (round) => {
  const endField = round.end_date || round.closed_at;
  if (!endField) return false;
  const end = new Date(endField);
  end.setHours(23, 59, 59, 999);
  return new Date() > end;
};

const STATUS_META = {
  active:    { label: 'inv_status_active',    dot: '#22c55e', bg: '#f0fdf4', color: '#15803d' },
  draft:     { label: 'inv_status_draft',     dot: '#94a3b8', bg: '#f8fafc', color: '#475569' },
  completed: { label: 'inv_status_completed', dot: '#3b82f6', bg: '#eff6ff', color: '#1d4ed8' },
  closed:    { label: 'inv_status_completed', dot: '#3b82f6', bg: '#eff6ff', color: '#1d4ed8' },
  paused:    { label: 'inv_status_paused',    dot: '#f59e0b', bg: '#fffbeb', color: '#b45309' },
};

// ── Luồng trạng thái & nút hành động ──────────────────────────────────────
// Labels và confirm dùng translation keys, render bằng t() ở nơi dùng
const STATUS_ACTIONS = {
  draft: [
    { labelKey: 'inv_action_start',  icon: '▶', next: 'active',    style: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100', confirmKey: 'inv_confirm_start' },
  ],
  active: [
    { labelKey: 'inv_action_pause',  icon: '⏸', next: 'paused',    style: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100', confirmKey: 'inv_confirm_pause' },
    { labelKey: 'inv_action_end',    icon: '⏹', next: 'completed', style: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',         confirmKey: 'inv_confirm_end' },
  ],
  paused: [
    { labelKey: 'inv_action_resume', icon: '▶', next: 'active',    style: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100', confirmKey: 'inv_confirm_resume' },
    { labelKey: 'inv_action_end',    icon: '⏹', next: 'completed', style: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',         confirmKey: 'inv_confirm_end' },
  ],
  completed: [
    { labelKey: 'inv_action_reopen', icon: '🔄', next: 'active', style: 'bg-[#e8f6fd] border-[#079DD9]/30 text-[#0589c0] hover:bg-[#d0eefa]', confirmKey: 'inv_confirm_reopen' },
  ],
  closed: [
    { labelKey: 'inv_action_reopen', icon: '🔄', next: 'active', style: 'bg-[#e8f6fd] border-[#079DD9]/30 text-[#0589c0] hover:bg-[#d0eefa]', confirmKey: 'inv_confirm_reopen' },
  ],
};

const Badge = ({ status }) => {
  const { t } = useTranslation();
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.dot}40` }}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
      <span style={{ background: m.dot }} className="w-2 h-2 rounded-full" />
      {t(m.label)}
    </span>
  );
};

// ── Chip hết hạn ──────────────────────────────────────────────────────────
const ExpiredChip = () => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600 border border-red-200">
      ⚠️ {t('inv_expired')}
    </span>
  );
};

// ── Modal gia hạn ─────────────────────────────────────────────────────────
function ExtendModal({ round, onClose, onExtended }) {
  const { t } = useTranslation();
  const [newEndDate, setNewEndDate] = useState(round.end_date?.slice(0, 10) || '');
  const [saving, setSaving] = useState(false);
  const minDate = new Date().toISOString().slice(0, 10);

  const save = async () => {
    if (!newEndDate) { alert(t('inv_extend_select_date')); return; }
    if (newEndDate <= minDate.slice(0, 10) && newEndDate < minDate) { alert(t('inv_extend_date_future')); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/inventory-rounds/${round.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_date: newEndDate }),
      });
      if (!res.ok) throw new Error();
      onExtended(newEndDate);
      onClose();
    } catch {
      alert(t('inv_extend_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t('inv_extend_title')}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('inv_extend_subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl p-1">✕</button>
        </div>

        {round.end_date && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700 mb-4">
            {t('inv_extend_old_date')}: <strong>{new Date(round.end_date).toLocaleDateString('vi-VN')}</strong>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('inv_extend_new_date')} <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={newEndDate}
            min={minDate}
            onChange={e => setNewEndDate(e.target.value)}
            className="w-full border border-gray-300 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#079DD9] text-sm"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-300 rounded-2xl text-sm font-medium hover:bg-gray-50">{t('cancel')}</button>
          <button onClick={save} disabled={saving || !newEndDate}
            className="flex-1 py-3 bg-[#079DD9] text-white rounded-2xl text-sm font-semibold hover:bg-[#0589c0] disabled:opacity-50 transition-all">
            {saving ? t('inv_saving') : `📅 ${t('inv_extend_btn')}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const MONTHS_VI = ['Th.1','Th.2','Th.3','Th.4','Th.5','Th.6','Th.7','Th.8','Th.9','Th.10','Th.11','Th.12'];

function MonthPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const { year, month } = value;
  return (
    <div ref={ref} className="relative select-none">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 hover:border-indigo-300 hover:shadow transition-all">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {MONTHS_VI[month - 1]} {year}
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-2 bg-white rounded-3xl shadow-xl border border-gray-100 p-5 w-72">
          <div className="flex justify-between items-center mb-4 px-2">
            <button onClick={() => onChange({ year: year - 1, month })} className="p-2 hover:bg-gray-100 rounded-xl text-xl">‹</button>
            <span className="font-semibold text-lg text-gray-800">{year}</span>
            <button onClick={() => onChange({ year: year + 1, month })} className="p-2 hover:bg-gray-100 rounded-xl text-xl">›</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS_VI.map((m, i) => {
              const active = i + 1 === month;
              return (
                <button key={i} onClick={() => { onChange({ year, month: i + 1 }); setOpen(false); }}
                  className={`py-3 text-sm font-medium rounded-2xl transition-all ${active ? 'bg-[#079DD9] text-white shadow' : 'hover:bg-gray-100 text-gray-700'}`}>
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   DEVICES TAB
══════════════════════════════════════════════════════════ */
function DevicesTab({ round, items = [], itemsLoading, onRefresh }) {
  const { t } = useTranslation();
  const [searchRaw, setSearchRaw]         = useState('');
  const [filterDept, setFilterDept]       = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterGroup, setFilterGroup]     = useState('');
  const [filterCost, setFilterCost]       = useState('');
  const [filterType, setFilterType]       = useState('');
  const [filterStatus, setFilterStatus]   = useState(''); // '' | 'scanned' | 'not_scanned' | 'new'
  const [selected, setSelected]           = useState(new Set());
  const [page, setPage]                   = useState(1);
  const [showAll, setShowAll]              = useState(false);
  const PER_PAGE = 20;
  const dv = (v) => (v == null || v === '' ? '—' : String(v));

  const departments  = useMemo(() => [...new Map(items.filter(d => d.department_name).map(d => [d.department_name, { id: d.department_name, name: d.department_name }])).values()], [items]);
  // Options dropdown lọc theo filter cha để tránh hiện options không liên quan
  const sectionOptions = useMemo(() => {
    const base = filterDept ? items.filter(d => d.department_name === filterDept) : items;
    return [...new Set(base.map(d => d.section_name).filter(Boolean))].sort();
  }, [items, filterDept]);
  const groupOptions   = useMemo(() => {
    const base = filterSection ? items.filter(d => d.section_name === filterSection) : (filterDept ? items.filter(d => d.department_name === filterDept) : items);
    return [...new Set(base.map(d => d.group_name).filter(Boolean))].sort();
  }, [items, filterDept, filterSection]);
  const typeOptions = useMemo(() => [...new Set(items.map(d => d.device_type_name || d.device_type).filter(Boolean))].sort(), [items]);

  const costOptions    = useMemo(() => {
    if (!filterGroup) return []; // phải chọn Group trước mới hiện Cost Center
    const base = items.filter(d =>
      (!filterDept    || d.department_name === filterDept)    &&
      (!filterSection || d.section_name    === filterSection) &&
      d.group_name === filterGroup
    );
    return [...new Set(base.map(d => d.cost_center_name).filter(Boolean))].sort();
  }, [items, filterDept, filterSection, filterGroup]);

  const filtered = useMemo(() => {
    const q = searchRaw.trim().toLowerCase();
    return items.filter(dev => {
      const name = (dev.device_name || dev.name || '').toLowerCase();
      const qr   = (dev.qr_code || '').toLowerCase();
      if (q && !name.includes(q) && !qr.includes(q)) return false;
      if (filterDept    && dev.department_name  !== filterDept)    return false;
      if (filterSection && dev.section_name     !== filterSection) return false;
      if (filterGroup   && dev.group_name       !== filterGroup)   return false;
      if (filterCost    && dev.cost_center_name !== filterCost)    return false;
      return true;
    });
  }, [items, searchRaw, filterDept, filterSection, filterGroup, filterCost]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged      = showAll ? filtered : filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const toggleOne  = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll  = () => setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(d => d.id)));

  const hasFilter = !!(searchRaw || filterDept || filterSection || filterGroup || filterCost || filterType || filterStatus);
  const exportExcelFiltered = () => {
    const exportData = filtered.map((d, i) => ({
      STT: i + 1,
      'PIC': d.pic_name || d.pic || '',
      'Bộ phận': d.department_name,
      'Section': d.section_name,
      'Group': d.group_name,
      'Cost Center': d.cost_center_name,
      'Số serial': d.serial_number || d.qr_code,
      'Tên thiết bị': d.device_name || d.name,
      'Loại thiết bị': d.device_type_name || d.device_type || '',
      'Người quét': d.scanned_by_name || d.audited_by_name || '',
      'Trạng thái': d.audited ? 'Đã quét' : d.is_new ? 'Mới thêm' : 'Chưa quét',
      'Vị trí / chuyển': d.is_mismatch
        ? `Chuyển từ ${d.department_name} → ${d.scanned_dept_name || ''}`
        : (d.scanned_dept_name || d.department_name || ''),
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    XLSX.writeFile(wb, `${round?.name || 'inventory'}_devices.xlsx`);
  };

  if (itemsLoading) return <div className="flex items-center justify-center py-20 text-gray-400">{t('inv_loading_devices')}</div>;

  return (
    <div className="space-y-3">

      {/* ── Row 1: Search + Dropdowns + Tải danh sách ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative min-w-[260px] flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input value={searchRaw} onChange={e => { setSearchRaw(e.target.value); setPage(1); }}
            placeholder={t('inv_search_placeholder')}
            className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 bg-white" />
          {searchRaw && (
            <button onClick={() => { setSearchRaw(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
          )}
        </div>
        <select value={filterDept} onChange={e => { setFilterDept(e.target.value); setFilterSection(''); setFilterGroup(''); setFilterCost(''); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[160px]">
          <option value="">{t('department')}</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={filterSection} onChange={e => { setFilterSection(e.target.value); setFilterGroup(''); setFilterCost(''); setPage(1); }}
          disabled={!filterDept}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed">
          <option value="">Section</option>
          {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterCost(''); setPage(1); }}
          disabled={!filterSection}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed">
          <option value="">Group</option>
          {groupOptions.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterCost} onChange={e => { setFilterCost(e.target.value); setPage(1); }}
          disabled={!filterGroup}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[120px] disabled:opacity-40 disabled:cursor-not-allowed">
          <option value="">Cost Center</option>
          {costOptions.map(cc => <option key={cc} value={cc}>{cc}</option>)}
        </select>
        <button onClick={exportExcelFiltered}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-[#079DD9] hover:bg-[#0589c0] text-white rounded-lg text-sm font-semibold transition-all whitespace-nowrap">
          ⬇️ {t('inv_download_list')}
          {filtered.length > 0 && (
            <span className="bg-white/25 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">{filtered.length}</span>
          )}
        </button>
      </div>

      {/* ── Row 2: Status bar + filter chips + nút xóa hàng loạt ── */}
      <div className="flex items-center justify-between flex-wrap gap-2 py-1">
        <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500">
          <span><span className="font-semibold text-gray-800">{filtered.length}</span> / {items.length} mục</span>
          {filterDept    && <span className="bg-[#d0eefa] text-[#0589c0] px-2.5 py-0.5 rounded-full text-xs font-medium">{filterDept}</span>}
          {filterSection && <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{filterSection}</span>}
          {filterGroup   && <span className="bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{filterGroup}</span>}
          {filterCost    && <span className="bg-yellow-100 text-yellow-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{filterCost}</span>}
          {searchRaw     && <span className="bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full text-xs font-medium">"{searchRaw}"</span>}
          {filterType    && <span className="bg-teal-100 text-teal-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{filterType}</span>}
          {filterStatus  && <span className="bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{filterStatus === 'scanned' ? `✅ ${t('scanned')}` : filterStatus === 'not_scanned' ? `❌ ${t('not_scanned')}` : `🆕 ${t('new_device')}`}</span>}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={async () => {
              if (!confirm(t('inv_confirm_delete_selected', { count: selected.size }))) return;
              try {
                await Promise.all([...selected].map(id =>
                  fetch(`${API}/inventory-rounds/${round.id}/items/${id}`, { method: 'DELETE' })
                ));
                setSelected(new Set());
                onRefresh?.();
              } catch { alert(t('inv_delete_error')); }
            }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-all">
              🗑️ {t('inv_delete_selected', { count: selected.size })}
            </button>
          )}
          {hasFilter && (
            <button onClick={() => { setSearchRaw(''); setFilterDept(''); setFilterSection(''); setFilterGroup(''); setFilterCost(''); setFilterType(''); setFilterStatus(''); setPage(1); }}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-all">
              ✕ {t('inv_clear_filter')}
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="pl-4 pr-2 py-3 w-8"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} className="accent-[#079DD9]" /></th>
              <th className="px-3 py-3 w-10">#</th>
              <th className="px-3 py-3 min-w-[130px]">PIC</th>
              <th className="px-3 py-3 min-w-[160px]">{t('department')}</th>
              <th className="px-3 py-3 min-w-[120px]">Section</th>
              <th className="px-3 py-3 min-w-[120px]">Group</th>
              <th className="px-3 py-3 min-w-[110px]">Cost Center</th>
              <th className="px-3 py-3 min-w-[110px]">{t('inv_serial')}</th>
              <th className="px-3 py-3 min-w-[160px]">{t('device_name')}</th>
              <th className="px-3 py-3 min-w-[120px]">{t('device_type')}</th>
              <th className="px-3 py-3 min-w-[130px]">{t('inv_scanned_by')}</th>
              <th className="px-3 py-3 min-w-[100px] text-center">{t('inv_status')}</th>
              <th className="px-3 py-3 min-w-[220px]">{t('inv_location_transfer')}</th>
              <th className="px-3 py-3 w-20 text-center">{t('inv_action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.length === 0
              ? <tr><td colSpan={14} className="py-16 text-center text-gray-400 text-sm">{t('inv_no_devices')}</td></tr>
              : paged.map((dev, idx) => {
                  const isMismatch = !!dev.is_mismatch;
                  const locDisplay = (() => {
                    if (!dev.audited) {
                      if (dev.is_new && dev.added_dept_name) {
                        return { text: dev.added_dept_name, transfer: false, newDevice: true };
                      }
                      return null;
                    }
                    if (isMismatch) {
                      const from = dev.department_name || '?';
                      const to   = dev.scanned_dept_name || dev.scanned_location || '?';
                      return { text: t('inv_transfer_from_to', { from, to }), transfer: true };
                    }
                    // Đang ở: chỉ hiện bộ phận nơi quét
                    const dept = dev.scanned_dept_name || dev.department_name || null;
                    return dept ? { text: dept, transfer: false } : null;
                  })();
                  return (
                    <tr key={dev.id} className={`hover:bg-[#e8f6fd]/30 transition-colors ${selected.has(dev.id) ? 'bg-[#e8f6fd]' : ''}`}>
                      <td className="pl-4 pr-2 py-3"><input type="checkbox" checked={selected.has(dev.id)} onChange={() => toggleOne(dev.id)} className="accent-[#079DD9]" /></td>
                      <td className="px-3 py-3 text-gray-400 text-xs">{(page - 1) * PER_PAGE + idx + 1}</td>

                      {/* PIC */}
                      <td className="px-3 py-3 text-xs text-gray-700 font-medium">
                        {dv(dev.pic_name || dev.pic || null)}
                      </td>

                      {/* Bộ phận → Section → Group → Cost Center */}
                      <td className="px-3 py-3 text-gray-600 text-xs">{dv(dev.department_name)}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{dv(dev.section_name)}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{dv(dev.group_name)}</td>
                      <td className="px-3 py-3 text-xs">
                        <span className="font-mono text-gray-600 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">{dv(dev.cost_center_name)}</span>
                      </td>

                      {/* Số serial → Tên thiết bị → Loại */}
                      <td className="px-3 py-3 font-mono text-gray-600 text-xs">{dv(dev.serial_number || dev.qr_code)}</td>
                      <td className="px-3 py-3">
                        <span className="font-semibold text-gray-900 text-sm">{dv(dev.device_name || dev.name)}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">{dv(dev.device_type_name || dev.device_type)}</td>

                      {/* Người quét */}
                      <td className="px-3 py-3 text-gray-700 text-xs font-medium">{dv(dev.scanned_by_name || dev.audited_by_name || (dev.is_new ? dev.added_by_name : null))}</td>

                      {/* Trạng thái */}
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${dev.audited ? 'bg-green-50 text-green-700 border-green-200' : dev.is_new ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dev.audited ? 'bg-green-500' : dev.is_new ? 'bg-blue-500' : 'bg-gray-400'}`} />
                          {dev.audited ? t('scanned') : dev.is_new ? `🆕 ${t('new_device')}` : t('not_scanned')}
                        </span>
                      </td>

                      {/* Vị trí / Chuyển */}
                      <td className="px-3 py-3 text-xs">
                        {locDisplay
                          ? locDisplay.transfer
                            ? <span className="inline-flex items-center gap-1.5 font-semibold text-orange-600">
                                <span className="text-base leading-none">🔄</span>
                                <span>{locDisplay.text}</span>
                              </span>
                            : <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                                <span className="text-base leading-none">📍</span>
                                <span>{locDisplay.text}</span>
                              </span>
                          : dev.is_new && dev.added_dept_name
                            ? <span className="inline-flex items-center gap-1.5 font-medium text-blue-600"><span className="text-base leading-none">📍</span><span>{dev.added_dept_name}</span></span>
                            : <span className="text-gray-300">—</span>
                        }
                      </td>

                      {/* Hành động */}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={async () => {
                            if (!confirm(t('inv_confirm_delete_device'))) return;
                            try {
                              const res = await fetch(`${API}/inventory-rounds/${round.id}/items/${dev.id}`, { method: 'DELETE' });
                              if (!res.ok) throw new Error();
                              onRefresh?.();
                            } catch { alert(t('inv_delete_device_error')); }
                          }}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {items.length > 0 && (
        <div className="flex items-center justify-between pt-1 text-sm text-gray-500">
          <span>{t('inv_page', { page, total: Math.max(totalPages, 1) })} · {filtered.length}/{items.length} {t('inv_items')}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1.5 border rounded-lg disabled:opacity-30 hover:bg-gray-50 text-xs">«</button>
            <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} className="px-2 py-1.5 border rounded-lg disabled:opacity-30 hover:bg-gray-50 text-xs">‹</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="px-2 py-1.5 border rounded-lg disabled:opacity-30 hover:bg-gray-50 text-xs">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1.5 border rounded-lg disabled:opacity-30 hover:bg-gray-50 text-xs">»</button>
            {filtered.length > PER_PAGE && (
              <button onClick={() => setShowAll(s => !s)} className="ml-2 px-3 py-1.5 border border-[#079DD9]/30 text-[#079DD9] rounded-lg text-xs font-medium hover:bg-[#e8f6fd] transition-all">
                {showAll ? t('inv_collapse') : t('inv_show_all', { count: filtered.length })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   DETAIL VIEW
══════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'overview', labelKey: 'inv_tab_overview' },
  { key: 'devices',  labelKey: 'inv_tab_devices'  },
];

function RoundDetail({ round: initialRound, onBack, onRoundUpdate }) {
  const { t } = useTranslation();
  const [round, setRound]               = useState(initialRound);
  const [activeTab, setActiveTab]       = useState('devices');
  const [items, setItems]               = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [showImport, setShowImport]       = useState(false);
  const [showExtend, setShowExtend]       = useState(false);
  const [importFile, setImportFile]       = useState(null);
  const [importing, setImporting]         = useState(false);
  const importFileRef = useRef();

  // ── Kiểm tra hết hạn & tự dừng ───────────────────────────────────────────
  const expired = isExpired(round);
  // Nếu đang active mà hết hạn → tự patch paused (1 lần)
  const autoStoppedRef = useRef(false);
  useEffect(() => {
    if (expired && round.status === 'active' && !autoStoppedRef.current) {
      autoStoppedRef.current = true;
      fetch(`${API}/inventory-rounds/${round.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      }).then(() => {
        const updated = { ...round, status: 'paused' };
        setRound(updated);
        onRoundUpdate?.(updated);
      }).catch(console.error);
    }
  }, [expired, round, onRoundUpdate]);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res  = await fetch(`${API}/inventory-rounds/${round.id}/items?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
      });
      if (!res.ok) { setItems([]); return; }
      const json = await res.json().catch(() => ({}));
      setItems(toArray(json));
    } catch { setItems([]); }
    finally { setItemsLoading(false); }
  }, [round.id]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Realtime: lắng nghe socket khi có thiết bị được quét ─────
  useEffect(() => {
    if (round.status !== 'active') return;
    const socket = io({ transports: ['websocket', 'polling'] });

    // Khi có scan mới → cập nhật item tương ứng ngay, không reload toàn bộ
    socket.on('scan_recorded', (data) => {
      if (data?.round_id && String(data.round_id) !== String(round.id)) return;
      setItems(prev => prev.map(item =>
        item.qr_code === data.qr_code || item.device_id === data.device_id
          ? {
              ...item,
              audited:          1,
              audited_at:       data.audited_at || new Date().toISOString(),
              scanned_by_name:  data.scanned_by_name || item.scanned_by_name,
              audited_by_name:  data.scanned_by_name || item.audited_by_name,
              scanned_dept_id:   data.scanned_dept_id   || item.scanned_dept_id,
              scanned_dept_name: data.scanned_dept_name || item.scanned_dept_name,
              scanned_location:  data.scanned_location  || item.scanned_location,
              is_mismatch:       data.is_mismatch       ?? item.is_mismatch,
            }
          : item
      ));
    });

    // Fallback: nếu backend emit 'round_updated' thì reload hết
    socket.on('round_updated', (data) => {
      if (data?.round_id && String(data.round_id) !== String(round.id)) return;
      loadItems();
    });

    return () => socket.disconnect();
  }, [round.id, round.status, loadItems]);

  const changeStatus = async (nextStatus, confirmKey) => {
    if (!confirm(t(confirmKey))) return;
    try {
      // Khi mở lại round đã đóng → reset closed_at
      const body = { status: nextStatus };
      if (nextStatus === 'active') body.closed_at = null;

      const res = await fetch(`${API}/inventory-rounds/${round.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const updated = { ...round, status: nextStatus, ...(nextStatus === 'active' ? { closed_at: null } : {}) };
      setRound(updated);
      onRoundUpdate?.(updated);
    } catch { alert(t('inv_status_change_error')); }
  };

  // Lấy danh sách actions, ẩn "Tiếp tục" nếu hết hạn (nhưng giữ "Mở lại" cho completed/closed)
  const actions = (STATUS_ACTIONS[round.status] || []).filter(a => {
    if (a.next === 'active' && expired && round.status !== 'completed' && round.status !== 'closed') return false;
    return true;
  });

  const downloadTemplate = () => {
    const templateRows = [
      {
        PIC: 'Nguyễn Văn A',
        'Bộ phận': 'Phòng IT',
        Section: 'Section A',
        Group: 'Group 1',
        'Cost Center': 'CC001',
        'Số serial': 'QR001',
        'Tên thiết bị': 'Máy tính Dell XPS',
        'Loại thiết bị': 'Laptop',
        'Vị trí / chuyển': 'Tầng 2 - Phòng 201',
      },
      {
        PIC: 'Trần Thị B',
        'Bộ phận': 'Phòng Kế toán',
        Section: '',
        Group: '',
        'Cost Center': '',
        'Số serial': 'QR002',
        'Tên thiết bị': 'Màn hình Samsung',
        'Loại thiết bị': 'Monitor',
        'Vị trí / chuyển': 'Tầng 3 - Phòng 301',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách thiết bị');
    XLSX.writeFile(wb, 'mau_import_thiet_bi.xlsx');
  };

  const importDevices = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res  = await fetch(`${API}/inventory-rounds/${round.id}/import`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      alert(json.message || (json.success ? '✅ Import thành công' : '❌ Import thất bại'));
      if (json.success) { setShowImport(false); setImportFile(null); loadItems(); }
    } catch (err) { alert(`❌ ${t('inv_import_error')}: ` + err.message); }
    finally { setImporting(false); }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(items);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, `${round.name}_items.xlsx`);
  };

  const scanned    = items.filter(i => i.audited).length;
  const notScanned = items.filter(i => !i.audited).length;
  const progress   = items.length ? Math.round((scanned / items.length) * 100) : 0;

  return (
    <div className="flex flex-col h-screen bg-[#f4f5f7] overflow-hidden">

      {/* ── TOP HEADER ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 text-gray-600 font-medium text-sm transition-all group">
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('inv_rounds_title')}        </button>
        <div className="w-px h-6 bg-gray-200" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 truncate">{round.name}</h1>
            <Badge status={round.status} />
            {expired && <ExpiredChip />}
          </div>
          {round.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{round.description}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">

          {/* ── Banner hết hạn + nút Gia hạn ── */}
          {expired && round.status !== 'completed' && round.status !== 'closed' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              ⚠️ {t('inv_expired_banner')}
              <button onClick={() => setShowExtend(true)}
                className="ml-1 px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-all">
                📅 {t('inv_extend_btn')}
              </button>
            </div>
          )}

          {/* ── Nút hành động theo trạng thái ── */}
          {actions.map(action => (
            <button key={action.next}
              onClick={() => changeStatus(action.next, action.confirmKey)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${action.style}`}>
              {action.icon} {t(action.labelKey)}
            </button>
          ))}

          {/* Nếu paused + hết hạn → chỉ hiện nút Gia hạn (đã ở trên), ẩn "Tiếp tục" */}
          {round.status === 'paused' && expired && (
            <span className="text-xs text-gray-400 italic">{t('inv_extend_to_resume')}</span>
          )}

          {round.status !== 'completed' && round.status !== 'closed' && (
            <>
              <button onClick={() => { setImportFile(null); setShowImport(true); }}
                className="flex items-center gap-2 px-4 py-2 border border-[#079DD9]/30 bg-[#e8f6fd] text-[#0589c0] rounded-xl text-sm font-semibold hover:bg-[#d0eefa] transition-all active:scale-95">
                ⬆️ {t('inv_import_excel')}
              </button>

            </>
          )}


        </div>
      </div>

      {/* ── TABS ── */}
      <div className="bg-white border-b border-gray-200 px-6 shrink-0">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                activeTab === tab.key ? 'border-[#079DD9] text-[#079DD9]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t(tab.labelKey)}
              {tab.key === 'devices' && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'devices' ? 'bg-[#d0eefa] text-[#0589c0]' : 'bg-gray-100 text-gray-600'}`}>
                  {items.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-4xl">
            {/* Cảnh báo hết hạn */}
            {expired && round.status !== 'completed' && round.status !== 'closed' && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="font-semibold text-red-700 text-sm">{t('inv_expired_warning_title')}</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    {t('inv_expired_warning_desc', { date: new Date(round.end_date).toLocaleDateString('vi-VN') })}
                  </p>
                </div>
                <button onClick={() => setShowExtend(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-all whitespace-nowrap">
                  📅 {t('inv_extend_now')}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: t('inv_total_devices'), value: items.length, emoji: '📦' },
                { label: t('scanned'),           value: scanned,      emoji: '✅' },
                { label: t('not_scanned'),        value: notScanned,   emoji: '❌' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                  <div className="text-2xl mb-1">{s.emoji}</div>
                  <div className="text-3xl font-bold text-gray-900">{s.value}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-gray-700">{t('inv_progress')}</span>
                <span className="text-2xl font-bold text-[#079DD9]">{progress}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #079DD9, #0589c0)' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>{scanned} {t('scanned')}</span>
                <span>{items.length - scanned} {t('inv_remaining')}</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-700 mb-4">{t('inv_round_info')}</h3>
              {[
                { label: t('inv_round_name'),       value: round.name },
                { label: t('inv_description'),      value: round.description || '—' },
                { label: t('inv_status'),            value: <span className="flex items-center gap-2"><Badge status={round.status} />{expired && <ExpiredChip />}</span> },
                { label: t('inv_started_at'),        value: round.started_at ? new Date(round.started_at).toLocaleDateString('vi-VN') : '—' },
                { label: t('inv_end_date'),          value: (round.end_date || round.closed_at) ? new Date(round.end_date || round.closed_at).toLocaleDateString('vi-VN') : '—' },
                { label: t('inv_created_at'),        value: round.created_at ? new Date(round.created_at).toLocaleString('vi-VN') : '—' },
              ].map(row => (
                <div key={row.label} className="flex gap-4">
                  <span className="text-sm text-gray-500 w-32 shrink-0">{row.label}</span>
                  <span className="text-sm text-gray-800 font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <DevicesTab round={round} items={items} itemsLoading={itemsLoading} onRefresh={loadItems} />
        )}
      </div>

      {/* ── MODAL: Gia hạn ── */}
      {showExtend && (
        <ExtendModal
          round={round}
          onClose={() => setShowExtend(false)}
          onExtended={(newEndDate) => {
            const updated = { ...round, end_date: newEndDate };
            setRound(updated);
            onRoundUpdate?.(updated);
            autoStoppedRef.current = false; // reset để auto-stop hoạt động lại nếu hết hạn lần nữa
          }}
        />
      )}

      {/* ── MODAL: Import Excel ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{t('inv_import_title')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{t('inv_import_subtitle')}</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-700 text-xl p-1">✕</button>
            </div>
            <button onClick={downloadTemplate}
              className="w-full mb-4 flex items-center justify-center gap-2 py-2.5 border border-[#079DD9]/30 bg-[#e8f6fd] text-[#0589c0] rounded-2xl text-sm font-semibold hover:bg-[#d0eefa] transition-all">
              ⬇️ {t('inv_download_template')}
            </button>
            <div onClick={() => importFileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${importFile ? 'border-indigo-400 bg-[#e8f6fd]' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setImportFile(e.target.files?.[0] || null)} />
              {importFile ? (
                <div>
                  <div className="text-3xl mb-2">📊</div>
                  <p className="font-semibold text-[#0589c0] text-sm">{importFile.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                  <button onClick={e => { e.stopPropagation(); setImportFile(null); importFileRef.current.value = ''; }} className="mt-2 text-xs text-red-500 hover:text-red-700">✕ {t('inv_remove_file')}</button>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">⬆️</div>
                  <p className="text-sm text-gray-600 font-medium">{t('inv_drag_drop')}</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx, .xls</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowImport(false)} className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 hover:bg-gray-50">{t('cancel')}</button>
              <button onClick={importDevices} disabled={!importFile || importing}
                className="flex-1 py-3 bg-[#079DD9] text-white rounded-2xl text-sm font-semibold hover:bg-[#0589c0] disabled:opacity-50 transition-all">
                {importing ? t('inv_importing') : `⬆️ ${t('inv_import_btn')}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN — LIST VIEW
══════════════════════════════════════════════════════════ */
export default function InventoryRounds() {
  const { t } = useTranslation();
  const [statusTab, setStatusTab] = useState('all');
  const [dateFrom,  setDateFrom]   = useState('');
  const [dateTo,    setDateTo]     = useState('');
  const [rounds, setRounds]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState(new Set());
  const [detail, setDetail]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', started_at: '', end_date: '' });
  const [creating, setCreating]     = useState(false);

  const loadRounds = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${API}/inventory-rounds`);
      const json = await res.json().catch(() => ({}));
      setRounds(toArray(json));
    } catch { setError(t('inv_load_error')); setRounds([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRounds(); setSelected(new Set()); }, [loadRounds]);

  // Filter client-side: status tab + date range
  const filteredRounds = rounds.filter(r => {
    if (statusTab === 'active'    && r.status !== 'active') return false;
    if (statusTab === 'draft'     && r.status !== 'draft' && r.status !== 'paused') return false;
    if (statusTab === 'completed' && r.status !== 'completed' && r.status !== 'closed') return false;
    // Date range: round có overlap với khoảng [dateFrom, dateTo]
    // Round được tính là nằm trong khoảng nếu started_at <= dateTo VÀ end/closed >= dateFrom
    if (dateFrom || dateTo) {
      const rStart = r.started_at ? new Date(r.started_at).toISOString().slice(0,10) : null;
      const rEnd   = (r.closed_at || r.end_date) ? new Date(r.closed_at || r.end_date).toISOString().slice(0,10) : null;
      // Nếu dateFrom set: round phải bắt đầu trước hoặc kết thúc sau dateFrom
      if (dateFrom && rEnd   && rEnd   < dateFrom) return false;
      if (dateFrom && !rEnd  && rStart && rStart < dateFrom && r.status !== 'active') return false;
      // Nếu dateTo set: round phải bắt đầu trước dateTo
      if (dateTo   && rStart && rStart > dateTo)   return false;
    }
    return true;
  });

  const createRound = async () => {
    if (!createForm.name.trim()) { alert(t('inv_create_name_required')); return; }
    setCreating(true);
    try {
      const res  = await fetch(`${API}/inventory-rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error();
      const json = await res.json().catch(() => ({}));
      if (json.success || json.id) {
        alert(`✅ ${t('inv_create_success')}`);
        setShowCreate(false);
        setCreateForm({ name: '', description: '', started_at: '', end_date: '' });
        loadRounds();
      } else { alert(json.message || t('inv_create_failed')); setShowCreate(false); }
    } catch { alert(`❌ ${t('inv_create_error')}`); }
    finally { setCreating(false); }
  };

  const patchStatus = async (r, action) => {
    if (!confirm(t(action.confirmKey))) return;
    try {
      const body = { status: action.next };
      // Khi kết thúc → để backend tự set closed_at = NOW()
      // Khi mở lại  → reset closed_at về null
      if (action.next === 'active') body.closed_at = null;
      const res = await fetch(`${API}/inventory-rounds/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.message || t('inv_status_change_error')); return; }
      loadRounds();
    } catch { alert(t('inv_status_change_error')); }
  };

  const deleteRound = async (round, e) => {
    e?.stopPropagation();
    const name = typeof round === 'object' ? round.name : '';
    if (!confirm(t('inv_confirm_delete_round', { name: name ? ` "${name}"` : '' }))) return;
    await fetch(`${API}/inventory-rounds/${typeof round === 'object' ? round.id : round}`, { method: 'DELETE' }).catch(console.error);
    loadRounds();
  };

  const bulkDelete = async () => {
    if (!selected.size || !confirm(t('inv_confirm_bulk_delete', { count: selected.size }))) return;
    await Promise.all([...selected].map(id => fetch(`${API}/inventory-rounds/${id}`, { method: 'DELETE' }).catch(() => {})));
    setSelected(new Set()); loadRounds();
  };

  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === filteredRounds.length ? new Set() : new Set(filteredRounds.map(r => r.id)));

  const stats = {
    total:     rounds.length,
    active:    rounds.filter(r => r.status === 'active').length,
    draft:     rounds.filter(r => r.status === 'draft' || r.status === 'paused').length,
    completed: rounds.filter(r => r.status === 'completed' || r.status === 'closed').length,
  };

  if (detail) {
    return (
      <RoundDetail
        round={detail}
        onBack={() => setDetail(null)}
        onRoundUpdate={(updated) => {
          setRounds(rs => rs.map(r => r.id === updated.id ? updated : r));
          setDetail(updated);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f4f5f7] font-sans overflow-hidden">

      {/* Header */}
      <div className="px-6 py-5 border-b bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('inv_rounds_title')}</h1>
          <p className="text-gray-500 text-sm">{t('inv_rounds_subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-2xl p-1">
            {[['all', t('all')], ['active', t('inv_status_active')], ['draft', t('inv_status_draft')], ['completed', t('inv_status_completed')]].map(([key, label]) => (
              <button key={key} onClick={() => setStatusTab(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  statusTab === key ? 'bg-white shadow text-[#079DD9]' : 'text-gray-500 hover:text-gray-700'
                }`}>{label}</button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#079DD9] hover:bg-[#0589c0] text-white font-semibold rounded-2xl shadow transition active:scale-95">
            <span className="text-xl leading-none">+</span> {t('inv_create_btn')}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-3 bg-white border-b flex items-center gap-6 text-sm text-gray-600 shrink-0 flex-wrap">
        <div><span className="font-semibold text-gray-900">{stats.total}</span> {t('inv_rounds_count')}</div>
        <div className="text-emerald-600"><span className="font-semibold">{stats.active}</span> {t('inv_status_active')}</div>
        <div className="text-amber-600"><span className="font-semibold">{stats.draft}</span> {t('inv_status_draft')}</div>
        <div className="text-blue-600"><span className="font-semibold">{stats.completed}</span> {t('inv_status_completed')}</div>
        {/* Date range filter */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400">{t('from_date')}</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40" />
          <span className="text-xs text-gray-400">{t('to_date')}</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-all px-1">✕ {t('clear_filter')}</button>
          )}
        </div>
        {selected.size > 0 && (
          <button onClick={bulkDelete} className="ml-auto text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
            🗑️ {t('inv_delete_selected', { count: selected.size })}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        {loading && <div className="flex justify-center items-center h-full py-20 text-gray-400">{t('inv_loading')}</div>}
        {!loading && error && <div className="flex justify-center items-center py-20 text-red-500">{error}</div>}
        {!loading && !error && filteredRounds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg font-medium text-gray-600">{t('inv_no_rounds')}</p>
            <p className="text-sm mt-1">{t('inv_no_rounds_hint')}</p>
          </div>
        )}

        {!loading && filteredRounds.length > 0 && (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-xs font-semibold text-gray-500 uppercase border-b">
                <th className="pl-6 py-4 w-10 text-left">
                  <input type="checkbox" checked={selected.size === filteredRounds.length && filteredRounds.length > 0} onChange={toggleAll} className="accent-[#079DD9]" />
                </th>
                <th className="px-4 py-4 text-left">{t('inv_round_name')}</th>
                <th className="px-4 py-4 text-left">{t('inv_status')}</th>
                <th className="px-4 py-4 text-left">{t('inv_time')}</th>
                <th className="px-4 py-4 text-right">{t('devices')}</th>
                <th className="px-4 py-4 text-center">{t('inv_action')}</th>
                <th className="w-12 pr-6"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRounds.map(r => {
                const exp        = isExpired(r);
                const hasActive  = rounds.some(x => x.status === 'active');
                // Ẩn "Tiếp tục" nếu hết hạn, ẩn "Bắt đầu"/"Tiếp tục" nếu đang có round active khác
                const actions = (STATUS_ACTIONS[r.status] || []).filter(a => {
                  if (a.next === 'active' && exp && r.status !== 'completed' && r.status !== 'closed') return false;
                  if (a.next === 'active' && hasActive && r.status !== 'active') return false;
                  return true;
                });
                return (
                  <tr key={r.id} onClick={() => setDetail(r)}
                    className="border-b hover:bg-[#e8f6fd]/40 cursor-pointer transition-all group">
                    <td className="pl-6 py-4" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="accent-[#079DD9]" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-gray-900 group-hover:text-[#079DD9] transition-colors">{r.name}</div>
                      {r.description && <div className="text-xs text-gray-500 mt-0.5">{r.description}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge status={r.status} />
                        {exp && r.status !== 'completed' && r.status !== 'closed' && <ExpiredChip />}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {(() => {
                        const start = r.started_at;
                        const end   = r.closed_at || r.end_date;
                        if (start && end) return (
                          <span>{new Date(start).toLocaleDateString('vi-VN')} — {new Date(end).toLocaleDateString('vi-VN')}</span>
                        );
                        if (start) return (
                          <span>{new Date(start).toLocaleDateString('vi-VN')} <span className="text-emerald-600">→ {t('inv_status_active')}</span></span>
                        );
                        if (end) return (
                          <span className="text-gray-500">{t('inv_ended')} {new Date(end).toLocaleDateString('vi-VN')}</span>
                        );
                        return <span className="text-gray-400">{t('inv_no_time')}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-gray-700">{r.audited_count ?? 0}/{r.item_count ?? 0}</td>

                    <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {actions.map(action => (
                          <button key={action.next}
                            onClick={e => { e.stopPropagation(); patchStatus(r, action); }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap flex items-center gap-1 ${action.style}`}>
                            {action.icon} {t(action.labelKey)}
                          </button>
                        ))}
                        {exp && r.status !== 'completed' && r.status !== 'closed' && (
                          <button
                            onClick={e => { e.stopPropagation(); setDetail(r); }}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold border bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 transition-all whitespace-nowrap">
                            📅 {t('inv_extend_btn')}
                          </button>
                        )}
                        {actions.length === 0 && !exp && (
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                      </div>
                    </td>

                    <td className="pr-6 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={e => deleteRound(r, e)}
                        className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-xl transition-all">
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Tạo Đợt */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-5">{t('inv_create_title')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv_round_name')} <span className="text-red-500">*</span></label>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({...f, name: e.target.value}))}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#079DD9]"
                  placeholder={t('inv_create_name_placeholder')} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv_description')}</label>
                <textarea value={createForm.description} onChange={e => setCreateForm(f => ({...f, description: e.target.value}))}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#079DD9]" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv_started_at')}</label>
                  <input type="date" value={createForm.started_at} onChange={e => setCreateForm(f => ({...f, started_at: e.target.value}))} className="w-full border border-gray-300 rounded-2xl px-4 py-3" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inv_end_date')}</label>
                  <input type="date" value={createForm.end_date} onChange={e => setCreateForm(f => ({...f, end_date: e.target.value}))} className="w-full border border-gray-300 rounded-2xl px-4 py-3" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-3 border border-gray-300 rounded-2xl font-medium hover:bg-gray-50">{t('cancel')}</button>
              <button onClick={createRound} disabled={creating}
                className="flex-1 py-3 bg-[#079DD9] text-white rounded-2xl font-semibold hover:bg-[#0589c0] disabled:opacity-70 transition-all">
                {creating ? t('inv_creating') : t('inv_create_submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}