import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import AdminMapTab from './AdminMapTab'; 
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const API = '/api';
const toArray = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);

// ─── Pagination hook ──────────────────────────────────────────
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_ALL     = 9999;

function usePager(data, pageSize = PAGE_SIZE_DEFAULT) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);

  // Reset về trang 1 khi data hoặc size thay đổi
  useEffect(() => { setPage(1); }, [data.length, size]);

  const totalPages = Math.max(1, Math.ceil(data.length / size));
  const start      = (page - 1) * size;
  const paged      = size >= PAGE_SIZE_ALL ? data : data.slice(start, start + size);

  return { paged, page, setPage, size, setSize, totalPages, total: data.length };
}

// ─── Pagination UI ────────────────────────────────────────────
function Pagination({ page, setPage, size, setSize, totalPages, total, paged }) {
  const { t }           = useTranslation();
  if (total === 0) return null;
  const showingAll = size >= PAGE_SIZE_ALL;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t mt-2 text-sm text-gray-500">
      <span>
        {showingAll
          ? <> {t('showing')} <strong className="text-gray-800">{total}</strong> {t('items')}</>
          : <> {t('page')} <strong className="text-gray-800">{page}</strong>/{totalPages} &nbsp;·&nbsp; <strong className="text-gray-800">{paged.length}</strong>/{total} {t('items')}</>
        }
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {!showingAll && (
          <>
            <Btn color="gray" size="sm" onClick={() => setPage(1)}       disabled={page === 1}>«</Btn>
            <Btn color="gray" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</Btn>
            <Btn color="gray" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</Btn>
            <Btn color="gray" size="sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</Btn>
          </>
        )}
        {showingAll
          ? <Btn color="indigo" size="sm" onClick={() => setSize(PAGE_SIZE_DEFAULT)}>{t('show_less')}</Btn>
          : <Btn color="gray"   size="sm" onClick={() => setSize(PAGE_SIZE_ALL)}>{t('show_all')} {total}</Btn>
        }
      </div>
    </div>
  );
}

const TABS_CONFIG = [
  { id: 'dashboard',   labelKey: 'dashboard',      icon: '📊' },
  { id: 'users',       labelKey: 'manage_users',   icon: '👤' },
  { id: 'devices',     labelKey: 'manage_devices', icon: '💻' },
  { id: 'deviceTypes', labelKey: 'device_types',   icon: '📦' },
  // { id: 'reports',     labelKey: 'reports',        icon: '📋' },
  { id: 'audit',       labelKey: 'audit',          icon: '🔍' },
  { id: 'map',         labelKey: 'map',            icon: '🗺️' },
];

// ─── Shared UI helpers ────────────────────────────────────────
function Card({ children, className = '' }) {
  return <div className={'bg-white rounded-xl shadow p-4 md:p-6 ' + className}>{children}</div>;
}
function SectionTitle({ children }) {
  return <h2 className="text-xl md:text-2xl font-bold text-gray-800">{children}</h2>;
}
function Btn({ onClick, color = 'indigo', size = 'md', children, className = '', disabled, ...rest }) {
  const colors = {
    indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    green:  'bg-green-600  hover:bg-green-700  text-white',
    red:    'bg-red-500    hover:bg-red-600    text-white',
    yellow: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
    gray:   'bg-gray-200   hover:bg-gray-300   text-gray-700',
    orange: 'bg-orange-100 hover:bg-orange-200 text-orange-600',
    blue:   'bg-blue-500   hover:bg-blue-600   text-white',
  };
  const sizes = { sm: 'px-3 py-1 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={'rounded-lg font-medium transition-colors disabled:opacity-40 ' + colors[color] + ' ' + sizes[size] + ' ' + className}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────
function SidebarContent({ tab, user, selectTab, handleLogout, onClose }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="p-4 text-lg font-bold border-b border-indigo-500 flex items-center justify-between flex-shrink-0">
        <span>🛠️ {t('admin_panel')}</span>
        {onClose && <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none md:hidden">✕</button>}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {TABS_CONFIG.map(item => (
          <button
            key={item.id}
            onClick={() => selectTab(item.id)}
            className={'w-full text-left px-4 py-2.5 rounded-lg transition-colors text-sm ' +
              (tab === item.id ? 'bg-white/20 font-semibold' : 'hover:bg-white/10')}
          >
            {item.icon} <span className="ml-1">{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-indigo-500 flex-shrink-0">
        <div className="text-xs text-indigo-300 mb-2">👤 {user.username}</div>
        <button onClick={handleLogout} className="w-full py-2 bg-red-500 rounded-lg hover:bg-red-600 text-sm text-white font-medium">🚪 {t('logout')}</button>
      </div>
    </>
  );
}

// ─── Admin Shell ──────────────────────────────────────────────
export default function Admin() {
  const navigate        = useNavigate();
  const { t }           = useTranslation();
  const [tab, setTab]   = useState('dashboard');
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false); // mobile sidebar

  useEffect(() => {
    fetch('/api/current-user')
      .then(r => r.json())
      .then(d => {
        const u = d.user || d;
        if (!u?.id)             { navigate('/login', { replace: true }); return; }
        if (u.role !== 'admin') { alert(t('contact_it_support')); navigate('/scan', { replace: true }); return; }
        setUser(u);
      })
      .catch(() => navigate('/login', { replace: true }));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.replace('/login');
  };

  const selectTab = (id) => { setTab(id); setOpen(false); };

  if (!user) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-gray-400 animate-pulse text-sm">{t('authenticating')}</div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-indigo-700 text-white flex-col flex-shrink-0">
        <SidebarContent tab={tab} user={user} selectTab={selectTab} handleLogout={handleLogout} />
      </aside>

      {/* Mobile sidebar drawer */}
      {open && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={'fixed inset-y-0 left-0 z-50 w-64 bg-indigo-700 text-white flex flex-col shadow-2xl transform transition-transform duration-300 md:hidden ' + (open ? 'translate-x-0' : '-translate-x-full')}>
        <SidebarContent tab={tab} user={user} selectTab={selectTab} handleLogout={handleLogout} onClose={() => setOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden bg-indigo-700 text-white flex items-center justify-between px-4 py-3 shadow flex-shrink-0">
          <button onClick={() => setOpen(true)} className="text-2xl leading-none w-8">☰</button>
          <span className="font-bold text-sm">{TABS_CONFIG.find(item => item.id === tab)?.icon} {t(TABS_CONFIG.find(item => item.id === tab)?.labelKey ?? '')}</span>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {tab === 'dashboard'   && <Dashboard />}
          {tab === 'users'       && <Users />}
          {tab === 'devices'     && <Devices />}
          {tab === 'deviceTypes' && <DeviceTypes />}
          {tab === 'reports'     && <Reports />}
          {tab === 'audit'       && <AuditTab />}
          {tab === 'map' && <AdminMapTab />}
        </main>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────
function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats]             = useState([]);
  const [deptDevices, setDeptDevices] = useState(null);
  const [deptName, setDeptName]       = useState('');
  const overallRef = useRef(null);
  const deptRef    = useRef(null);
  const charts     = useRef({});

  useEffect(() => {
    loadCharts();
  }, []);

  const loadCharts = async () => {
    const arr = toArray(await fetch(API + '/stats/departments').then(r => r.json()).catch(() => []));
    setStats(arr);
    const total   = arr.reduce((s, d) => s + (d.total_devices   || 0), 0);
    const scanned = arr.reduce((s, d) => s + (d.scanned_devices || 0), 0);
    if (overallRef.current) {
      charts.current.overall?.destroy();
      charts.current.overall = new Chart(overallRef.current, {
        type: 'doughnut',
        data: { labels: [t('scanned'), t('not_scanned')], datasets: [{ data: [scanned, Math.max(0, total - scanned)], backgroundColor: ['#22c55e', '#ef4444'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }
    if (deptRef.current) {
      charts.current.dept?.destroy();
      charts.current.dept = new Chart(deptRef.current, {
        type: 'bar',
        data: { labels: arr.map(s => s.department_name), datasets: [
          { label: t('scanned'),     data: arr.map(s => s.scanned_devices), backgroundColor: '#22c55e' },
          { label: t('not_scanned'), data: arr.map(s => s.pending_devices),  backgroundColor: '#ef4444' },
        ]},
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          onClick: (_, item) => { if (item.length > 0) { const d = arr[item[0].index]; viewDept(d.department_id, d.department_name); } } },
      });
    }
  };

  const viewDept = async (id, name) => {
    const data = await fetch(API + '/departments/' + id + '/devices').then(r => r.json()).catch(() => []);
    setDeptDevices(toArray(data)); setDeptName(name);
  };

  const exportDept = () => {
    if (!deptDevices?.length) { alert(t('no_data_found')); return; }
    const ws = XLSX.utils.json_to_sheet(deptDevices);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, deptName);

    XLSX.writeFile(wb, 'Dept_' + deptName + '.xlsx');
  };

  const total   = stats.reduce((s, d) => s + (d.total_devices   || 0), 0);
  const scanned = stats.reduce((s, d) => s + (d.scanned_devices || 0), 0);

  return (
    <div className="space-y-5">
      <SectionTitle>📊 {t('dashboard')}</SectionTitle>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: t('total_devices'), value: total,           color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: t('scanned'),       value: scanned,         color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: t('not_scanned'),   value: total - scanned, color: 'text-red-500',    bg: 'bg-red-50'    },
        ].map((c, i) => (
          <div key={i} className={'rounded-xl p-4 text-center shadow ' + c.bg}>
            <div className={'text-2xl font-bold ' + c.color}>{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Charts - stack on mobile, side by side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">{t('total_devices')}</h3>
          <div className="flex justify-center"><div className="w-44 h-44"><canvas ref={overallRef} /></div></div>
        </Card>
        <Card>
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">{t('department_progress')}</h3>
          <canvas ref={deptRef} height={160} />
        </Card>
      </div>

      {/* Dept detail */}
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
                    <td className="border p-2 text-sm">{d.name}</td>
                    <td className="border p-2 text-xs hidden sm:table-cell">{d.location || '—'}</td>
                    <td className={'border p-2 text-center text-xs font-medium ' + (d.status === 'Đã quét' ? 'text-green-600' : 'text-red-500')}>{d.status || t('not_scanned')}</td>
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

// ─── Users ────────────────────────────────────────────────────
function Users() {
  const { t } = useTranslation();
  const [users, setUsers]       = useState([]);
  const [depts, setDepts]       = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm]         = useState({ username: '', password: '', full_name: '', department_id: '', section_id: '', group_id: '', cost_center_id: '', role: 'user' });
  const [importResult, setImportResult] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const userFileRef = useRef(null);

  // Cascade data for form
  const [formSections, setFormSections] = useState([]);
  const [formGroups,   setFormGroups]   = useState([]);
  const [formCosts,    setFormCosts]    = useState([]);

  // Cascade data for edit modal
  const [editSections, setEditSections] = useState([]);
  const [editGroups,   setEditGroups]   = useState([]);
  const [editCosts,    setEditCosts]    = useState([]);

  useEffect(() => {
    fetchUsers();
    fetch(API + '/departments').then(r => r.json()).then(d => setDepts(toArray(d))).catch(() => {});
  }, []);

  // Form cascades
  useEffect(() => {
    setFormSections([]); setFormGroups([]); setFormCosts([]);
    setForm(f => ({...f, section_id: '', group_id: '', cost_center_id: ''}));
    if (!form.department_id) return;
    fetch(API + '/departments/' + form.department_id + '/sections').then(r => r.json()).then(d => setFormSections(toArray(d))).catch(() => {});
  }, [form.department_id]);

  useEffect(() => {
    setFormGroups([]); setFormCosts([]);
    setForm(f => ({...f, group_id: '', cost_center_id: ''}));
    if (!form.section_id) return;
    fetch(API + '/sections/' + form.section_id + '/groups').then(r => r.json()).then(d => setFormGroups(toArray(d))).catch(() => {});
  }, [form.section_id]);

  useEffect(() => {
    setFormCosts([]);
    setForm(f => ({...f, cost_center_id: ''}));
    if (!form.group_id) return;
    fetch(API + '/groups/' + form.group_id + '/cost-centers').then(r => r.json()).then(d => setFormCosts(toArray(d))).catch(() => {});
  }, [form.group_id]);

  // Edit modal cascades
  useEffect(() => {
    setEditSections([]); setEditGroups([]); setEditCosts([]);
    if (!editUser?.department_id) return;
    fetch(API + '/departments/' + editUser.department_id + '/sections').then(r => r.json()).then(d => setEditSections(toArray(d))).catch(() => {});
  }, [editUser?.department_id]);

  useEffect(() => {
    setEditGroups([]); setEditCosts([]);
    if (!editUser?.section_id) return;
    fetch(API + '/sections/' + editUser.section_id + '/groups').then(r => r.json()).then(d => setEditGroups(toArray(d))).catch(() => {});
  }, [editUser?.section_id]);

  useEffect(() => {
    setEditCosts([]);
    if (!editUser?.group_id) return;
    fetch(API + '/groups/' + editUser.group_id + '/cost-centers').then(r => r.json()).then(d => setEditCosts(toArray(d))).catch(() => {});
  }, [editUser?.group_id]);

  const fetchUsers = async () => { setUsers(toArray(await fetch(API + '/users').then(r => r.json()).catch(() => []))); setSelected(new Set()); };

  const downloadUserTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['username', 'password', 'full_name', 'department_name', 'section_name', 'group_name', 'cost_center_name', 'role'],
      ['nguyenvana', '123456', 'Nguyễn Văn A', 'Phòng IT',         'Section A', 'Group 1', 'CC-001', 'user'],
      ['tranthib',   '123456', 'Trần Thị B',   'Phòng Hành Chính', 'Section B', 'Group 2', 'CC-002', 'auditor'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'User_Template.xlsx');
  };

  const importUsersFromExcel = async () => {
    const file = userFileRef.current?.files?.[0];
    if (!file) { alert('Vui lòng chọn file Excel trước!'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) { alert('File Excel trống hoặc sai định dạng'); return; }

      // Build dept map từ depts đã load sẵn
      const deptMap = {};
      depts.forEach(d => { deptMap[d.name.trim().toLowerCase()] = d.id; });

      // Fetch sections cho tất cả depts song song
      const allSections = (await Promise.all(
        depts.map(d =>
          fetch(API + '/departments/' + d.id + '/sections').then(r => r.json())
            .then(d => toArray(d)).catch(() => [])
        )
      )).flat();

      // Fetch groups cho tất cả sections song song
      const allGroups = (await Promise.all(
        allSections.map(s =>
          fetch(API + '/sections/' + s.id + '/groups').then(r => r.json())
            .then(d => toArray(d)).catch(() => [])
        )
      )).flat();

      // Fetch cost centers cho tất cả groups song song
      const allCosts = (await Promise.all(
        allGroups.map(g =>
          fetch(API + '/groups/' + g.id + '/cost-centers').then(r => r.json())
            .then(d => toArray(d)).catch(() => [])
        )
      )).flat();

      // Build lookup maps tên → id
      const secMap = {};
      allSections.forEach(s => { secMap[s.name.trim().toLowerCase()] = s.id; });
      const grpMap = {};
      allGroups.forEach(g => { grpMap[g.name.trim().toLowerCase()] = g.id; });
      const ccMap = {};
      allCosts.forEach(c => { ccMap[c.name.trim().toLowerCase()] = c.id; });

      let ok = 0, fail = 0, failList = [];
      for (const row of rows) {
        const username = String(row.username || '').trim();
        const password = String(row.password || '').trim();
        if (!username || !password) { fail++; failList.push('Thiếu username/password'); continue; }

        const payload = {
          username,
          password,
          full_name:      String(row.full_name         || '').trim(),
          role:           String(row.role              || 'user').trim(),
          department_id:  deptMap[String(row.department_name  || '').trim().toLowerCase()] || null,
          section_id:     secMap[String(row.section_name      || '').trim().toLowerCase()] || null,
          group_id:       grpMap[String(row.group_name        || '').trim().toLowerCase()] || null,
          cost_center_id: ccMap[String(row.cost_center_name   || '').trim().toLowerCase()] || null,
        };

        try {
          const data = await fetch(API + '/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).then(r => r.json());
          if (data.success || data.id) ok++;
          else { fail++; failList.push(username + ': ' + (data.message || 'lỗi')); }
        } catch { fail++; failList.push(username + ': lỗi mạng'); }
      }
      setImportResult({ ok, fail, failList });
      fetchUsers();
      userFileRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const createUser = async (e) => {
    e.preventDefault();
    const data = await fetch(API + '/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).then(r => r.json());
    alert(data.message); fetchUsers();
    setForm({ username: '', password: '', full_name: '', department_id: '', section_id: '', group_id: '', cost_center_id: '', role: 'user' });
    setShowForm(false);
  };

  const deleteUser = async (id) => {
    if (!confirm('Xóa tài khoản này?')) return;
    const data = await fetch(API + '/users/' + id, { method: 'DELETE' }).then(r => r.json());
    alert(data.success ? 'Xóa thành công' : data.message); if (data.success) fetchUsers();
  };

  const deleteSelected = async () => {
    if (!selected.size || !confirm('Xóa ' + selected.size + ' tài khoản đã chọn?')) return;
    await Promise.all([...selected].map(id => fetch(API + '/users/' + id, { method: 'DELETE' }))); fetchUsers();
  };

  const saveEdit = async () => {
    const body = {
      full_name:      editUser.full_name,
      department_id:  editUser.department_id,
      section_id:     editUser.section_id     || null,
      group_id:       editUser.group_id       || null,
      cost_center_id: editUser.cost_center_id || null,
      role:           editUser.role,
    };
    if (editUser.password) body.password = editUser.password;
    const data = await fetch(API + '/users/' + editUser.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    alert(data.message); setEditUser(null); fetchUsers();
  };

  const userPager = usePager(users);

  const toggleOne = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => selected.size === users.length ? setSelected(new Set()) : setSelected(new Set(users.map(u => u.id)));
  const roleColor = r => r === 'admin' ? 'bg-red-100 text-red-700' : r === 'auditor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>👤 {t('manage_users')}</SectionTitle>
        <Btn onClick={() => setShowForm(s => !s)} color={showForm ? 'gray' : 'indigo'}>{showForm ? '✕ ' + t('close') : '+ ' + t('create_user')}</Btn>
      </div>

      {/* Create form – collapsible */}
      {showForm && (
        <Card>
          <h3 className="font-semibold text-gray-700 mb-4">{t('create_user')}</h3>
          <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.username}  onChange={e => setForm(f => ({...f, username: e.target.value}))}  placeholder={t('username')} required className="p-3 border rounded-lg text-sm" />
            <input value={form.password}  onChange={e => setForm(f => ({...f, password: e.target.value}))}  placeholder={t('password')} type="password" required className="p-3 border rounded-lg text-sm" />
            <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} placeholder={t('full_name')} className="p-3 border rounded-lg text-sm" />

            {/* Role */}
            <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} className="p-3 border rounded-lg text-sm">
              <option value="user">{t('user')}</option>
              <option value="auditor">{t('auditor')}</option>
              <option value="admin">{t('admin')}</option>
            </select>

            {/* Department */}
            <select value={form.department_id} onChange={e => setForm(f => ({...f, department_id: e.target.value}))} className="p-3 border rounded-lg text-sm">
              <option value="">-- {t('select_department')} --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            {/* Section */}
            <select value={form.section_id} onChange={e => setForm(f => ({...f, section_id: e.target.value}))} className="p-3 border rounded-lg text-sm" disabled={!form.department_id}>
              <option value="">-- Section --</option>
              {formSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {/* Group */}
            <select value={form.group_id} onChange={e => setForm(f => ({...f, group_id: e.target.value}))} className="p-3 border rounded-lg text-sm" disabled={!form.section_id}>
              <option value="">-- Group --</option>
              {formGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            {/* Cost Center */}
            <select value={form.cost_center_id} onChange={e => setForm(f => ({...f, cost_center_id: e.target.value}))} className="p-3 border rounded-lg text-sm" disabled={!form.group_id}>
              <option value="">-- Cost Center --</option>
              {formCosts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <button type="submit" className="sm:col-span-2 bg-indigo-600 text-white p-3 rounded-lg text-sm font-medium hover:bg-indigo-700">✅ {t('create_user')}</button>
          </form>
        </Card>
      )}

      {/* Import Excel */}
      <Card>
        <h3 className="font-semibold text-gray-700 mb-3">📥 {t('upload_excel')}</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <Btn color="green" size="sm" onClick={downloadUserTemplate}>📄 {t('download_template')}</Btn>
          <input type="file" ref={userFileRef} accept=".xlsx,.xls" className="border p-1.5 rounded text-xs flex-1 min-w-0" />
          <Btn color="purple" size="sm" onClick={importUsersFromExcel}>📤 {t('import_users')}</Btn>
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('required_columns')}: username, password, full_name, department_name, role</p>
        {importResult && (
          <div className={'mt-3 p-3 rounded-lg text-sm ' + (importResult.fail > 0 ? 'bg-yellow-50 border border-yellow-300' : 'bg-green-50 border border-green-300')}>
            <p className="font-semibold">{t('import_result')}: {importResult.ok} | {t('failed')}: {importResult.fail}</p>
            {importResult.failList.length > 0 && <ul className="mt-1 text-xs text-red-600">{importResult.failList.map((m, i) => <li key={i}>• {m}</li>)}</ul>}
            <button onClick={() => setImportResult(null)} className="mt-2 text-xs text-gray-400 underline">{t('close')}</button>
          </div>
        )}
      </Card>

      {/* User list */}
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-gray-700">{t('user_list')} ({users.length})</h3>
          {selected.size > 0 && <Btn color="red" size="sm" onClick={deleteSelected}>🗑️ {t('delete_selected').replace('{{n}}', selected.size)}</Btn>}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {users.length === 0 && <p className="text-gray-400 text-sm text-center py-4">{t('no_users_found')}</p>}
          {userPager.paged.map(u => (
            <div key={u.id} className={'border rounded-xl p-3 ' + (selected.has(u.id) ? 'bg-red-50 border-red-200' : 'bg-gray-50')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-800 truncate">{u.full_name || u.username}</div>
                    <div className="text-xs text-gray-500">@{u.username}</div>
                    <div className="text-xs text-gray-500">{u.department_name || '—'}</div>
                  </div>
                </div>
                <span className={'px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ' + roleColor(u.role)}>{u.role}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <Btn color="yellow" size="sm" onClick={() => setEditUser({...u, password: ''})}>✏️ {t('edit')}</Btn>
                <Btn color="red"    size="sm" onClick={() => deleteUser(u.id)}>🗑️ {t('delete')}</Btn>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border">
            <thead><tr className="bg-gray-100 text-left">
              <th className="p-2 border w-8"><input type="checkbox" checked={selected.size === users.length && users.length > 0} onChange={toggleAll} /></th>
              <th className="p-2 border w-8">#</th>
              <th className="p-2 border">{t('username')}</th>
              <th className="p-2 border">{t('full_name')}</th>
              <th className="p-2 border">{t('department')}</th>
              <th className="p-2 border">Section</th>
              <th className="p-2 border">Group</th>
              <th className="p-2 border">Cost Center</th>
              <th className="p-2 border">{t('role')}</th>
              <th className="p-2 border">{t('action')}</th>
            </tr></thead>
            <tbody>
              {userPager.paged.map((u, idx) => (
                <tr key={u.id} className={'hover:bg-gray-50 ' + (selected.has(u.id) ? 'bg-red-50' : '')}>
                  <td className="border p-2 text-center"><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} /></td>
                  <td className="border p-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                  <td className="border p-2">{u.username}</td>
                  <td className="border p-2">{u.full_name}</td>
                  <td className="border p-2 text-xs">{u.department_name || '—'}</td>
                  <td className="border p-2 text-xs">{u.section_name    || '—'}</td>
                  <td className="border p-2 text-xs">{u.group_name      || '—'}</td>
                  <td className="border p-2 text-xs">{u.cost_center     || '—'}</td>
                  <td className="border p-2 text-center"><span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + roleColor(u.role)}>{u.role}</span></td>
                  <td className="border p-2 text-center space-x-1">
                    <Btn color="yellow" size="sm" onClick={() => setEditUser({...u, password: '', section_id: u.section_id || '', group_id: u.group_id || '', cost_center_id: u.cost_center_id || ''})}>✏️</Btn>
                    <Btn color="red"    size="sm" onClick={() => deleteUser(u.id)}>🗑️</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...userPager} />
      </Card>

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-sm shadow-xl p-6 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold">✏️ Chỉnh sửa User</h3>
            <input value={editUser.full_name} onChange={e => setEditUser(u => ({...u, full_name: e.target.value}))} placeholder="Họ tên" className="w-full p-3 border rounded-lg text-sm" />
            <input value={editUser.password}  onChange={e => setEditUser(u => ({...u, password: e.target.value}))}  placeholder="Mật khẩu mới (để trống = không đổi)" type="password" className="w-full p-3 border rounded-lg text-sm" />

            {/* Department */}
            <select value={editUser.department_id || ''} onChange={e => setEditUser(u => ({...u, department_id: e.target.value, section_id: '', group_id: '', cost_center_id: ''}))} className="w-full p-3 border rounded-lg text-sm">
              <option value="">-- Chọn bộ phận --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            {/* Section */}
            <select value={editUser.section_id || ''} onChange={e => setEditUser(u => ({...u, section_id: e.target.value, group_id: '', cost_center_id: ''}))} className="w-full p-3 border rounded-lg text-sm" disabled={!editUser.department_id}>
              <option value="">-- Section --</option>
              {editSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {/* Group */}
            <select value={editUser.group_id || ''} onChange={e => setEditUser(u => ({...u, group_id: e.target.value, cost_center_id: ''}))} className="w-full p-3 border rounded-lg text-sm" disabled={!editUser.section_id}>
              <option value="">-- Group --</option>
              {editGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>

            {/* Cost Center */}
            <select value={editUser.cost_center_id || ''} onChange={e => setEditUser(u => ({...u, cost_center_id: e.target.value}))} className="w-full p-3 border rounded-lg text-sm" disabled={!editUser.group_id}>
              <option value="">-- Cost Center --</option>
              {editCosts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Role */}
            <select value={editUser.role} onChange={e => setEditUser(u => ({...u, role: e.target.value}))} className="w-full p-3 border rounded-lg text-sm">
              <option value="user">User</option>
              <option value="auditor">Auditor</option>
              <option value="admin">Admin</option>
            </select>

            <div className="flex gap-2 pt-1">
              <Btn color="gray" onClick={() => setEditUser(null)} className="flex-1">Hủy</Btn>
              <Btn color="indigo" onClick={saveEdit} className="flex-1">💾 Lưu</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Devices ──────────────────────────────────────────────────
const dv = (v) => (v !== undefined && v !== null && v !== '') ? v : 'N/A';

function Devices() {
  const { t } = useTranslation();
  const [devices, setDevices]         = useState([]);
  const [selected, setSelected]       = useState(new Set());
  const [loading, setLoading]         = useState(false);

  // ── Department + Hierarchy CRUD state ────────────────────────
  const [departments, setDepts]       = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [deptError, setDeptError]     = useState('');
  const [editDept, setEditDept]       = useState(null);
  const [showDeptMgr, setShowDeptMgr] = useState(false);

  // Hierarchy sub-state
  const [openDept,   setOpenDept]   = useState(null);
  const [sections,   setSections]   = useState({});
  const [openSec,    setOpenSec]    = useState(null);
  const [groups,     setGroups]     = useState({});
  const [openGrp,    setOpenGrp]    = useState(null);
  const [costs,      setCosts]      = useState({});
  const [newSec,  setNewSec]  = useState('');
  const [newGrp,  setNewGrp]  = useState('');
  const [newCost, setNewCost] = useState('');

  // ── Multi-level filter state ───────────────────────────────────
  const [filterDept,    setFilterDept]    = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterGroup,   setFilterGroup]   = useState('');
  const [filterCost,    setFilterCost]    = useState('');

  // ── Search ────────────────────────────────────────────────────
  const [searchRaw,   setSearchRaw]   = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileRef     = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQuery(searchRaw.trim().toLowerCase()), 350);
    return () => clearTimeout(searchTimer.current);
  }, [searchRaw]);

  // ── Load: 2 requests song song thay vì N+3 requests tuần tự ──
  // /api/devices   → đã có JOIN: section_name, group_name, cost_center, department_name
  // /api/scans     → lấy user_name (người quét)
  // /api/departments → cho dropdown filter + dept manager
  const loadAll = async () => {
    setLoading(true);
    try {
      const [devData, scansData, deptsData, usersData] = await Promise.all([
        fetch(API + '/devices').then(r => r.json()).catch(() => []),
        fetch(API + '/scans').then(r => r.json()).catch(() => []),
        fetch(API + '/departments').then(r => r.json()).catch(() => []),
        fetch(API + '/users').then(r => r.json()).catch(() => []),
      ]);

      const rawDevices = toArray(devData);
      const depts      = toArray(deptsData);
      setDepts(depts);

      // Build dept id→name map
      const deptMap = {};
      depts.forEach(d => { deptMap[d.id] = d.name; });

      // Build user id→name map (để show người thêm thiết bị mới)
      const userMap = {};
      toArray(usersData).forEach(u => { userMap[u.id] = u.full_name || u.username || ''; });

      // Sort scans mới nhất trước, build scanInfoByQR
      const scans = Array.isArray(scansData) ? scansData : (scansData?.scans ?? []);
      const sortedScans = [...scans].sort((a, b) => {
        const ta = a.scanned_at ? new Date(a.scanned_at).getTime() : 0;
        const tb = b.scanned_at ? new Date(b.scanned_at).getTime() : 0;
        return tb - ta;
      });
      const scanInfoByQR = {};
      sortedScans.forEach(s => {
        if (s.qr_code && !scanInfoByQR[s.qr_code]) scanInfoByQR[s.qr_code] = s;
      });

      // Map devices
      const merged = rawDevices.map(dev => {
        const deptName  = dev.department_name || deptMap[dev.department_id] || '';
        const scanEntry = scanInfoByQR[dev.qr_code];
        const isNew     = dev.is_new === 1 || dev.is_new === '1' || dev.status === 'new';
        const scanned   = !!scanEntry;

        // status
        const status = scanned ? 'Đã quét' : (isNew ? 'Mới' : 'Chưa quét');

        // Section / Group / Cost Center: luôn lấy từ device (đã được gán khi add)
        const section_name = dev.section_name  || '';
        const group_name   = dev.group_name    || '';
        const cost_center  = dev.cost_center_name || dev.cost_center || '';

        // location: từ scan nếu đã quét, thiết bị mới thì show dept gốc
        const scanDept   = scanEntry?.scan_department || '';
        const deviceDept = deptName;
        let location = '';
        if (scanned) {
          location = (scanDept && scanDept !== deviceDept)
            ? 'Chuyển từ ' + deviceDept + ' → ' + scanDept
            : 'Đang ở ' + (scanDept || deptName);
        } else if (isNew && deptName) {
          location = 'Đang ở ' + deptName;
        }

        // user_name: scan entry nếu đã quét, added_by nếu thiết bị mới
        const user_name = scanned
          ? (scanEntry?.user_name || scanEntry?.username || '')
          : (isNew ? (userMap[dev.added_by] || '') : '');

        return {
          ...dev,
          _uid:            String(dev.id),
          _dept_id:        String(dev.department_id),
          department_name: deptName,
          section_name,
          group_name,
          cost_center,
          serial_number:   dev.qr_code || '',
          user_name,
          status,
          location,
        };
      });

      setDevices(merged);
    } finally {
      setLoading(false);
      setSelected(new Set());
    }
  };

  const fetchDepts = async () => {
    const data = await fetch(API + '/departments').then(r => r.json()).catch(() => []);
    setDepts(toArray(data));
  };

  const fetchDevices = () => loadAll();

  // ── Derived filter lists ──────────────────────────────────────
  const sectionOptions = [...new Set(
    devices
      .filter(d => !filterDept || String(d._dept_id) === filterDept)
      .map(d => d.section_name || d.section)
      .filter(Boolean)
  )];

  const groupOptions = [...new Set(
    devices
      .filter(d => {
        if (filterDept    && String(d._dept_id) !== filterDept)                return false;
        if (filterSection && (d.section_name || d.section) !== filterSection)  return false;
        return true;
      })
      .map(d => d.group_name || d.group)
      .filter(Boolean)
  )];

  const costOptions = [...new Set(
    devices
      .filter(d => {
        if (filterDept    && String(d._dept_id) !== filterDept)                return false;
        if (filterSection && (d.section_name || d.section) !== filterSection)  return false;
        if (filterGroup   && (d.group_name || d.group) !== filterGroup)        return false;
        return true;
      })
      .map(d => d.cost_center)
      .filter(Boolean)
  )];

  // ── Filter chính ──────────────────────────────────────────────
  const matchDept = (dev) => !filterDept || String(dev._dept_id) === filterDept;

  // Người quét: user_name join từ /api/scans
  const getScanner = (dev) => dev.user_name || '';

  const filtered = devices.filter(dev => {
    if (!matchDept(dev))                                                          return false;
    if (filterSection && (dev.section_name || dev.section) !== filterSection)     return false;
    if (filterGroup   && (dev.group_name || dev.group) !== filterGroup)           return false;
    if (filterCost    && dev.cost_center !== filterCost)                          return false;
    if (searchQuery) {
      const serial  = String(dev.serial_number || dev.qr_code || '').toLowerCase();
      const name    = String(dev.name || '').toLowerCase();
      const scanner = getScanner(dev).toLowerCase();
      if (!serial.includes(searchQuery) && !name.includes(searchQuery) && !scanner.includes(searchQuery)) return false;
    }
    return true;
  });

  // ── Department CRUD ───────────────────────────────────────────
  const addDept = async () => {
    const trimmed = newDeptName.trim();
    if (!trimmed) { setDeptError('Tên bộ phận không được để trống'); return; }
    if (departments.some(d => (d.name || '').trim().toLowerCase() === trimmed.toLowerCase())) {
      setDeptError('Bộ phận "' + trimmed + '" đã tồn tại'); return;
    }
    setDeptError('');
    try {
      const res  = await fetch(API + '/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (data.success || data.id) {
        await fetchDepts();
        setNewDeptName('');
      } else {
        setDeptError(data.message || 'Lỗi thêm bộ phận');
      }
    } catch (e) {
      setDeptError('Lỗi kết nối: ' + (e.message || ''));
    }
  };

  const saveDeptEdit = async () => {
    if (!editDept) return;
    const trimmed = editDept.name.trim();
    if (!trimmed) { alert('Tên không được để trống'); return; }
    if (departments.some(d => d.id !== editDept.id && (d.name || '').trim().toLowerCase() === trimmed.toLowerCase())) {
      alert('Bộ phận "' + trimmed + '" đã tồn tại'); return;
    }
    const data = await fetch(API + '/departments/' + editDept.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).then(r => r.json()).catch(() => ({}));
    if (data.success || data.id || data.message) { await fetchDepts(); setEditDept(null); }
    else alert(data.message || 'Lỗi cập nhật');
  };

  const deleteDept = async (id, name) => {
    try {
      const affected = toArray(await fetch(API + '/users').then(r => r.json()).catch(() => []))
        .filter(u => String(u.department_id) === String(id));
      if (affected.length > 0) {
        alert('Không thể xóa "' + name + '"!\nCó ' + affected.length + ' user đang thuộc bộ phận.\nVui lòng chuyển user trước.');
        return;
      }
    } catch {}
    if (!confirm('Xóa bộ phận "' + name + '" và toàn bộ Section/Group/Cost Center bên trong?')) return;
    const data = await fetch(API + '/departments/' + id, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
    if (data.success) {
      await fetchDepts();
      if (filterDept === String(id)) { setFilterDept(''); setFilterSection(''); setFilterGroup(''); setFilterCost(''); }
    } else alert(data.message || 'Lỗi xóa bộ phận');
  };

  // ── Hierarchy helpers ─────────────────────────────────────────
  const fetchSections = async (deptId) => {
    const data = await fetch(API + '/departments/' + deptId + '/sections').then(r => r.json()).catch(() => []);
    setSections(p => ({ ...p, [deptId]: toArray(data) }));
  };
  const fetchGroups = async (sectionId) => {
    const data = await fetch(API + '/sections/' + sectionId + '/groups').then(r => r.json()).catch(() => []);
    setGroups(p => ({ ...p, [sectionId]: toArray(data) }));
  };
  const fetchCosts = async (groupId) => {
    const data = await fetch(API + '/groups/' + groupId + '/cost-centers').then(r => r.json()).catch(() => []);
    setCosts(p => ({ ...p, [groupId]: toArray(data) }));
  };

  const toggleDept = (id) => {
    if (openDept === id) { setOpenDept(null); setOpenSec(null); setOpenGrp(null); return; }
    setOpenDept(id); setOpenSec(null); setOpenGrp(null);
    if (!sections[id]) fetchSections(id);
  };
  const toggleSec = (id) => {
    if (openSec === id) { setOpenSec(null); setOpenGrp(null); return; }
    setOpenSec(id); setOpenGrp(null);
    if (!groups[id]) fetchGroups(id);
  };
  const toggleGrp = (id) => {
    if (openGrp === id) { setOpenGrp(null); return; }
    setOpenGrp(id);
    if (!costs[id]) fetchCosts(id);
  };

  const addSection = async (deptId) => {
    const trimmed = newSec.trim(); if (!trimmed) return;
    const data = await fetch(API + '/departments/' + deptId + '/sections', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).then(r => r.json()).catch(() => ({}));
    if (data.success || data.id) { setNewSec(''); fetchSections(deptId); }
    else alert(data.message || 'Lỗi thêm section');
  };
  const deleteSection = async (sectionId, deptId, name) => {
    if (!confirm('Xóa section "' + name + '"?')) return;
    const data = await fetch(API + '/sections/' + sectionId, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
    if (data.success) { fetchSections(deptId); if (openSec === sectionId) { setOpenSec(null); setOpenGrp(null); } }
    else alert(data.message || 'Lỗi xóa section');
  };

  const addGroup = async (sectionId) => {
    const trimmed = newGrp.trim(); if (!trimmed) return;
    const data = await fetch(API + '/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, section_id: sectionId }),
    }).then(r => r.json()).catch(() => ({}));
    if (data.success || data.id) { setNewGrp(''); fetchGroups(sectionId); }
    else alert(data.message || 'Lỗi thêm group');
  };
  const deleteGroup = async (groupId, sectionId, name) => {
    if (!confirm('Xóa group "' + name + '"?')) return;
    const data = await fetch(API + '/groups/' + groupId, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
    if (data.success) { fetchGroups(sectionId); if (openGrp === groupId) setOpenGrp(null); }
    else alert(data.message || 'Lỗi xóa group');
  };

  const addCost = async (groupId) => {
    const trimmed = newCost.trim(); if (!trimmed) return;
    const data = await fetch(API + '/cost-centers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, group_id: groupId }),
    }).then(r => r.json()).catch(() => ({}));
    if (data.success || data.id) { setNewCost(''); fetchCosts(groupId); }
    else alert(data.message || 'Lỗi thêm cost center');
  };
  const deleteCost = async (costId, groupId, name) => {
    if (!confirm('Xóa cost center "' + name + '"?')) return;
    const data = await fetch(API + '/cost-centers/' + costId, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
    if (data.success) fetchCosts(groupId);
    else alert(data.message || 'Lỗi xóa cost center');
  };

  // ── Device CRUD ───────────────────────────────────────────────
  const deleteDevice = async (id) => {
    if (!confirm('Xóa thiết bị này?')) return;
    const data = await fetch(API + '/devices/' + id, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
    alert(data.message || 'Đã xóa'); fetchDevices();
  };

  const deleteSelected = async () => {
    if (!selected.size || !confirm('Xóa ' + selected.size + ' thiết bị đã chọn?')) return;

    // Lấy real id từ _uid
    const realIds = [...new Set(
      [...selected]
        .map(uid => devices.find(d => d._uid === uid)?.id)
        .filter(Boolean)
    )];

    // ✅ 1 request duy nhất thay vì N request song song → tránh 429
    const data = await fetch(API + '/devices/bulk', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: realIds }),
    }).then(r => r.json()).catch(() => ({}));

    if (!data.success) {
      alert(data.message || 'Lỗi xóa thiết bị');
      return;
    }

    fetchDevices();
  };

  const deleteAll = async () => {
    if (!confirm('Xóa TẤT CẢ thiết bị? Không thể hoàn tác!')) return;
    const data = await fetch(API + '/devices', { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
    alert(data.message || 'Đã xóa'); fetchDevices();
  };

  // Fix: tạo workbook đúng thứ tự và ghi file – có thêm Section / Group / Cost Center
  const downloadTemplate = () => {
    try {
      const rows = [
        ['Name', 'QR_Code', 'Department', 'Section', 'Group', 'CostCenter', 'DeviceType', 'Location'],
        ['Laptop Dell', 'QR001', 'Phòng IT',  'Section A', 'Group 1', 'CC-001', 'Laptop', 'Tầng 1'],
        ['Máy in HP',   'QR002', 'Phòng Hành Chính', 'Section B', 'Group 2', 'CC-002', 'Máy in', 'Tầng 2'],
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Devices');
      XLSX.writeFile(wb, 'Device_Template.xlsx');
    } catch (e) {
      alert('Không tải được mẫu: ' + e.message);
    }
  };

  const fmtStatus = (dev) => {
  if (!dev) return '';
  if (dev.status === 'active') return 'Đang sử dụng';
  if (dev.status === 'inactive') return 'Không sử dụng';
  if (dev.status === 'repair') return 'Đang sửa';
  return dev.status || '';
};

const fmtLocation = (dev) => {
  return dev.location || dev.room || dev.department_name || '';
};
  // Export danh sách đã filter ra Excel
  const exportFiltered = () => {
    if (!filtered.length) { alert('Không có dữ liệu để tải'); return; }
    try {
      const rows = [['Tên thiết bị', 'Serial Number', 'Người quét', 'Trạng thái', 'Đang ở Phòng', 'Department', 'Section', 'Group', 'Cost Center']];
      filtered.forEach(dev => rows.push([
        dev.name            || '',
        dev.serial_number   || dev.qr_code || '',
        dev.user_name       || dev.scannedBy || dev.scanned_by || '',
        fmtStatus(dev),
        fmtLocation(dev),
        dev.department_name || '',
        dev.section_name    || dev.section  || '',
        dev.group_name      || dev.group    || '',
        dev.cost_center     || '',
      ]));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Danh sách thiết bị');
      XLSX.writeFile(wb, 'DanhSachThietBi.xlsx');
    } catch (e) {
      alert('Lỗi xuất file: ' + e.message);
    }
  };

  const uploadExcel = async () => {
    if (!fileRef.current?.files?.length) { alert('Vui lòng chọn file Excel trước!'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const importNames   = rows.map(r => String(r.Name || r.name || '').trim().toLowerCase()).filter(Boolean);
      const existingNames = devices.map(d => (d.name || '').toLowerCase());
      const duplicates    = importNames.filter(n => existingNames.includes(n));
      if (duplicates.length > 0) {
        const msg = 'Phát hiện ' + duplicates.length + ' thiết bị trùng tên:\n' +
          duplicates.slice(0, 10).map(n => '• ' + n).join('\n') +
          (duplicates.length > 10 ? '\n... và ' + (duplicates.length - 10) + ' khác' : '') +
          '\n\nTiếp tục import?';
        if (!confirm(msg)) return;
      }
      // Map đầy đủ Section / Group / CostCenter từ file mẫu
      const mapped = rows.map(r => ({
        name:        String(r.Name        || r.name        || '').trim(),
        qr_code:     String(r.QR_Code     || r.qr_code     || '').trim(),
        department:  String(r.Department  || r.department  || '').trim(),
        section:     String(r.Section     || r.section     || '').trim(),
        group:       String(r.Group       || r.group       || '').trim(),
        costCenter:  String(r.CostCenter  || r.cost_center || r.Cost_Center || '').trim(),
        device_type: String(r.DeviceType  || r.device_type || '').trim(),
        location:    String(r.Location    || r.location    || '').trim(),
      }));
      // Gửi lên server kèm data đã map
      const formData = new FormData();
      formData.append('file', fileRef.current.files[0]);
      // Gửi thêm mapped data dưới dạng JSON để backend dùng nếu hỗ trợ
      formData.append('mappedData', JSON.stringify(mapped));
      const data = await fetch(API + '/devices/upload', { method: 'POST', credentials: 'include', body: formData }).then(r => r.json()).catch(e => ({ error: e.message }));
      alert(JSON.stringify(data, null, 2));
      fetchDevices();
    };
    reader.readAsArrayBuffer(fileRef.current.files[0]);
  };

  const toggleOne = (uid) => setSelected(p => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  const toggleAll = (list) => selected.size === list.length && list.length > 0
    ? setSelected(new Set())
    : setSelected(new Set(list.map(d => d._uid)));

  const resetFilters = () => { setFilterDept(''); setFilterSection(''); setFilterGroup(''); setFilterCost(''); setSearchRaw(''); };

  const hasFilter = filterDept || filterSection || filterGroup || filterCost || searchRaw;

  // Pagination
  const devPager = usePager(filtered);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>💻 {t('manage_devices')}</SectionTitle>
        <Btn color={showDeptMgr ? 'gray' : 'indigo'} onClick={() => setShowDeptMgr(s => !s)}>
          {showDeptMgr ? '✕ ' + t('close') : '📂 ' + t('manage_department_hierarchy')}
        </Btn>
      </div>

      {/* ── Department + Hierarchy Manager ── */}
      {showDeptMgr && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">📂 {t('manage_department_hierarchy')}</h3>
          {/* Add Department */}
          <div className="flex gap-2 mb-2">
            <input value={newDeptName} onChange={e => { setNewDeptName(e.target.value); setDeptError(''); }}
              onKeyDown={e => e.key === 'Enter' && addDept()}
              placeholder={t('add_department')}
              className={'flex-1 border p-2 rounded-lg text-sm ' + (deptError ? 'border-red-400' : 'border-gray-300')} />
            <Btn color="green" onClick={addDept}>+ {t('add_department')}</Btn>
          </div>
          {deptError && <p className="text-red-500 text-xs mb-2">⚠️ {deptError}</p>}

          {/* Tree */}
          <div className="border rounded-lg max-h-[500px] overflow-y-auto">
            {departments.length === 0 && <p className="text-gray-400 text-sm py-3 text-center"> {t('no_departments')}</p>}
            {departments.map(dep => (
              <div key={dep.id} className="border-b last:border-b-0">
                {/* Dept row */}
                <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 hover:bg-gray-100">
                  <button onClick={() => toggleDept(dep.id)} className="text-gray-400 w-5 text-xs shrink-0 font-bold">
                    {openDept === dep.id ? '▼' : '▶'}
                  </button>
                  {editDept?.id === dep.id ? (
                    <>
                      <input value={editDept.name} onChange={e => setEditDept(d => ({...d, name: e.target.value}))}
                        onKeyDown={e => { if(e.key==='Enter') saveDeptEdit(); if(e.key==='Escape') setEditDept(null); }}
                        className="flex-1 border border-indigo-300 p-1 rounded text-xs" autoFocus />
                      <Btn color="green" size="sm" onClick={saveDeptEdit}>💾</Btn>
                      <Btn color="gray"  size="sm" onClick={() => setEditDept(null)}>✕</Btn>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-semibold text-gray-800">🏢 {dep.name}</span>
                      <Btn color="yellow" size="sm" onClick={() => setEditDept({ id: dep.id, name: dep.name })}>✏️</Btn>
                      <Btn color="red"    size="sm" onClick={() => deleteDept(dep.id, dep.name)}>🗑️</Btn>
                    </>
                  )}
                </div>

                {/* Sections */}
                {openDept === dep.id && (
                  <div>
                    <div className="flex gap-1 pl-8 pr-3 py-1.5 bg-blue-50 border-t">
                      <input value={newSec} onChange={e => setNewSec(e.target.value)}
                        onKeyDown={e => e.key==='Enter' && addSection(dep.id)}
                        placeholder={t('add_section')} className="flex-1 border p-1 rounded text-xs" />
                      <Btn color="blue" size="sm" onClick={() => addSection(dep.id)}>+ {t('add_section')}</Btn>
                    </div>
                    {!sections[dep.id] && <p className="text-gray-400 text-xs pl-8 py-1"> {t('loading_sections')}</p>}
                    {sections[dep.id]?.length === 0 && <p className="text-gray-400 text-xs pl-8 py-1"> {t('no_sections')}</p>}
                    {(sections[dep.id] || []).map(sec => (
                      <div key={sec.id} className="border-t">
                        {/* Section row */}
                        <div className="flex items-center gap-1 pl-8 pr-3 py-1.5 hover:bg-blue-50">
                          <button onClick={() => toggleSec(sec.id)} className="text-gray-400 w-4 text-xs shrink-0 font-bold">
                            {openSec === sec.id ? '▼' : '▶'}
                          </button>
                          <span className="flex-1 text-xs font-medium text-blue-700">📁 {sec.name}</span>
                          <Btn color="red" size="sm" onClick={() => deleteSection(sec.id, dep.id, sec.name)}>🗑️</Btn>
                        </div>

                        {/* Groups */}
                        {openSec === sec.id && (
                          <div>
                            <div className="flex gap-1 pl-14 pr-3 py-1.5 bg-purple-50 border-t">
                              <input value={newGrp} onChange={e => setNewGrp(e.target.value)}
                                onKeyDown={e => e.key==='Enter' && addGroup(sec.id)}
                                placeholder={t('add_group')} className="flex-1 border p-1 rounded text-xs" />
                              <Btn color="purple" size="sm" onClick={() => addGroup(sec.id)}>+ {t('add_group')}</Btn>
                            </div>
                            {!groups[sec.id] && <p className="text-gray-400 text-xs pl-14 py-1"> {t('loading_groups')}</p>}
                            {groups[sec.id]?.length === 0 && <p className="text-gray-400 text-xs pl-14 py-1"> {t('no_groups')}</p>}
                            {(groups[sec.id] || []).map(grp => (
                              <div key={grp.id} className="border-t">
                                {/* Group row */}
                                <div className="flex items-center gap-1 pl-14 pr-3 py-1.5 hover:bg-purple-50">
                                  <button onClick={() => toggleGrp(grp.id)} className="text-gray-400 w-4 text-xs shrink-0 font-bold">
                                    {openGrp === grp.id ? '▼' : '▶'}
                                  </button>
                                  <span className="flex-1 text-xs font-medium text-purple-700">👥 {grp.name}</span>
                                  <Btn color="red" size="sm" onClick={() => deleteGroup(grp.id, sec.id, grp.name)}>🗑️</Btn>
                                </div>

                                {/* Cost Centers */}
                                {openGrp === grp.id && (
                                  <div>
                                    <div className="flex gap-1 pl-20 pr-3 py-1.5 bg-yellow-50 border-t">
                                      <input value={newCost} onChange={e => setNewCost(e.target.value)}
                                        onKeyDown={e => e.key==='Enter' && addCost(grp.id)}
                                        placeholder={t('add_cost_center')} className="flex-1 border p-1 rounded text-xs" />
                                      <Btn color="yellow" size="sm" onClick={() => addCost(grp.id)}>+ {t('add_cost_center')}</Btn>
                                    </div>
                                    {!costs[grp.id] && <p className="text-gray-400 text-xs pl-20 py-1"> {t('loading_cost_centers')}</p>}
                                    {costs[grp.id]?.length === 0 && <p className="text-gray-400 text-xs pl-20 py-1"> {t('no_cost_centers')}</p>}
                                    {(costs[grp.id] || []).map(cc => (
                                      <div key={cc.id} className="flex items-center gap-1 pl-20 pr-3 py-1.5 border-t hover:bg-yellow-50">
                                        <span className="flex-1 text-xs text-yellow-700">💰 {cc.name}</span>
                                        <Btn color="red" size="sm" onClick={() => deleteCost(cc.id, grp.id, cc.name)}>🗑️</Btn>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Tools ── */}
      <Card>
        <div className="flex flex-wrap gap-2 mb-3">
          <Btn color="green" onClick={downloadTemplate}>📥 {t('download_template')}</Btn>
          <Btn color="red"   onClick={deleteAll}>🗑️ {t('delete_all')}</Btn>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" className="border p-1.5 rounded text-xs flex-1 min-w-0" />
          <Btn color="purple" onClick={uploadExcel}>📤 {t('upload_excel')}</Btn>
        </div>
      </Card>

      {/* ── Filters + Search + Export ── */}
      <Card>
        {/* Row 1: Search + Dropdowns + Tải danh sách */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              placeholder={t('search_devices')}
              className="w-full border rounded-lg pl-8 pr-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {searchRaw && (
              <button onClick={() => setSearchRaw('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs font-bold">✕</button>
            )}
          </div>

          {/* Department */}
          <select
            value={filterDept}
            onChange={e => { setFilterDept(e.target.value); setFilterSection(''); setFilterGroup(''); setFilterCost(''); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[130px]"
          >
            <option value="">📂 {t('department')}</option>
            {departments.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>

          {/* Section */}
          <select
            value={filterSection}
            onChange={e => { setFilterSection(e.target.value); setFilterGroup(''); setFilterCost(''); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[110px] disabled:opacity-40"
            disabled={!filterDept}
          >
            <option value="">📁 {t('section')}</option>
            {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Group */}
          <select
            value={filterGroup}
            onChange={e => { setFilterGroup(e.target.value); setFilterCost(''); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[110px] disabled:opacity-40"
            disabled={!filterSection}
          >
            <option value="">👥 {t('group')}</option>
            {groupOptions.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          {/* Cost Center */}
          <select
            value={filterCost}
            onChange={e => { setFilterCost(e.target.value); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[110px] disabled:opacity-40"
            disabled={!filterGroup}
          >
            <option value="">💰 {t('cost_center')}</option>
            {costOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Tải danh sách – luôn nằm cuối bên phải */}
          <Btn color="blue" onClick={exportFiltered} className="shrink-0 ml-auto">
            ⬇️ {t('download_list')} {filtered.length > 0 && <span className="ml-1 bg-white/30 rounded px-1">{filtered.length}</span>}
          </Btn>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 py-1 border-t">
          <span className="text-sm text-gray-500 flex flex-wrap gap-1 items-center">
            {loading ? '⏳ Đang tải...' : <><strong className="text-gray-800">{filtered.length}</strong> / {devices.length} {t('items')}</>}
            {filterDept    && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs">{departments.find(d => String(d.id) === filterDept)?.name || filterDept}</span>}
            {filterSection && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{filterSection}</span>}
            {filterGroup   && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs">{filterGroup}</span>}
            {filterCost    && <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs">{filterCost}</span>}
            {searchQuery   && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">"{searchQuery}"</span>}
          </span>
          <div className="flex gap-2">
            {hasFilter && <Btn color="gray" size="sm" onClick={resetFilters}>✕ {t('clear_filter')}</Btn>}
            {selected.size > 0 && <Btn color="red" size="sm" onClick={deleteSelected}>🗑️ {t('delete_selected').replace('{{n}}', selected.size)}</Btn>}
          </div>
        </div>
      </Card>

      {/* ── Device Table ── */}
      <Card>
        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {filtered.length === 0 && <p className="text-gray-400 text-sm text-center py-6">{loading ? 'Đang tải...' : t('no_devices_found')}</p>}
          {devPager.paged.map(dev => {
            const isScanned   = dev.status === 'Đã quét';
            const hasTransfer = dev.location && dev.location.includes('Chuyển từ');
            const showDept    = isScanned && dev.scanned_dept        ? dev.scanned_dept        : dev.department_name;
            const showSection = isScanned && dev.scanned_section     ? dev.scanned_section     : (dev.section_name || dev.section);
            const showGroup   = isScanned && dev.scanned_group       ? dev.scanned_group       : (dev.group_name || dev.group);
            const showCC      = isScanned && dev.scanned_cost_center ? dev.scanned_cost_center : dev.cost_center;
            const moved       = isScanned && dev.scanned_dept && dev.scanned_dept !== dev.department_name;
            return (
              <div key={dev._uid} className={'border rounded-xl p-3 ' + (selected.has(dev._uid) ? 'bg-red-50 border-red-200' : 'bg-gray-50')}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" checked={selected.has(dev._uid)} onChange={() => toggleOne(dev._uid)} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{dv(dev.name)}</div>
                      <div className="text-xs text-gray-500 font-mono">{dv(dev.serial_number || dev.qr_code)}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        👤 {dev.user_name ? <span className="font-medium text-gray-800">{dev.user_name}</span> : <span className="text-gray-400">—</span>}
                      </div>
                      {dev.location && (
                        <div className={'text-xs mt-0.5 font-medium ' + (hasTransfer ? 'text-orange-600' : 'text-green-700')}>
                          {hasTransfer ? '🔄 ' : '📍 '}{dev.location}
                        </div>
                      )}
                      <div className="text-xs mt-0.5 space-y-0.5">
                        <div className={moved ? 'text-orange-600 font-medium' : 'text-gray-600'}>📂 {dv(showDept)}</div>
                        <div className="text-gray-500">└─ 📁 {dv(showSection)}</div>
                        <div className="text-gray-500">└─ 👥 {dv(showGroup)}</div>
                        <div className={isScanned && dev.scanned_cost_center && dev.scanned_cost_center !== dev.cost_center ? 'text-orange-500 font-medium' : 'text-gray-500'}>└─ 💰 {dv(showCC)}</div>
                      </div>
                    </div>
                  </div>
                  <span className={'text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full ' + (
                    dev.status === 'new' ? 'bg-blue-100 text-blue-700' :
                    isScanned           ? 'bg-green-100 text-green-700' :
                                          'bg-red-100 text-red-600'
                  )}>
                    {dev.status === 'new' ? '🆕 Thiết bị mới' : dev.status || 'Chưa quét'}
                  </span>
                </div>
                <Btn color="red" size="sm" onClick={() => deleteDevice(dev.id)}>🗑️ {t('delete')}</Btn>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                <th className="p-2 border w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} /></th>
                <th className="p-2 border w-8">#</th>
                <th className="p-2 border min-w-[120px]">{t('device_name')}</th>
                <th className="p-2 border min-w-[100px]">{t('serial_number')}</th>
                <th className="p-2 border min-w-[110px]">{t('scanned_by')}</th>
                <th className="p-2 border w-28 text-center">{t('status')}</th>
                <th className="p-2 border min-w-[160px]">{t('location_transfer')}</th>
                <th className="p-2 border">{t('department')}</th>
                <th className="p-2 border">{t('section')}</th>
                <th className="p-2 border">{t('group')}</th>
                <th className="p-2 border">{t('cost_center')}</th>
                <th className="p-2 border w-16 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="py-8 text-center text-gray-400 text-sm">{loading ? '⏳ Đang tải...' : t('no_devices_found')}</td></tr>
              )}
              {devPager.paged.map((dev, idx) => {
                const isScanned   = dev.status === 'Đã quét';
                const hasTransfer = dev.location && dev.location.includes('Chuyển từ');
                // Dept/section/group/cost center hiển thị: nếu đã quét → dùng thông tin nơi quét, chưa quét → dùng thông tin gốc của máy
                const showDept    = isScanned && dev.scanned_dept        ? dev.scanned_dept        : dev.department_name;
                const showSection = isScanned && dev.scanned_section     ? dev.scanned_section     : (dev.section_name || dev.section);
                const showGroup   = isScanned && dev.scanned_group       ? dev.scanned_group       : (dev.group_name || dev.group);
                const showCC      = isScanned && dev.scanned_cost_center ? dev.scanned_cost_center : dev.cost_center;
                return (
                  <tr key={dev._uid} className={'hover:bg-gray-50 ' + (selected.has(dev._uid) ? 'bg-red-50' : '')}>
                    <td className="border p-2 text-center"><input type="checkbox" checked={selected.has(dev._uid)} onChange={() => toggleOne(dev._uid)} /></td>
                    <td className="border p-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                    <td className="border p-2 font-medium text-xs">{dv(dev.name)}</td>
                    <td className="border p-2 font-mono text-xs text-gray-600">{dv(dev.serial_number || dev.qr_code)}</td>
                    <td className="border p-2 text-xs">
                      {dev.user_name ? <span className="text-gray-800 font-medium">{dev.user_name}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="border p-2 text-center">
                      <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + (
                        dev.status === 'new'     ? 'bg-blue-100 text-blue-700' :
                        isScanned               ? 'bg-green-100 text-green-700' :
                                                  'bg-red-100 text-red-600'
                      )}>
                        {dev.status === 'new' ? '🆕 Thiết bị mới' : dev.status || 'Chưa quét'}
                      </span>
                    </td>
                    {/* Vị trí: "Đang ở X" hoặc "Chuyển từ A → B" */}
                    <td className="border p-2 text-xs">
                      {dev.location
                        ? <span className={hasTransfer ? 'text-orange-600 font-medium' : 'text-green-700'}>
                            {hasTransfer ? '🔄 ' : '📍 '}{dev.location}
                          </span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    {/* Dept/Section/Group/CC: hiển thị nơi máy ĐANG ở (nơi user quét thuộc về) */}
                    <td className="border p-2 text-xs">
                      <span className={isScanned && dev.scanned_dept && dev.scanned_dept !== dev.department_name ? 'text-orange-600 font-medium' : 'text-gray-600'}>{dv(showDept)}</span>
                    </td>
                    <td className="border p-2 text-xs">
                      <span className={isScanned && dev.scanned_section && dev.scanned_section !== (dev.section_name||dev.section) ? 'text-orange-500' : 'text-gray-500'}>{dv(showSection)}</span>
                    </td>
                    <td className="border p-2 text-xs">
                      <span className={isScanned && dev.scanned_group && dev.scanned_group !== (dev.group_name||dev.group) ? 'text-orange-500' : 'text-gray-500'}>{dv(showGroup)}</span>
                    </td>
                    <td className="border p-2 text-xs">
                      <span className={isScanned && dev.scanned_cost_center && dev.scanned_cost_center !== dev.cost_center ? 'text-orange-500 font-medium' : 'text-gray-500'}>{dv(showCC)}</span>
                    </td>
                    <td className="border p-2 text-center"><Btn color="red" size="sm" onClick={() => deleteDevice(dev.id)}>🗑️</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...devPager} />
      </Card>
    </div>
  );
}

// ─── Device Types ─────────────────────────────────────────────
function DeviceTypes() {
  const { t } = useTranslation();
  const [types, setTypes]         = useState([]);
  const [newName, setNewName]     = useState('');
  const [typeError, setTypeError] = useState('');

  useEffect(() => { fetch(API + '/device-types').then(r => r.json()).then(d => setTypes(toArray(d))).catch(() => {}); }, []);

  const addType = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setTypeError(t('type_name_required')); return; }
    if (types.some(t => t.name.trim().toLowerCase() === trimmed.toLowerCase())) { setTypeError(t('device_type_exists')); return; }
    setTypeError('');
    const data = await fetch(API + '/device-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) }).then(r => r.json());
    if (data.success || data.id) { setTypes(p => [...p, data.type || { id: data.id, name: trimmed }]); setNewName(''); }
    else setTypeError(data.message || t('error'));
  };

  const updateType = async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) { alert(t('type_name_required')); return; }
    if (types.some(t => t.id !== id && t.name.trim().toLowerCase() === trimmed.toLowerCase())) { alert(t('device_type_exists')); return; }
    const data = await fetch(API + '/device-types/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) }).then(r => r.json());
    if (data.success || data.message) setTypes(p => p.map(t => t.id === id ? { ...t, name: trimmed } : t));
    alert(data.message);
  };

  const deleteType = async (id) => {
    if (!confirm(t('confirm_delete_type'))) return;
    const data = await fetch(API + '/device-types/' + id, { method: 'DELETE' }).then(r => r.json());
    alert(data.message); setTypes(p => p.filter(t => t.id !== id));
  };

  return (
    <div className="space-y-5">
      <SectionTitle>📦 {t('device_types')}</SectionTitle>
      <Card>
        <div className="flex gap-2 mb-2">
          <input value={newName} onChange={e => { setNewName(e.target.value); setTypeError(''); }} onKeyDown={e => e.key === 'Enter' && addType()} placeholder={t('device_type')} className={'flex-1 border p-2 rounded-lg text-sm ' + (typeError ? 'border-red-400' : '')} />
          <Btn onClick={addType}>+ {t('add')}</Btn>
        </div>
        {typeError && <p className="text-red-500 text-xs mb-3">{typeError}</p>}

        {/* Mobile cards */}
        <div className="md:hidden space-y-2 mt-3">
          {types.map(t => <TypeCard key={t.id} type={t} onUpdate={updateType} onDelete={deleteType} />)}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto mt-3">
          <table className="w-full border text-sm">
            <thead><tr className="bg-gray-100"><th className="p-2 border w-12">{t('id')}</th><th className="p-2 border">{t('name')}</th><th className="p-2 border w-32">{t('action')}</th></tr></thead>
            <tbody>{types.map(t => <TypeRow key={t.id} type={t} onUpdate={updateType} onDelete={deleteType} />)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
function TypeRow({ type, onUpdate, onDelete }) {
  const [name, setName] = useState(type.name);
  return (
    <tr className="hover:bg-gray-50">
      <td className="border p-2 text-center text-gray-400 text-xs">{type.id}</td>
      <td className="border p-2"><input value={name} onChange={e => setName(e.target.value)} className="border p-1 rounded w-full text-sm" /></td>
      <td className="border p-2 text-center space-x-1">
        <Btn color="yellow" size="sm" onClick={() => onUpdate(type.id, name)}>Sửa</Btn>
        <Btn color="red"    size="sm" onClick={() => onDelete(type.id)}>Xóa</Btn>
      </td>
    </tr>
  );
}
function TypeCard({ type, onUpdate, onDelete }) {
  const [name, setName] = useState(type.name);
  return (
    <div className="border rounded-xl p-3 bg-gray-50 flex items-center gap-2">
      <input value={name} onChange={e => setName(e.target.value)} className="flex-1 border p-2 rounded-lg text-sm" />
      <Btn color="yellow" size="sm" onClick={() => onUpdate(type.id, name)}>Sửa</Btn>
      <Btn color="red"    size="sm" onClick={() => onDelete(type.id)}>Xóa</Btn>
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────
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

// ─── Audit Tab ────────────────────────────────────────────────
function AuditTab() {
  const { t } = useTranslation();
  const [summary, setSummary]         = useState({ total: 0, scanned: 0, remaining: 0, sessions: 0, active: 0 });
  const [deptProgress, setDeptProg]   = useState([]);
  const [sessions, setSessions]       = useState([]);
  const sessionPager = usePager(sessions);
  const [compareData, setCompareData] = useState(null);
  const [compareTitle, setCmpTitle]   = useState('');
  const [depts, setDepts]             = useState([]);
  const [filter, setFilter]           = useState({ from: '', to: '', dept: '' });

  useEffect(() => {
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
      setDeptProg(deptData); setSessions(sessData);
    } catch {}
  }, [filter]);

  const forceStop = async (id) => {
    if (!confirm('Dừng phiên audit này?')) return;
    const data = await fetch(API + '/scan/force-stop/' + id, { method: 'POST' }).then(r => r.json());
    if (data.success) loadAudit(); else alert(data.message || 'Lỗi');
  };

  const deleteSession = async (id) => {
    if (!confirm('Xóa phiên audit này?')) return;
    const data = await fetch(API + '/scan/audit-session/' + id, { method: 'DELETE' }).then(r => r.json());
    if (data.success) loadAudit(); else alert(data.message || 'Lỗi');
  };

  const showCompare = async (sessionId, deptName) => {
    setCompareData(toArray(await fetch(API + '/scan/audit-compare/' + sessionId).then(r => r.json()).catch(() => [])));
    setCmpTitle(deptName);
  };

  const exportCompare = () => {
    if (!compareData?.length) return;
    const rows = [['Tên thiết bị','QR Code','Vị trí','Người audit','Thời gian','Trạng thái']];
    compareData.forEach(d => rows.push([d.device_name, d.qr_code, d.location || '', d.scanned_by || '', d.scanned_at || '', d.audited ? 'Đã audit' : 'Chưa audit']));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Audit');
    XLSX.writeFile(wb, 'Audit_' + compareTitle + '.xlsx');
  };

  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDur  = s => { if (!s.ended_at) return '—'; const m = Math.round((new Date(s.ended_at) - new Date(s.started_at || s.created_at)) / 60000); return m < 60 ? m + ' phút' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
  const fmtStatus = dev => {
      if (!dev.status) return 'Chưa xác định';
      const statusMap = {
        'active': 'Hoạt động',
        'inactive': 'Không hoạt động',
        'maintenance': 'Bảo trì',
        'deactivated': 'Ngừng hoạt động',
      };
      return statusMap[dev.status] || dev.status;
    };
  const fmtLocation = dev => dev.location || dev.room || dev.room_name || 'Chưa xác định';
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>🔍 {t('audit_title')}</SectionTitle>
        <Btn onClick={() => loadAudit()}>🔄 {t('refresh')}</Btn>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('total_devices'), value: summary.total,     color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: t('audited'),      value: summary.scanned,   color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: t('not_audited'),    value: summary.remaining, color: 'text-red-500',    bg: 'bg-red-50'    },
          { label: t('audit_sessions'),   value: summary.sessions,  color: 'text-purple-600', bg: 'bg-purple-50',
            extra: summary.active > 0 ? summary.active + ' đang chạy' : null },
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
                  <div className="text-xs text-indigo-600 font-semibold">Đã quét: {s.total_scanned ?? '—'}</div>
                </div>
                {!s.ended_at
                  ? <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{t('in_progress')}</span>
                  : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs shrink-0">{t('completed')}</span>}
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
              <th className="pb-2 pr-3">{t('auditor_name')}</th><th className="pb-2 pr-3">{t('department')}</th>
              <th className="pb-2 pr-3">{t('from_date')}</th><th className="pb-2 pr-3">{t('duration')}</th>
              <th className="pb-2 pr-3 text-center">{t('scanned')}</th><th className="pb-2 text-center">{t('status')}</th>
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
                  <td className="py-2.5 pr-3 text-center font-semibold text-indigo-600">{s.total_scanned ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-center">
                    {!s.ended_at
                      ? <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{t('in_progress')}</span>
                      : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">{t('completed')}</span>}
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

      {/* Compare – bottom sheet on mobile, modal on desktop */}
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
              <div className="bg-indigo-50 rounded-xl p-3 text-center"><div className="text-xl font-bold text-indigo-600">{compareData.length}</div><div className="text-xs text-gray-500">{t('total')}</div></div>
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-4">
              {/* Mobile cards */}
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
              {/* Desktop table */}
              <table className="hidden md:table w-full text-sm">
                <thead className="sticky top-0 bg-white border-b"><tr className="text-left text-gray-400 text-xs uppercase">
                  <th className="pb-2 pr-3 pt-2">{t('device')}</th><th className="pb-2 pr-3">{t('qr_code')}</th>
                  <th className="pb-2 pr-3">{t('location')}</th><th className="pb-2 pr-3">{t('scanned_by')}</th>
                  <th className="pb-2 pr-3">{t('scanned_at')}</th><th className="pb-2 text-center">{t('status')}</th>
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