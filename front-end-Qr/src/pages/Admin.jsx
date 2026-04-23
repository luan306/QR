import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import AdminMapTab from './AdminMapTab'; 
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const API = '/api';
const toArray = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',        icon: '📊' },
  { id: 'users',       label: 'Quản lý User',     icon: '👤' },
  { id: 'devices',     label: 'Quản lý Thiết bị', icon: '💻' },
  { id: 'deviceTypes', label: 'Loại thiết bị',    icon: '📦' },
  { id: 'reports',     label: 'Báo cáo',          icon: '📋' },
  { id: 'audit',       label: 'Audit',             icon: '🔍' },
  { id: 'map',         label: 'Bản đồ',            icon: '🗺️' },
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

// ─── Admin Shell ──────────────────────────────────────────────
export default function Admin() {
  const navigate        = useNavigate();
  const [tab, setTab]   = useState('dashboard');
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false); // mobile sidebar

  useEffect(() => {
    fetch('/api/current-user')
      .then(r => r.json())
      .then(d => {
        const u = d.user || d;
        if (!u?.id)             { navigate('/login', { replace: true }); return; }
        if (u.role !== 'admin') { alert('Bạn không có quyền Admin!'); navigate('/scan', { replace: true }); return; }
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
      <div className="text-gray-400 animate-pulse text-sm">Đang xác thực...</div>
    </div>
  );

  const SidebarContent = ({ onClose }) => (
    <>
      <div className="p-4 text-lg font-bold border-b border-indigo-500 flex items-center justify-between flex-shrink-0">
        <span>🛠️ Admin Panel</span>
        {onClose && <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none md:hidden">✕</button>}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={'w-full text-left px-4 py-2.5 rounded-lg transition-colors text-sm ' +
              (tab === t.id ? 'bg-white/20 font-semibold' : 'hover:bg-white/10')}
          >
            {t.icon} <span className="ml-1">{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-indigo-500 flex-shrink-0">
        <div className="text-xs text-indigo-300 mb-2">👤 {user.username}</div>
        <button onClick={handleLogout} className="w-full py-2 bg-red-500 rounded-lg hover:bg-red-600 text-sm text-white font-medium">🚪 Đăng xuất</button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-indigo-700 text-white flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar drawer */}
      {open && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={'fixed inset-y-0 left-0 z-50 w-64 bg-indigo-700 text-white flex flex-col shadow-2xl transform transition-transform duration-300 md:hidden ' + (open ? 'translate-x-0' : '-translate-x-full')}>
        <SidebarContent onClose={() => setOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden bg-indigo-700 text-white flex items-center justify-between px-4 py-3 shadow flex-shrink-0">
          <button onClick={() => setOpen(true)} className="text-2xl leading-none w-8">☰</button>
          <span className="font-bold text-sm">{TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}</span>
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
  const [stats, setStats]             = useState([]);
  const [deptDevices, setDeptDevices] = useState(null);
  const [deptName, setDeptName]       = useState('');
  const [departments, setDepts]       = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [deptError,   setDeptError]   = useState('');
  const overallRef = useRef(null);
  const deptRef    = useRef(null);
  const charts     = useRef({});

  useEffect(() => {
    fetch(API + '/departments').then(r => r.json()).then(d => setDepts(toArray(d))).catch(() => {});
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
        data: { labels: ['Đã quét', 'Chưa quét'], datasets: [{ data: [scanned, Math.max(0, total - scanned)], backgroundColor: ['#22c55e', '#ef4444'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
    }
    if (deptRef.current) {
      charts.current.dept?.destroy();
      charts.current.dept = new Chart(deptRef.current, {
        type: 'bar',
        data: { labels: arr.map(s => s.department_name), datasets: [
          { label: 'Đã quét',   data: arr.map(s => s.scanned_devices), backgroundColor: '#22c55e' },
          { label: 'Chưa quét', data: arr.map(s => s.pending_devices),  backgroundColor: '#ef4444' },
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
    if (!deptDevices?.length) { alert('Chưa có dữ liệu'); return; }
    const ws = XLSX.utils.json_to_sheet(deptDevices);
    XLSX.writeFile(XLSX.utils.book_append_sheet(XLSX.utils.book_new(), ws, deptName), 'Dept_' + deptName + '.xlsx');
  };

  const addDept = async () => {
    const trimmed = newDeptName.trim();
    if (!trimmed) { setDeptError('Vui lòng nhập tên bộ phận'); return; }
    if (departments.some(d => d.name.trim().toLowerCase() === trimmed.toLowerCase())) { setDeptError('Bộ phận "' + trimmed + '" đã tồn tại!'); return; }
    setDeptError('');
    const data = await fetch(API + '/departments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) }).then(r => r.json());
    if (data.success || data.id) { setDepts(p => [...p, data.department || { id: data.id, name: trimmed }]); setNewDeptName(''); }
    else setDeptError(data.message || 'Lỗi thêm bộ phận');
  };

  const deleteDept = async (id, name) => {
    try {
      const affected = toArray(await fetch(API + '/users').then(r => r.json()).catch(() => [])).filter(u => String(u.department_id) === String(id));
      if (affected.length > 0) {
        alert('Không thể xóa bộ phận "' + name + '"!\nCó ' + affected.length + ' user đang thuộc bộ phận:\n' +
          affected.map(u => '• ' + (u.full_name || u.username)).join('\n') + '\nVui lòng chuyển hoặc xóa các user này trước.');
        return;
      }
    } catch {}
    if (!confirm('Xóa bộ phận "' + name + '"?')) return;
    const data = await fetch(API + '/departments/' + id, { method: 'DELETE' }).then(r => r.json());
    if (data.success) setDepts(d => d.filter(x => x.id !== id)); else alert(data.message);
  };

  const total   = stats.reduce((s, d) => s + (d.total_devices   || 0), 0);
  const scanned = stats.reduce((s, d) => s + (d.scanned_devices || 0), 0);

  return (
    <div className="space-y-5">
      <SectionTitle>📊 Dashboard</SectionTitle>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Tổng thiết bị', value: total,           color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Đã quét',       value: scanned,         color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Chưa quét',     value: total - scanned, color: 'text-red-500',    bg: 'bg-red-50'    },
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
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Tổng quan</h3>
          <div className="flex justify-center"><div className="w-44 h-44"><canvas ref={overallRef} /></div></div>
        </Card>
        <Card>
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Theo bộ phận (click để xem chi tiết)</h3>
          <canvas ref={deptRef} height={160} />
        </Card>
      </div>

      {/* Dept detail */}
      {deptDevices && (
        <Card>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-bold text-gray-700">📋 {deptName}</h3>
            <div className="flex gap-2">
              <Btn color="green" size="sm" onClick={exportDept}>📤 Xuất Excel</Btn>
              <Btn color="gray"  size="sm" onClick={() => setDeptDevices(null)}>✕</Btn>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead><tr className="bg-gray-100 text-left">
                <th className="p-2 border text-xs">QR Code</th>
                <th className="p-2 border text-xs">Tên thiết bị</th>
                <th className="p-2 border text-xs hidden sm:table-cell">Vị trí</th>
                <th className="p-2 border text-xs text-center">Trạng thái</th>
              </tr></thead>
              <tbody>
                {deptDevices.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border p-2 text-xs font-mono">{d.qr_code}</td>
                    <td className="border p-2 text-sm">{d.name}</td>
                    <td className="border p-2 text-xs hidden sm:table-cell">{d.location || '—'}</td>
                    <td className={'border p-2 text-center text-xs font-medium ' + (d.status === 'Đã quét' ? 'text-green-600' : 'text-red-500')}>{d.status || 'Chưa quét'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Departments list */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">📂 Danh sách Bộ phận</h3>
        <div className="flex gap-2 mb-2">
          <input value={newDeptName} onChange={e => { setNewDeptName(e.target.value); setDeptError(''); }} onKeyDown={e => e.key === 'Enter' && addDept()} placeholder="Tên bộ phận mới..." className={'flex-1 border p-2 rounded-lg text-sm ' + (deptError ? 'border-red-400' : '')} />
          <Btn onClick={addDept}>+ Thêm</Btn>
        </div>
        {deptError && <p className="text-red-500 text-xs mb-2">{deptError}</p>}
        <div className="divide-y max-h-64 overflow-y-auto">
          {departments.length === 0 && <p className="text-gray-400 text-sm py-2">Chưa có bộ phận nào</p>}
          {departments.map(dep => (
            <div key={dep.id} className="flex justify-between items-center py-2">
              <span className="text-gray-800 text-sm font-medium">{dep.name}</span>
              <Btn color="red" size="sm" onClick={() => deleteDept(dep.id, dep.name)}>❌ Xóa</Btn>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────
function Users() {
  const [users, setUsers]       = useState([]);
  const [depts, setDepts]       = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm]         = useState({ username: '', password: '', full_name: '', department_id: '', role: 'user' });
  const [importResult, setImportResult] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const userFileRef = useRef(null);

  useEffect(() => {
    fetchUsers();
    fetch(API + '/departments').then(r => r.json()).then(d => setDepts(toArray(d))).catch(() => {});
  }, []);

  const fetchUsers = async () => { setUsers(toArray(await fetch(API + '/users').then(r => r.json()).catch(() => []))); setSelected(new Set()); };

  const downloadUserTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['username','password','full_name','department_name','role'],['nguyenvana','123456','Nguyễn Văn A','Phòng IT','user'],['tranthib','123456','Trần Thị B','Phòng Hành Chính','auditor']]);
    const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Users');
XLSX.writeFile(wb, 'file.xlsx');
  };

  const importUsersFromExcel = async () => {
    const file = userFileRef.current?.files?.[0];
    if (!file) { alert('Vui lòng chọn file Excel trước!'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) { alert('File Excel trống hoặc sai định dạng'); return; }
      const deptMap = Object.fromEntries(depts.map(d => [d.name.trim().toLowerCase(), d.id]));
      let ok = 0, fail = 0, failList = [];
      for (const row of rows) {
        const username = String(row.username || '').trim(), password = String(row.password || '').trim();
        if (!username || !password) { fail++; failList.push('Thiếu username/password'); continue; }
        const payload = { username, password, full_name: String(row.full_name || '').trim(), role: String(row.role || 'user').trim(), department_id: deptMap[String(row.department_name || '').trim().toLowerCase()] || '' };
        try {
          const data = await fetch(API + '/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json());
          if (data.success || data.id) ok++; else { fail++; failList.push(username + ': ' + (data.message || 'lỗi')); }
        } catch { fail++; failList.push(username + ': lỗi mạng'); }
      }
      setImportResult({ ok, fail, failList }); fetchUsers(); userFileRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const createUser = async (e) => {
    e.preventDefault();
    const data = await fetch(API + '/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).then(r => r.json());
    alert(data.message); fetchUsers(); setForm({ username: '', password: '', full_name: '', department_id: '', role: 'user' }); setShowForm(false);
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
    const body = { full_name: editUser.full_name, department_id: editUser.department_id, role: editUser.role };
    if (editUser.password) body.password = editUser.password;
    const data = await fetch(API + '/users/' + editUser.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    alert(data.message); setEditUser(null); fetchUsers();
  };

  const toggleOne = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => selected.size === users.length ? setSelected(new Set()) : setSelected(new Set(users.map(u => u.id)));
  const roleColor = r => r === 'admin' ? 'bg-red-100 text-red-700' : r === 'auditor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>👤 Quản lý User</SectionTitle>
        <Btn onClick={() => setShowForm(s => !s)} color={showForm ? 'gray' : 'indigo'}>{showForm ? '✕ Đóng form' : '+ Tạo User mới'}</Btn>
      </div>

      {/* Create form – collapsible */}
      {showForm && (
        <Card>
          <h3 className="font-semibold text-gray-700 mb-4">Tạo tài khoản mới</h3>
          <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.username}      onChange={e => setForm(f => ({...f, username: e.target.value}))}      placeholder="Tên đăng nhập *" required className="p-3 border rounded-lg text-sm" />
            <input value={form.password}      onChange={e => setForm(f => ({...f, password: e.target.value}))}      placeholder="Mật khẩu *" type="password" required className="p-3 border rounded-lg text-sm" />
            <input value={form.full_name}     onChange={e => setForm(f => ({...f, full_name: e.target.value}))}     placeholder="Họ tên" className="p-3 border rounded-lg text-sm" />
            <select value={form.department_id} onChange={e => setForm(f => ({...f, department_id: e.target.value}))} className="p-3 border rounded-lg text-sm">
              <option value="">-- Chọn bộ phận --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} className="p-3 border rounded-lg text-sm">
              <option value="user">User</option><option value="auditor">Auditor</option><option value="admin">Admin</option>
            </select>
            <button type="submit" className="bg-indigo-600 text-white p-3 rounded-lg text-sm font-medium hover:bg-indigo-700">✅ Tạo User</button>
          </form>
        </Card>
      )}

      {/* Import Excel */}
      <Card>
        <h3 className="font-semibold text-gray-700 mb-3">📥 Import User từ Excel</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <Btn color="green" size="sm" onClick={downloadUserTemplate}>📄 Tải file mẫu</Btn>
          <input type="file" ref={userFileRef} accept=".xlsx,.xls" className="border p-1.5 rounded text-xs flex-1 min-w-0" />
          <Btn color="purple" size="sm" onClick={importUsersFromExcel}>📤 Import</Btn>
        </div>
        <p className="text-xs text-gray-400 mt-1">Cột cần có: username, password, full_name, department_name, role</p>
        {importResult && (
          <div className={'mt-3 p-3 rounded-lg text-sm ' + (importResult.fail > 0 ? 'bg-yellow-50 border border-yellow-300' : 'bg-green-50 border border-green-300')}>
            <p className="font-semibold">Thành công: {importResult.ok} | Thất bại: {importResult.fail}</p>
            {importResult.failList.length > 0 && <ul className="mt-1 text-xs text-red-600">{importResult.failList.map((m, i) => <li key={i}>• {m}</li>)}</ul>}
            <button onClick={() => setImportResult(null)} className="mt-2 text-xs text-gray-400 underline">Đóng</button>
          </div>
        )}
      </Card>

      {/* User list */}
      <Card className="p-3 md:p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-gray-700">Danh sách User ({users.length})</h3>
          {selected.size > 0 && <Btn color="red" size="sm" onClick={deleteSelected}>🗑️ Xóa {selected.size} đã chọn</Btn>}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {users.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Chưa có user</p>}
          {users.map(u => (
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
                <Btn color="yellow" size="sm" onClick={() => setEditUser({...u, password: ''})}>✏️ Sửa</Btn>
                <Btn color="red"    size="sm" onClick={() => deleteUser(u.id)}>🗑️ Xóa</Btn>
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
              <th className="p-2 border">Tên đăng nhập</th>
              <th className="p-2 border">Họ tên</th>
              <th className="p-2 border">Bộ phận</th>
              <th className="p-2 border">Role</th>
              <th className="p-2 border">Hành động</th>
            </tr></thead>
            <tbody>
              {users.map((u, idx) => (
                <tr key={u.id} className={'hover:bg-gray-50 ' + (selected.has(u.id) ? 'bg-red-50' : '')}>
                  <td className="border p-2 text-center"><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} /></td>
                  <td className="border p-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                  <td className="border p-2">{u.username}</td>
                  <td className="border p-2">{u.full_name}</td>
                  <td className="border p-2">{u.department_name || '—'}</td>
                  <td className="border p-2 text-center"><span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + roleColor(u.role)}>{u.role}</span></td>
                  <td className="border p-2 text-center space-x-1">
                    <Btn color="yellow" size="sm" onClick={() => setEditUser({...u, password: ''})}>✏️</Btn>
                    <Btn color="red"    size="sm" onClick={() => deleteUser(u.id)}>🗑️</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal – full screen on mobile, centered on desktop */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-sm space-y-3 shadow-xl p-6">
            <h3 className="text-lg font-bold">✏️ Chỉnh sửa User</h3>
            <input value={editUser.full_name}     onChange={e => setEditUser(u => ({...u, full_name: e.target.value}))}     placeholder="Họ tên" className="w-full p-3 border rounded-lg text-sm" />
            <input value={editUser.password}       onChange={e => setEditUser(u => ({...u, password: e.target.value}))}      placeholder="Mật khẩu mới (để trống = không đổi)" type="password" className="w-full p-3 border rounded-lg text-sm" />
            <select value={editUser.department_id} onChange={e => setEditUser(u => ({...u, department_id: e.target.value}))} className="w-full p-3 border rounded-lg text-sm">
              <option value="">-- Chọn bộ phận --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={editUser.role} onChange={e => setEditUser(u => ({...u, role: e.target.value}))} className="w-full p-3 border rounded-lg text-sm">
              <option value="user">User</option><option value="auditor">Auditor</option><option value="admin">Admin</option>
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
function Devices() {
  const [devices, setDevices]   = useState([]);
  const [selected, setSelected] = useState(new Set());
  const fileRef = useRef(null);

  useEffect(() => { fetchDevices(); }, []);

  const fetchDevices = async () => { setDevices(toArray(await fetch(API + '/devices').then(r => r.json()).catch(() => []))); setSelected(new Set()); };

  const deleteDevice = async (id) => {
    if (!confirm('Xóa thiết bị này?')) return;
    const data = await fetch(API + '/devices/' + id, { method: 'DELETE' }).then(r => r.json());
    alert(data.message); fetchDevices();
  };

  const deleteSelected = async () => {
    if (!selected.size || !confirm('Xóa ' + selected.size + ' thiết bị đã chọn?')) return;
    await Promise.all([...selected].map(id => fetch(API + '/devices/' + id, { method: 'DELETE' }))); fetchDevices();
  };

  const deleteAll = async () => {
    if (!confirm('Xóa TẤT CẢ thiết bị? Không thể hoàn tác!')) return;
    const data = await fetch(API + '/devices', { method: 'DELETE' }).then(r => r.json());
    alert(data.message); fetchDevices();
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Name','QR_Code','Department','DeviceType','Location'],['Laptop Dell','QR001','Phòng IT','Laptop','Tầng 1'],['Máy in HP','QR002','Phòng Hành Chính','Máy in','Tầng 2']]);
    XLSX.writeFile(XLSX.utils.book_append_sheet(XLSX.utils.book_new(), ws, 'Devices'), 'Device_Template.xlsx');
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
        const msg = 'Phát hiện ' + duplicates.length + ' thiết bị trùng tên:\n' + duplicates.slice(0, 10).map(n => '• ' + n).join('\n') + (duplicates.length > 10 ? '\n... và ' + (duplicates.length - 10) + ' khác' : '') + '\n\nTiếp tục import?';
        if (!confirm(msg)) return;
      }
      const formData = new FormData(); formData.append('file', fileRef.current.files[0]);
      const data = await fetch(API + '/devices/upload', { method: 'POST', body: formData }).then(r => r.json());
      alert(data.message); fetchDevices();
    };
    reader.readAsArrayBuffer(fileRef.current.files[0]);
  };

  const toggleOne = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => selected.size === devices.length ? setSelected(new Set()) : setSelected(new Set(devices.map(d => d.id)));

  return (
    <div className="space-y-5">
      <SectionTitle>💻 Quản lý Thiết bị</SectionTitle>
      <Card>
        <div className="flex flex-wrap gap-2 mb-3">
          <a href={API + '/devices/export'} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 font-medium">⬇️ Tải danh sách</a>
          <Btn color="green" onClick={downloadTemplate}>📥 File mẫu</Btn>
          <Btn color="red"   onClick={deleteAll}>🗑️ Xóa tất cả</Btn>
        </div>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" className="border p-1.5 rounded text-xs flex-1 min-w-0" />
          <Btn color="purple" onClick={uploadExcel}>📤 Upload Excel</Btn>
        </div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span className="text-sm text-gray-500">{devices.length} thiết bị</span>
          {selected.size > 0 && <Btn color="red" size="sm" onClick={deleteSelected}>🗑️ Xóa {selected.size} đã chọn</Btn>}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {devices.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Chưa có thiết bị nào</p>}
          {devices.map(dev => (
            <div key={dev.id} className={'border rounded-xl p-3 ' + (selected.has(dev.id) ? 'bg-red-50 border-red-200' : 'bg-gray-50')}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <input type="checkbox" checked={selected.has(dev.id)} onChange={() => toggleOne(dev.id)} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{dev.name}</div>
                    <div className="text-xs text-gray-500">{dev.device_type_name || '—'} · {dev.department_name || '—'}</div>
                  </div>
                </div>
                <span className={'text-xs font-semibold shrink-0 ' + (dev.status === 'Đã quét' ? 'text-green-600' : 'text-red-500')}>{dev.status || 'Chưa quét'}</span>
              </div>
              <Btn color="red" size="sm" onClick={() => deleteDevice(dev.id)}>🗑️ Xóa</Btn>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border text-sm">
            <thead><tr className="bg-gray-100">
              <th className="p-2 border w-8"><input type="checkbox" checked={selected.size === devices.length && devices.length > 0} onChange={toggleAll} /></th>
              <th className="p-2 border">#</th>
              <th className="p-2 border">Tên Thiết Bị</th>
              <th className="p-2 border">Loại</th>
              <th className="p-2 border">Bộ phận</th>
              <th className="p-2 border">Trạng thái</th>
              <th className="p-2 border">Hành động</th>
            </tr></thead>
            <tbody>
              {devices.map((dev, idx) => (
                <tr key={dev.id} className={'hover:bg-gray-50 ' + (selected.has(dev.id) ? 'bg-red-50' : '')}>
                  <td className="border p-2 text-center"><input type="checkbox" checked={selected.has(dev.id)} onChange={() => toggleOne(dev.id)} /></td>
                  <td className="border p-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                  <td className="border p-2">{dev.name}</td>
                  <td className="border p-2">{dev.device_type_name || '—'}</td>
                  <td className="border p-2">{dev.department_name || '—'}</td>
                  <td className={'border p-2 text-center text-xs font-medium ' + (dev.status === 'Đã quét' ? 'text-green-600' : 'text-red-500')}>{dev.status || 'Chưa quét'}</td>
                  <td className="border p-2 text-center"><Btn color="red" size="sm" onClick={() => deleteDevice(dev.id)}>Xóa</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Device Types ─────────────────────────────────────────────
function DeviceTypes() {
  const [types, setTypes]         = useState([]);
  const [newName, setNewName]     = useState('');
  const [typeError, setTypeError] = useState('');

  useEffect(() => { fetch(API + '/device-types').then(r => r.json()).then(d => setTypes(toArray(d))).catch(() => {}); }, []);

  const addType = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setTypeError('Vui lòng nhập tên loại thiết bị'); return; }
    if (types.some(t => t.name.trim().toLowerCase() === trimmed.toLowerCase())) { setTypeError('Loại thiết bị "' + trimmed + '" đã tồn tại!'); return; }
    setTypeError('');
    const data = await fetch(API + '/device-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) }).then(r => r.json());
    if (data.success || data.id) { setTypes(p => [...p, data.type || { id: data.id, name: trimmed }]); setNewName(''); }
    else setTypeError(data.message || 'Lỗi');
  };

  const updateType = async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) { alert('Tên không được để trống'); return; }
    if (types.some(t => t.id !== id && t.name.trim().toLowerCase() === trimmed.toLowerCase())) { alert('Loại thiết bị "' + trimmed + '" đã tồn tại!'); return; }
    const data = await fetch(API + '/device-types/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) }).then(r => r.json());
    if (data.success || data.message) setTypes(p => p.map(t => t.id === id ? { ...t, name: trimmed } : t));
    alert(data.message);
  };

  const deleteType = async (id) => {
    if (!confirm('Xóa loại thiết bị?')) return;
    const data = await fetch(API + '/device-types/' + id, { method: 'DELETE' }).then(r => r.json());
    alert(data.message); setTypes(p => p.filter(t => t.id !== id));
  };

  return (
    <div className="space-y-5">
      <SectionTitle>📦 Loại thiết bị</SectionTitle>
      <Card>
        <div className="flex gap-2 mb-2">
          <input value={newName} onChange={e => { setNewName(e.target.value); setTypeError(''); }} onKeyDown={e => e.key === 'Enter' && addType()} placeholder="Tên loại thiết bị mới..." className={'flex-1 border p-2 rounded-lg text-sm ' + (typeError ? 'border-red-400' : '')} />
          <Btn onClick={addType}>+ Thêm</Btn>
        </div>
        {typeError && <p className="text-red-500 text-xs mb-3">{typeError}</p>}

        {/* Mobile cards */}
        <div className="md:hidden space-y-2 mt-3">
          {types.map(t => <TypeCard key={t.id} type={t} onUpdate={updateType} onDelete={deleteType} />)}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto mt-3">
          <table className="w-full border text-sm">
            <thead><tr className="bg-gray-100"><th className="p-2 border w-12">ID</th><th className="p-2 border">Tên</th><th className="p-2 border w-32">Hành động</th></tr></thead>
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
  const [scans, setScans] = useState([]);

  useEffect(() => { fetch(API + '/scans').then(r => r.json()).then(d => setScans(Array.isArray(d) ? d : d?.scans ?? [])).catch(() => {}); }, []);

  const exportReport = () => {
    if (!scans.length) { alert('Chưa có dữ liệu'); return; }
    const rows = [['Tên Thiết Bị','QR Code','Người Quét','Thời Gian']];
    scans.forEach(s => rows.push([s.device_name, s.qr_code, s.user_name, s.scanned_at]));
    XLSX.writeFile(XLSX.utils.book_append_sheet(XLSX.utils.book_new(), XLSX.utils.aoa_to_sheet(rows), 'BaoCao'), 'BaoCaoThietBiDaQuet.xlsx');
  };

  const clearReports = async () => {
    if (!confirm('Xóa toàn bộ báo cáo?')) return;
    const data = await fetch(API + '/scans', { method: 'DELETE' }).then(r => r.json());
    alert(data.success ? data.message : data.message); if (data.success) setScans([]);
  };

  return (
    <div className="space-y-5">
      <SectionTitle>📋 Báo cáo</SectionTitle>
      <Card>
        <div className="flex gap-2 mb-4 flex-wrap">
          <Btn color="indigo" onClick={exportReport}>📤 Xuất Excel</Btn>
          <Btn color="red"    onClick={clearReports}>🗑️ Xóa tất cả</Btn>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {scans.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Chưa có dữ liệu</p>}
          {scans.map((s, i) => (
            <div key={i} className={'border rounded-xl p-3 ' + (s.status?.includes('Sai') ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200')}>
              <div className="font-semibold text-gray-800 text-sm">{s.device_name} <span className="text-xs text-gray-500 font-normal">({s.qr_code})</span></div>
              <div className="text-xs text-gray-500 mt-0.5">Thuộc: {s.device_department} · Quét tại: {s.scan_department}</div>
              <div className="text-xs text-gray-400">{s.user_name} · {s.scanned_at}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Audit Tab ────────────────────────────────────────────────
function AuditTab() {
  const [summary, setSummary]         = useState({ total: 0, scanned: 0, remaining: 0, sessions: 0, active: 0 });
  const [deptProgress, setDeptProg]   = useState([]);
  const [sessions, setSessions]       = useState([]);
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
    XLSX.writeFile(XLSX.utils.book_append_sheet(XLSX.utils.book_new(), XLSX.utils.aoa_to_sheet(rows), 'Audit'), 'Audit_' + compareTitle + '.xlsx');
  };

  const fmtDate = s => s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDur  = s => { if (!s.ended_at) return '—'; const m = Math.round((new Date(s.ended_at) - new Date(s.started_at || s.created_at)) / 60000); return m < 60 ? m + ' phút' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>🔍 Audit tài sản</SectionTitle>
        <Btn onClick={() => loadAudit()}>🔄 Làm mới</Btn>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Tổng thiết bị', value: summary.total,     color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Đã audit',      value: summary.scanned,   color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Chưa audit',    value: summary.remaining, color: 'text-red-500',    bg: 'bg-red-50'    },
          { label: 'Phiên audit',   value: summary.sessions,  color: 'text-purple-600', bg: 'bg-purple-50',
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
          {[{ label: 'Từ ngày', key: 'from', type: 'date' }, { label: 'Đến ngày', key: 'to', type: 'date' }].map(f => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">{f.label}</label>
              <input type={f.type} value={filter[f.key]} onChange={e => setFilter(p => ({...p, [f.key]: e.target.value}))} className="border p-2 rounded-lg text-sm" />
            </div>
          ))}
          <div className="flex flex-col gap-1 flex-1 min-w-32">
            <label className="text-xs text-gray-500">Bộ phận</label>
            <select value={filter.dept} onChange={e => setFilter(p => ({...p, dept: e.target.value}))} className="border p-2 rounded-lg text-sm">
              <option value="">-- Tất cả --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <Btn onClick={() => loadAudit(filter)}>🔍 Lọc</Btn>
          <Btn color="gray" onClick={() => { const f = { from: '', to: '', dept: '' }; setFilter(f); loadAudit(f); }}>✖ Xóa</Btn>
        </div>
      </Card>

      {/* Dept progress */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-4">🏢 Tiến độ theo bộ phận</h3>
        <div className="space-y-4">
          {deptProgress.length === 0 && <p className="text-gray-400 text-sm">Chưa có dữ liệu</p>}
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
        <h3 className="font-bold text-gray-700 mb-4">📅 Lịch sử phiên audit</h3>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {sessions.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Không có phiên audit nào</p>}
          {sessions.map(s => (
            <div key={s.id} className="border rounded-xl p-3 bg-gray-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-medium text-sm">{s.auditor_name || '—'}</div>
                  <div className="text-xs text-gray-500">{s.dept_name || '—'}</div>
                  <div className="text-xs text-gray-400">{fmtDate(s.started_at || s.created_at)} · {fmtDur(s)}</div>
                  <div className="text-xs text-indigo-600 font-semibold">Đã quét: {s.total_scanned ?? '—'}</div>
                </div>
                {!s.ended_at
                  ? <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Đang chạy</span>
                  : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs shrink-0">Hoàn tất</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Btn color="indigo" size="sm" onClick={() => showCompare(s.id, s.dept_name || '')}>📊 So sánh</Btn>
                {!s.ended_at ? <Btn color="orange" size="sm" onClick={() => forceStop(s.id)}>⏹ Dừng</Btn>
                             : <Btn color="red"    size="sm" onClick={() => deleteSession(s.id)}>🗑️ Xóa</Btn>}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-400 border-b text-xs uppercase tracking-wide">
              <th className="pb-2 pr-3">Kiểm kê viên</th><th className="pb-2 pr-3">Bộ phận</th>
              <th className="pb-2 pr-3">Bắt đầu</th><th className="pb-2 pr-3">Thời gian</th>
              <th className="pb-2 pr-3 text-center">Đã quét</th><th className="pb-2 text-center">Trạng thái</th>
              <th className="pb-2 text-center">Thao tác</th>
            </tr></thead>
            <tbody>
              {sessions.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400 text-sm">Không có phiên audit nào</td></tr>}
              {sessions.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 border-b">
                  <td className="py-2.5 pr-3 font-medium text-sm">{s.auditor_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-600 text-sm">{s.dept_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-500 text-xs">{fmtDate(s.started_at || s.created_at)}</td>
                  <td className="py-2.5 pr-3 text-gray-500 text-xs">{fmtDur(s)}</td>
                  <td className="py-2.5 pr-3 text-center font-semibold text-indigo-600">{s.total_scanned ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-center">
                    {!s.ended_at
                      ? <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Đang chạy</span>
                      : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">Hoàn tất</span>}
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
      </Card>

      {/* Compare – bottom sheet on mobile, modal on desktop */}
      {compareData && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="font-bold text-gray-700 text-sm">📊 So sánh: {compareTitle}</h3>
              <div className="flex gap-2">
                <Btn color="green" size="sm" onClick={exportCompare}>📥 Excel</Btn>
                <Btn color="gray"  size="sm" onClick={() => setCompareData(null)}>✕</Btn>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4 flex-shrink-0">
              <div className="bg-green-50 rounded-xl p-3 text-center"><div className="text-xl font-bold text-green-600">{compareData.filter(d => d.audited).length}</div><div className="text-xs text-gray-500">Đã audit</div></div>
              <div className="bg-red-50   rounded-xl p-3 text-center"><div className="text-xl font-bold text-red-500">{compareData.filter(d => !d.audited).length}</div><div className="text-xs text-gray-500">Chưa audit</div></div>
              <div className="bg-indigo-50 rounded-xl p-3 text-center"><div className="text-xl font-bold text-indigo-600">{compareData.length}</div><div className="text-xs text-gray-500">Tổng</div></div>
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
                        ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs shrink-0">✅ Đã audit</span>
                        : <span className="bg-red-100   text-red-600   px-2 py-0.5 rounded-full text-xs shrink-0">❌ Chưa</span>}
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <table className="hidden md:table w-full text-sm">
                <thead className="sticky top-0 bg-white border-b"><tr className="text-left text-gray-400 text-xs uppercase">
                  <th className="pb-2 pr-3 pt-2">Thiết bị</th><th className="pb-2 pr-3">QR Code</th>
                  <th className="pb-2 pr-3">Vị trí</th><th className="pb-2 pr-3">Người quét</th>
                  <th className="pb-2 pr-3">Thời gian</th><th className="pb-2 text-center">Trạng thái</th>
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
                          ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">✅ Đã audit</span>
                          : <span className="bg-red-100   text-red-600   px-2 py-0.5 rounded-full text-xs">❌ Chưa audit</span>}
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