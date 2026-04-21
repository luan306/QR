import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const API = '/api';

const toArray = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);

// ── Sidebar tabs ──────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',   label: 'Dashboard',        icon: '📊' },
  { id: 'users',       label: 'Quản lý User',     icon: '👤' },
  { id: 'devices',     label: 'Quản lý Thiết bị', icon: '💻' },
  { id: 'deviceTypes', label: 'Loại thiết bị',    icon: '📦' },
  { id: 'reports',     label: 'Báo cáo',          icon: '📋' },
  { id: 'audit',       label: 'Audit',             icon: '🔍' },
];

export default function Admin() {
  const navigate        = useNavigate();
  const [tab, setTab]   = useState('dashboard');
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/api/current-user')
      .then((r) => r.json())
      .then((d) => {
        const u = d.user || d;
        if (!u?.id)              { navigate('/login', { replace: true }); return; }
        if (u.role !== 'admin')  { alert('🚫 Bạn không có quyền Admin!'); navigate('/scan', { replace: true }); return; }
        setUser(u);
      })
      .catch(() => navigate('/login', { replace: true }));
  }, []);

  const handleLogout = async () => {
    try { await fetch('/api/logout', { method: 'GET' }); } catch {}
    window.location.replace('/login');
  };

  if (!user) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-gray-400 animate-pulse">Đang xác thực...</div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className="w-60 bg-indigo-700 text-white flex flex-col flex-shrink-0">
        <div className="p-4 text-xl font-bold border-b border-indigo-500">🛠️ Admin Panel</div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-4 py-2 rounded-lg transition-colors text-sm ${
                tab === t.id ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-indigo-500">
          <div className="text-xs text-indigo-300 mb-2">👤 {user.username}</div>
          <button
            onClick={handleLogout}
            className="w-full py-2 bg-red-500 rounded-lg hover:bg-red-600 text-sm"
          >
            🚪 Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">
        {tab === 'dashboard'   && <Dashboard />}
        {tab === 'users'       && <Users />}
        {tab === 'devices'     && <Devices />}
        {tab === 'deviceTypes' && <DeviceTypes />}
        {tab === 'reports'     && <Reports />}
        {tab === 'audit'       && <Audit />}
      </main>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────
function Dashboard() {
  const [stats, setStats]             = useState([]);
  const [deptDevices, setDeptDevices] = useState(null);
  const [deptName, setDeptName]       = useState('');
  const [departments, setDepts]       = useState([]);
  const overallRef = useRef(null);
  const deptRef    = useRef(null);
  const charts     = useRef({});

  useEffect(() => {
    fetch(API + '/departments').then(r => r.json()).then(d => setDepts(toArray(d))).catch(() => {});
    loadCharts();
  }, []);

  const loadCharts = async () => {
    const data = await fetch(API + '/stats/departments').then(r => r.json()).catch(() => []);
    const arr  = toArray(data);
    setStats(arr);

    const total   = arr.reduce((s, d) => s + (d.total_devices   || 0), 0);
    const scanned = arr.reduce((s, d) => s + (d.scanned_devices || 0), 0);

    if (overallRef.current) {
      charts.current.overall?.destroy();
      charts.current.overall = new Chart(overallRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Đã quét', 'Chưa quét'],
          datasets: [{ data: [scanned, Math.max(0, total - scanned)], backgroundColor: ['#22c55e', '#ef4444'] }]
        },
        options: { plugins: { legend: { position: 'bottom' } } }
      });
    }

    if (deptRef.current) {
      charts.current.dept?.destroy();
      charts.current.dept = new Chart(deptRef.current, {
        type: 'bar',
        data: {
          labels: arr.map(s => s.department_name),
          datasets: [
            { label: 'Đã quét',   data: arr.map(s => s.scanned_devices), backgroundColor: '#22c55e' },
            { label: 'Chưa quét', data: arr.map(s => s.pending_devices),  backgroundColor: '#ef4444' },
          ]
        },
        options: {
          responsive: true,
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
          onClick: (_, item) => {
            if (item.length > 0) {
              const d = arr[item[0].index];
              viewDept(d.department_id, d.department_name);
            }
          }
        }
      });
    }
  };

  const viewDept = async (id, name) => {
    const data = await fetch(API + '/departments/' + id + '/devices').then(r => r.json()).catch(() => []);
    setDeptDevices(toArray(data));
    setDeptName(name);
  };

  const exportDept = () => {
    if (!deptDevices?.length) { alert('⚠️ Chưa có dữ liệu'); return; }
    const ws = XLSX.utils.json_to_sheet(deptDevices);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, deptName);
    XLSX.writeFile(wb, `Dept_${deptName}.xlsx`);
  };

  const [newDeptName, setNewDeptName] = useState('');
  const [deptError,   setDeptError]   = useState('');

  const addDept = async () => {
    const trimmed = newDeptName.trim();
    if (!trimmed) { setDeptError('Vui lòng nhập tên bộ phận'); return; }
    // ── FIX 1: Check trùng tên bộ phận ngay trên frontend ──
    const isDup = departments.some(d => d.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (isDup) { setDeptError(`❌ Bộ phận "${trimmed}" đã tồn tại!`); return; }
    setDeptError('');
    const res  = await fetch(`${API}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json();
    if (data.success || data.id) {
      setDepts(prev => [...prev, data.department || { id: data.id, name: trimmed }]);
      setNewDeptName('');
    } else {
      setDeptError('❌ ' + (data.message || 'Lỗi thêm bộ phận'));
    }
  };

  const deleteDept = async (id, name) => {
    // ── FIX 4: Kiểm tra user đang thuộc bộ phận trước khi xóa ──
    try {
      const usersRes  = await fetch(`${API}/users`);
      const usersData = await usersRes.json();
      const affected  = toArray(usersData).filter(u => String(u.department_id) === String(id));
      if (affected.length > 0) {
        alert(
          `⚠️ Không thể xóa bộ phận "${name}"!\n\n` +
          `Có ${affected.length} user đang thuộc bộ phận này:\n` +
          affected.map(u => `• ${u.full_name || u.username}`).join('\n') +
          `\n\nVui lòng chuyển hoặc xóa các user này trước.`
        );
        return;
      }
    } catch { /* nếu API lỗi thì vẫn cho xóa */ }

    if (!confirm(`Xóa bộ phận "${name}"?`)) return;
    const res  = await fetch(`${API}/departments/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) setDepts(d => d.filter(x => x.id !== id));
    else alert('❌ ' + data.message);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-2xl font-bold">📊 Thống kê quét thiết bị</h2>

      <div className="bg-white p-6 rounded-xl shadow flex justify-center">
        <div className="w-48 h-48"><canvas ref={overallRef}></canvas></div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-semibold mb-4">Theo bộ phận</h3>
        <canvas ref={deptRef} height={120}></canvas>
      </div>

      {deptDevices && (
        <div className="bg-white p-6 rounded-xl shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">📋 Chi tiết: {deptName}</h3>
            <button onClick={exportDept} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">📤 Xuất Excel</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead><tr className="bg-gray-100">
                <th className="p-2 border">QR Code</th>
                <th className="p-2 border">Tên thiết bị</th>
                <th className="p-2 border">Vị trí</th>
                <th className="p-2 border">Trạng thái</th>
              </tr></thead>
              <tbody>
                {deptDevices.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border p-2 text-xs">{d.qr_code}</td>
                    <td className="border p-2">{d.name}</td>
                    <td className="border p-2 text-xs">{d.location}</td>
                    <td className={`border p-2 text-center text-xs font-medium ${d.status === 'Đã quét' ? 'text-green-600' : 'text-red-500'}`}>{d.status || 'Chưa quét'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-gray-700 mb-4">📂 Danh sách Bộ phận</h3>
        <div className="flex gap-2 mb-2">
          <input
            value={newDeptName}
            onChange={e => { setNewDeptName(e.target.value); setDeptError(''); }}
            onKeyDown={e => e.key === 'Enter' && addDept()}
            placeholder="Tên bộ phận mới..."
            className={`flex-1 border p-2 rounded-lg text-sm ${deptError ? 'border-red-400' : ''}`}
          />
          <button onClick={addDept} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">+ Thêm</button>
        </div>
        {deptError && <p className="text-red-500 text-xs mb-3">{deptError}</p>}
        <div className="divide-y">
          {departments.map(dep => (
            <div key={dep.id} className="flex justify-between items-center py-2">
              <span className="text-gray-800 font-medium">{dep.name}</span>
              <button onClick={() => deleteDept(dep.id, dep.name)} className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600">❌ Xóa</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Users ──────────────────────────────────────────────────────
function Users() {
  const [users, setUsers]       = useState([]);
  const [depts, setDepts]       = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm]         = useState({ username: '', password: '', full_name: '', department_id: '', role: 'user' });
  // FIX 2: Import nhiều user từ Excel
  const [importResult, setImportResult] = useState(null);
  const userFileRef = useRef(null);

  useEffect(() => {
    fetchUsers();
    fetch(API + '/departments').then(r => r.json()).then(d => setDepts(toArray(d))).catch(() => {});
  }, []);

  const fetchUsers = async () => {
    const data = await fetch(API + '/users').then(r => r.json()).catch(() => []);
    setUsers(toArray(data));
    setSelected(new Set());
  };

  // FIX 2: Import nhiều user từ Excel
  const downloadUserTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['username', 'password', 'full_name', 'department_name', 'role'],
      ['nguyenvana', '123456', 'Nguyễn Văn A', 'Phòng IT', 'user'],
      ['tranthib',   '123456', 'Trần Thị B',   'Phòng Hành Chính', 'auditor'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'User_Import_Template.xlsx');
  };

  const importUsersFromExcel = async () => {
    const file = userFileRef.current?.files?.[0];
    if (!file) { alert('⚠️ Vui lòng chọn file Excel trước!'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb    = XLSX.read(ev.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) { alert('⚠️ File Excel trống hoặc sai định dạng'); return; }

      // Map tên bộ phận → id
      const deptMap = Object.fromEntries(
        depts.map(d => [d.name.trim().toLowerCase(), d.id])
      );

      let ok = 0, fail = 0, failList = [];
      for (const row of rows) {
        const username = String(row.username || '').trim();
        const password = String(row.password || '').trim();
        if (!username || !password) { fail++; failList.push(`Thiếu username/password`); continue; }
        const deptName = String(row.department_name || '').trim().toLowerCase();
        const department_id = deptMap[deptName] || '';
        const payload = {
          username,
          password,
          full_name:     String(row.full_name || '').trim(),
          department_id,
          role:          String(row.role || 'user').trim(),
        };
        try {
          const res  = await fetch(API + '/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (data.success || data.id) ok++;
          else { fail++; failList.push(`${username}: ${data.message || 'lỗi'}`); }
        } catch { fail++; failList.push(`${username}: lỗi mạng`); }
      }

      setImportResult({ ok, fail, failList });
      fetchUsers();
      userFileRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const createUser = async (e) => {
    e.preventDefault();
    const res  = await fetch(API + '/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    alert(data.message);
    fetchUsers();
    setForm({ username: '', password: '', full_name: '', department_id: '', role: 'user' });
  };

  const deleteUser = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa tài khoản này?')) return;
    const res  = await fetch(`${API}/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.success ? 'Xóa thành công' : data.message);
    if (data.success) fetchUsers();
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Xóa ${selected.size} tài khoản đã chọn?`)) return;
    await Promise.all([...selected].map(id =>
      fetch(`${API}/users/${id}`, { method: 'DELETE' })
    ));
    fetchUsers();
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === users.length) setSelected(new Set());
    else setSelected(new Set(users.map(u => u.id)));
  };

  const saveEdit = async () => {
    const body = { full_name: editUser.full_name, department_id: editUser.department_id, role: editUser.role };
    if (editUser.password) body.password = editUser.password;
    const res  = await fetch(`${API}/users/${editUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    alert(data.message);
    setEditUser(null);
    fetchUsers();
  };

  const roleColor = (role) =>
    role === 'admin'   ? 'bg-red-100 text-red-700' :
    role === 'auditor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">👤 Quản lý User</h2>

      {/* FIX 2: Import nhiều user từ Excel */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-semibold text-gray-700 mb-3">📥 Import User từ Excel</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={downloadUserTemplate} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">📄 Tải file mẫu</button>
          <input type="file" ref={userFileRef} accept=".xlsx,.xls" className="border p-2 rounded text-sm" />
          <button onClick={importUsersFromExcel} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">📤 Import Excel</button>
        </div>
        <p className="text-xs text-gray-400 mt-2">File cần có cột: username, password, full_name, department_name, role</p>
        {importResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${importResult.fail > 0 ? 'bg-yellow-50 border border-yellow-300' : 'bg-green-50 border border-green-300'}`}>
            <p className="font-semibold">✅ Thành công: {importResult.ok} &nbsp;|&nbsp; ❌ Thất bại: {importResult.fail}</p>
            {importResult.failList.length > 0 && (
              <ul className="mt-1 text-xs text-red-600 space-y-0.5">
                {importResult.failList.map((m, i) => <li key={i}>• {m}</li>)}
              </ul>
            )}
            <button onClick={() => setImportResult(null)} className="mt-2 text-xs text-gray-400 underline">Đóng</button>
          </div>
        )}
      </div>

      <form onSubmit={createUser} className="bg-white p-6 rounded-xl shadow space-y-3 max-w-md">
        <input value={form.username}       onChange={e => setForm(f => ({...f, username: e.target.value}))}      placeholder="Tên đăng nhập" required className="w-full p-3 border rounded-lg text-sm" />
        <input value={form.password}       onChange={e => setForm(f => ({...f, password: e.target.value}))}      placeholder="Mật khẩu" type="password" required className="w-full p-3 border rounded-lg text-sm" />
        <input value={form.full_name}      onChange={e => setForm(f => ({...f, full_name: e.target.value}))}     placeholder="Họ tên" className="w-full p-3 border rounded-lg text-sm" />
        <select value={form.department_id} onChange={e => setForm(f => ({...f, department_id: e.target.value}))} className="w-full p-3 border rounded-lg text-sm">
          <option value="">-- Chọn bộ phận --</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} className="w-full p-3 border rounded-lg text-sm">
          <option value="user">User</option>
          <option value="auditor">Auditor</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">+ Tạo User</button>
      </form>

      <div className="bg-white p-4 rounded-xl shadow overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Danh sách User</h3>
          {selected.size > 0 && (
            <button onClick={deleteSelected} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 font-medium">
              🗑️ Xóa {selected.size} đã chọn
            </button>
          )}
        </div>
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border w-8">
                <input type="checkbox" checked={selected.size === users.length && users.length > 0} onChange={toggleAll} className="cursor-pointer" />
              </th>
              <th className="p-2 border w-10">#</th>
              <th className="p-2 border">Tên đăng nhập</th>
              <th className="p-2 border">Họ tên</th>
              <th className="p-2 border">Bộ phận</th>
              <th className="p-2 border">Role</th>
              <th className="p-2 border">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => (
              <tr key={u.id} className={`hover:bg-gray-50 ${selected.has(u.id) ? 'bg-red-50' : ''}`}>
                <td className="border p-2 text-center">
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} className="cursor-pointer" />
                </td>
                <td className="border p-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                <td className="border p-2">{u.username}</td>
                <td className="border p-2">{u.full_name}</td>
                <td className="border p-2">{u.department_name || u.department_id || '—'}</td>
                <td className="border p-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColor(u.role)}`}>{u.role}</span>
                </td>
                <td className="border p-2 text-center space-x-1">
                  <button onClick={() => setEditUser({...u, password: ''})} className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600">✏️ Edit</button>
                  <button onClick={() => deleteUser(u.id)}                  className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">🗑️ Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-96 space-y-3 shadow-xl">
            <h3 className="text-xl font-bold mb-2">✏️ Chỉnh sửa User</h3>
            <input value={editUser.full_name}      onChange={e => setEditUser(u => ({...u, full_name: e.target.value}))}     placeholder="Họ tên" className="w-full p-3 border rounded-lg text-sm" />
            <input value={editUser.password}        onChange={e => setEditUser(u => ({...u, password: e.target.value}))}      placeholder="Mật khẩu mới (để trống nếu không đổi)" type="password" className="w-full p-3 border rounded-lg text-sm" />
            <select value={editUser.department_id}  onChange={e => setEditUser(u => ({...u, department_id: e.target.value}))} className="w-full p-3 border rounded-lg text-sm">
              <option value="">-- Chọn bộ phận --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={editUser.role} onChange={e => setEditUser(u => ({...u, role: e.target.value}))} className="w-full p-3 border rounded-lg text-sm">
              <option value="user">User</option>
              <option value="auditor">Auditor</option>
              <option value="admin">Admin</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditUser(null)} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">Hủy</button>
              <button onClick={saveEdit}                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">💾 Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Devices ────────────────────────────────────────────────────
function Devices() {
  const [devices, setDevices]   = useState([]);
  const [selected, setSelected] = useState(new Set());
  const fileRef = useRef(null);

  useEffect(() => { fetchDevices(); }, []);

  const fetchDevices = async () => {
    const data = await fetch(API + '/devices').then(r => r.json()).catch(() => []);
    setDevices(toArray(data));
    setSelected(new Set());
  };

  const deleteDevice = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa thiết bị này?')) return;
    const res  = await fetch(`${API}/devices/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    fetchDevices();
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Xóa ${selected.size} thiết bị đã chọn?`)) return;
    await Promise.all([...selected].map(id =>
      fetch(`${API}/devices/${id}`, { method: 'DELETE' })
    ));
    fetchDevices();
  };

  const deleteAll = async () => {
    if (!confirm('Bạn có chắc muốn xóa tất cả thiết bị?')) return;
    const res  = await fetch(`${API}/devices`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    fetchDevices();
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === devices.length) setSelected(new Set());
    else setSelected(new Set(devices.map(d => d.id)));
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'QR_Code', 'Department', 'DeviceType', 'Location'],
      ['Laptop Dell', 'QR001', 'Phòng IT', 'Laptop', 'Tầng 1'],
      ['Máy in HP',   'QR002', 'Phòng Hành Chính', 'Máy in', 'Tầng 2'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    XLSX.writeFile(wb, 'Device_Template.xlsx');
  };

  const uploadExcel = async () => {
    if (!fileRef.current?.files?.length) { alert('⚠️ Vui lòng chọn file Excel trước!'); return; }

    // FIX 3: Check trùng tên thiết bị trước khi upload
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb     = XLSX.read(ev.target.result, { type: 'array' });
      const sheet  = wb.Sheets[wb.SheetNames[0]];
      const rows   = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const importNames   = rows.map(r => String(r.Name || r.name || '').trim().toLowerCase()).filter(Boolean);
      const existingNames = devices.map(d => (d.name || '').toLowerCase());

      const duplicates = importNames.filter(n => existingNames.includes(n));
      if (duplicates.length > 0) {
        const dupList = duplicates.slice(0, 10).map(n => '• ' + n).join('\n');
        const more    = duplicates.length > 10 ? '\n... và ' + (duplicates.length - 10) + ' thiết bị khác' : '';
        const msg     = '⚠️ Phát hiện ' + duplicates.length + ' thiết bị trùng tên:\n' + dupList + more + '\n\nBạn có muốn tiếp tục import không?\n(Các thiết bị trùng sẽ bị bỏ qua hoặc ghi đè tùy server)';
        const proceed = confirm(msg);
        if (!proceed) return;
      }

      // Upload sau khi đã xác nhận
      const formData = new FormData();
      formData.append('file', fileRef.current.files[0]);
      const res  = await fetch(API + '/devices/upload', { method: 'POST', body: formData });
      const data = await res.json();
      alert(data.message);
      fetchDevices();
    };
    reader.readAsArrayBuffer(fileRef.current.files[0]);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">💻 Quản lý Thiết bị</h2>
      <div className="bg-white p-6 rounded-xl shadow space-y-4">
        <div className="flex flex-wrap gap-2">
          <a href={API + '/devices/export'} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">⬇️ Tải danh sách</a>
          <button onClick={downloadTemplate} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">📥 Tải Excel mẫu</button>
          <button onClick={deleteAll}        className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600">🗑️ Xóa tất cả</button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" className="border p-2 rounded text-sm" />
          <button onClick={uploadExcel} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">📤 Upload Excel</button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{devices.length} thiết bị</span>
          {selected.size > 0 && (
            <button onClick={deleteSelected} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 font-medium">
              🗑️ Xóa {selected.size} đã chọn
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border w-8">
                  <input type="checkbox" checked={selected.size === devices.length && devices.length > 0} onChange={toggleAll} className="cursor-pointer" />
                </th>
                <th className="p-2 border w-10">#</th>
                <th className="p-2 border">Tên Thiết Bị</th>
                <th className="p-2 border">Loại</th>
                <th className="p-2 border">Bộ phận</th>
                <th className="p-2 border">Trạng thái</th>
                <th className="p-2 border">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((dev, idx) => (
                <tr key={dev.id} className={`hover:bg-gray-50 ${selected.has(dev.id) ? 'bg-red-50' : ''}`}>
                  <td className="border p-2 text-center">
                    <input type="checkbox" checked={selected.has(dev.id)} onChange={() => toggleOne(dev.id)} className="cursor-pointer" />
                  </td>
                  <td className="border p-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                  <td className="border p-2">{dev.name}</td>
                  <td className="border p-2">{dev.device_type_name || '—'}</td>
                  <td className="border p-2">{dev.department_name || '—'}</td>
                  <td className={`border p-2 text-center text-xs font-medium ${dev.status === 'Đã quét' ? 'text-green-600' : 'text-red-500'}`}>{dev.status}</td>
                  <td className="border p-2 text-center">
                    <button onClick={() => deleteDevice(dev.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ── Device Types ───────────────────────────────────────────────
function DeviceTypes() {
  const [types, setTypes]     = useState([]);
  const [newName, setNewName] = useState('');
  const [typeError, setTypeError] = useState('');

  useEffect(() => { fetchTypes(); }, []);

  const fetchTypes = async () => {
    const data = await fetch(API + '/device-types').then(r => r.json()).catch(() => []);
    setTypes(toArray(data));
  };

  const addType = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setTypeError('Vui lòng nhập tên loại thiết bị'); return; }
    // Check trùng tên khi thêm mới
    const isDup = types.some(t => t.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (isDup) { setTypeError('❌ Loại thiết bị "' + trimmed + '" đã tồn tại!'); return; }
    setTypeError('');
    const res  = await fetch(API + '/device-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) });
    const data = await res.json();
    if (data.success || data.id) {
      setTypes(prev => [...prev, data.type || { id: data.id, name: trimmed }]);
      setNewName('');
    } else {
      setTypeError('❌ ' + (data.message || 'Lỗi thêm loại thiết bị'));
    }
  };

  const updateType = async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) { alert('Tên không được để trống'); return; }
    // Check trùng tên khi sửa (bỏ qua chính nó)
    const isDup = types.some(t => t.id !== id && t.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (isDup) { alert('❌ Loại thiết bị "' + trimmed + '" đã tồn tại!'); return; }
    const res  = await fetch(`${API}/device-types/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }) });
    const data = await res.json();
    if (data.success || data.message) {
      setTypes(prev => prev.map(t => t.id === id ? { ...t, name: trimmed } : t));
    }
    alert(data.message);
  };

  const deleteType = async (id) => {
    if (!confirm('Xóa loại thiết bị?')) return;
    const res  = await fetch(`${API}/device-types/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    fetchTypes();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-2xl font-bold">📦 Quản lý loại thiết bị</h2>
      <div className="bg-white p-6 rounded-xl shadow">
        <div className="flex gap-2 mb-2">
          <input
            value={newName}
            onChange={e => { setNewName(e.target.value); setTypeError(''); }}
            onKeyDown={e => e.key === 'Enter' && addType()}
            placeholder="Tên loại thiết bị"
            className={"border p-2 rounded-lg w-60 text-sm" + (typeError ? " border-red-400" : "")}
          />
          <button onClick={addType} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">+ Thêm</button>
        </div>
        {typeError && <p className="text-red-500 text-xs mb-3">{typeError}</p>}
        <table className="w-full border text-sm">
          <thead><tr className="bg-gray-100">
            <th className="p-2 border">ID</th>
            <th className="p-2 border">Tên</th>
            <th className="p-2 border">Hành động</th>
          </tr></thead>
          <tbody>
            {types.map(t => (
              <TypeRow key={t.id} type={t} onUpdate={updateType} onDelete={deleteType} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypeRow({ type, onUpdate, onDelete }) {
  const [name, setName] = useState(type.name);
  return (
    <tr className="hover:bg-gray-50">
      <td className="border p-2 text-center">{type.id}</td>
      <td className="border p-2"><input value={name} onChange={e => setName(e.target.value)} className="border p-1 rounded w-full text-sm" /></td>
      <td className="border p-2 text-center space-x-2">
        <button onClick={() => onUpdate(type.id, name)} className="bg-yellow-500 text-white px-2 py-1 rounded text-xs hover:bg-yellow-600">Sửa</button>
        <button onClick={() => onDelete(type.id)} className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600">Xóa</button>
      </td>
    </tr>
  );
}

// ── Reports ────────────────────────────────────────────────────
function Reports() {
  const [scans, setScans] = useState([]);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    const data = await fetch(API + '/scans').then(r => r.json()).catch(() => []);
    setScans(Array.isArray(data) ? data : data?.scans ?? []);
  };

  const exportReport = () => {
    if (!scans.length) { alert('⚠️ Chưa có thiết bị nào được quét!'); return; }
    const rows = [['Tên Thiết Bị', 'QR Code', 'Người Quét', 'Thời Gian']];
    scans.forEach(s => rows.push([s.device_name, s.qr_code, s.user_name, s.scanned_at]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCao');
    XLSX.writeFile(wb, 'BaoCaoThietBiDaQuet.xlsx');
  };

  const clearReports = async () => {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ báo cáo?')) return;
    const res  = await fetch(API + '/scans', { method: 'DELETE' });
    const data = await res.json();
    alert(data.success ? '✅ ' + data.message : '❌ Xóa thất bại: ' + data.message);
    if (data.success) fetchReports();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <h2 className="text-2xl font-bold">📋 Báo cáo</h2>
      <div className="bg-white p-6 rounded-xl shadow">
        <p className="mb-4 text-sm text-gray-600">Danh sách thiết bị đã quét:</p>
        <ul className="space-y-2 mb-6 max-h-96 overflow-y-auto">
          {scans.length === 0 && <li className="text-gray-400 text-sm">Chưa có dữ liệu</li>}
          {scans.map((s, i) => (
            <li key={i} className={`text-sm ${s.status?.includes('Sai') ? 'text-red-600 font-bold' : 'text-green-700'}`}>
              <b>{s.device_name}</b> ({s.qr_code})<br />
              Thuộc: {s.device_department} | Quét tại: {s.scan_department}<br />
              {s.status} — {s.user_name} @ {s.scanned_at}
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <button onClick={exportReport} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">📤 Xuất báo cáo Excel</button>
          <button onClick={clearReports} className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">🗑️ Xóa tất cả báo cáo</button>
        </div>
      </div>
    </div>
  );
}

// ── Audit ──────────────────────────────────────────────────────
function Audit() {
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

      const params = [];
      if (f.from) params.push(`from=${f.from}`);
      if (f.to)   params.push(`to=${f.to}`);
      if (f.dept) params.push(`dept=${f.dept}`);
      const sessUrl  = API + '/scan/audit-sessions' + (params.length ? '?' + params.join('&') : '');
      const sessData = toArray(await fetch(sessUrl).then(r => r.json()).catch(() => []));

      const total   = deptData.reduce((s, d) => s + (d.total_devices   || 0), 0);
      const scanned = deptData.reduce((s, d) => s + (d.scanned_devices || 0), 0);
      const active  = sessData.filter(s => !s.ended_at).length;

      setSummary({ total, scanned, remaining: total - scanned, sessions: sessData.length, active });
      setDeptProg(deptData);
      setSessions(sessData);
    } catch (err) {
      console.error('loadAudit error', err);
    }
  }, [filter]);

  const forceStop = async (id) => {
    if (!confirm('Dừng phiên audit này?')) return;
    const res  = await fetch(`${API}/scan/force-stop/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) loadAudit(); else alert('❌ ' + (data.message || 'Lỗi'));
  };

  const deleteSession = async (id) => {
    if (!confirm('Xóa phiên audit này? Lịch sử scan vẫn được giữ lại.')) return;
    const res  = await fetch(`${API}/scan/audit-session/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadAudit(); else alert('❌ ' + (data.message || 'Lỗi'));
  };

  const showCompare = async (sessionId, deptName) => {
    const data = toArray(await fetch(`${API}/scan/audit-compare/${sessionId}`).then(r => r.json()).catch(() => []));
    setCompareData(data);
    setCmpTitle(deptName);
  };

  const exportCompare = () => {
    if (!compareData?.length) { alert('Không có dữ liệu'); return; }
    const rows = [['Tên thiết bị', 'QR Code', 'Vị trí', 'Người audit', 'Thời gian', 'Trạng thái']];
    compareData.forEach(d => rows.push([d.device_name, d.qr_code, d.location || '', d.scanned_by || '', d.scanned_at || '', d.audited ? 'Đã audit' : 'Chưa audit']));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit');
    XLSX.writeFile(wb, `Audit_${compareTitle}.xlsx`);
  };

  const fmtDate = (str) => str ? new Date(str).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDur  = (s) => {
    if (!s.ended_at) return '—';
    const mins = Math.round((new Date(s.ended_at) - new Date(s.started_at || s.created_at)) / 60000);
    return mins < 60 ? `${mins} phút` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">🔍 Audit tài sản</h2>
        <button onClick={() => loadAudit()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">🔄 Làm mới</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Tổng thiết bị', value: summary.total,     color: 'text-indigo-600' },
          { label: 'Đã audit',      value: summary.scanned,   color: 'text-green-600' },
          { label: 'Chưa audit',    value: summary.remaining, color: 'text-red-500' },
          { label: 'Phiên audit',   value: summary.sessions,  color: 'text-purple-600', extra: summary.active > 0 ? `${summary.active} đang chạy` : null },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow text-center">
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-sm text-gray-500 mt-1">{c.label}</div>
            {c.extra && <div className="mt-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full inline-block">{c.extra}</div>}
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Từ ngày</label>
            <input type="date" value={filter.from} onChange={e => setFilter(f => ({...f, from: e.target.value}))} className="border p-2 rounded-lg text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Đến ngày</label>
            <input type="date" value={filter.to} onChange={e => setFilter(f => ({...f, to: e.target.value}))} className="border p-2 rounded-lg text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Bộ phận</label>
            <select value={filter.dept} onChange={e => setFilter(f => ({...f, dept: e.target.value}))} className="border p-2 rounded-lg text-sm min-w-40">
              <option value="">-- Tất cả --</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button onClick={() => loadAudit(filter)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">🔍 Lọc</button>
          <button onClick={() => { const f = { from: '', to: '', dept: '' }; setFilter(f); loadAudit(f); }} className="bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-300">✖ Xóa lọc</button>
        </div>
      </div>

      {/* Dept progress */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold text-gray-700 mb-4">🏢 Tiến độ theo bộ phận</h3>
        <div className="space-y-4">
          {deptProgress.length === 0 && <p className="text-gray-400 text-sm">Chưa có dữ liệu</p>}
          {deptProgress.map((d, i) => {
            const total   = d.total_devices   || 0;
            const scanned = d.scanned_devices || 0;
            const pct     = total > 0 ? Math.round(scanned * 100 / total) : 0;
            const color   = pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400';
            const textCol = pct >= 80 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-500';
            return (
              <div key={i}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-gray-700 text-sm">{d.department_name}</span>
                  <span className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-700">{scanned}</span> / {total} thiết bị
                    <span className={`ml-2 font-bold ${textCol}`}>{pct}%</span>
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div className={`${color} h-3 rounded-full transition-all duration-700`} style={{ width: pct + '%' }}></div>
                </div>
                {total - scanned > 0 && <div className="text-xs text-gray-400 mt-0.5">Còn {total - scanned} thiết bị chưa audit</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sessions table */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-bold text-gray-700 mb-4">📅 Lịch sử phiên audit</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b text-xs uppercase tracking-wide">
                <th className="pb-2 pr-3">Kiểm kê viên</th>
                <th className="pb-2 pr-3">Bộ phận</th>
                <th className="pb-2 pr-3">Bắt đầu</th>
                <th className="pb-2 pr-3">Thời gian</th>
                <th className="pb-2 pr-3 text-center">Đã quét</th>
                <th className="pb-2 text-center">Trạng thái</th>
                <th className="pb-2 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-gray-400 text-sm">Không có phiên audit nào</td></tr>
              )}
              {sessions.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 border-b transition-colors">
                  <td className="py-2.5 pr-3 font-medium text-gray-700 text-sm">{s.auditor_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-600 text-sm">{s.dept_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-500 text-xs">{fmtDate(s.started_at || s.created_at)}</td>
                  <td className="py-2.5 pr-3 text-gray-500 text-xs">{fmtDur(s)}</td>
                  <td className="py-2.5 pr-3 text-center font-semibold text-indigo-600">{s.total_scanned ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-center">
                    {!s.ended_at
                      ? <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"></span>Đang chạy</span>
                      : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">Hoàn tất</span>
                    }
                  </td>
                  <td className="py-2.5 text-center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      <button onClick={() => showCompare(s.id, s.dept_name || '')} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs hover:bg-indigo-200">📊 So sánh</button>
                      {!s.ended_at
                        ? <button onClick={() => forceStop(s.id)} className="bg-orange-100 text-orange-600 px-3 py-1 rounded-lg text-xs hover:bg-orange-200">⏹ Dừng</button>
                        : <button onClick={() => deleteSession(s.id)} className="bg-red-100 text-red-600 px-3 py-1 rounded-lg text-xs hover:bg-red-200">🗑️ Xóa</button>
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compare box */}
      {compareData && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-700">📊 So sánh: {compareTitle}</h3>
            <div className="flex gap-2">
              <button onClick={exportCompare} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">📥 Tải Excel</button>
              <button onClick={() => setCompareData(null)} className="bg-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm">✖ Đóng</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-green-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-green-600">{compareData.filter(d => d.audited).length}</div><div className="text-xs text-gray-500">Đã audit</div></div>
            <div className="bg-red-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-red-500">{compareData.filter(d => !d.audited).length}</div><div className="text-xs text-gray-500">Chưa audit</div></div>
            <div className="bg-indigo-50 rounded-xl p-3 text-center"><div className="text-2xl font-bold text-indigo-600">{compareData.length}</div><div className="text-xs text-gray-500">Tổng thiết bị</div></div>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-gray-400 border-b text-xs uppercase">
                  <th className="pb-2 pr-3">Thiết bị</th>
                  <th className="pb-2 pr-3">QR Code</th>
                  <th className="pb-2 pr-3">Vị trí</th>
                  <th className="pb-2 pr-3">Người quét</th>
                  <th className="pb-2 pr-3">Thời gian</th>
                  <th className="pb-2 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {compareData.map((d, i) => (
                  <tr key={i} className={`border-b hover:bg-gray-50 ${d.audited ? '' : 'bg-red-50'}`}>
                    <td className="py-2 pr-3 font-medium text-sm">{d.device_name}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{d.qr_code}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{d.location || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{d.scanned_by || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 text-xs">{d.scanned_at ? new Date(d.scanned_at).toLocaleString('vi-VN') : '—'}</td>
                    <td className="py-2 text-center">
                      {d.audited
                        ? <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">✅ Đã audit</span>
                        : <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-medium">❌ Chưa audit</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}