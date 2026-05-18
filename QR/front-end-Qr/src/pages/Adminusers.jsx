import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import { usePager, Pagination, Card, SectionTitle, Btn } from './adminUtils.jsx';

const API            = '/api';
const toArray        = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_ALL     = 9999;

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

  const fetchDepts = useCallback(async () => {
    const d = await fetch(API + '/departments').then(r => r.json()).catch(() => []);
    setDepts(toArray(d));
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchDepts();
  }, [fetchDepts]);

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

  const unlockUser = async (id, name) => {
    if (!confirm(`Mở khoá tài khoản "${name}"?`)) return;
    const res  = await fetch(`${API}/users/${id}/unlock`, { method: 'POST' });
    const data = await res.json();
    if (data.success) { fetchUsers(); }
    else alert(data.message || t('error'));
  };

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

      // Helper: tạo hoặc lấy id của 1 record
      const getOrCreate = async (url, listUrl, name, body) => {
        try {
          const list = toArray(await fetch(listUrl).then(r => r.json()).catch(() => []));
          const found = list.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase());
          if (found) return found.id;
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
          return res.id || res.insertId || null;
        } catch { return null; }
      };

      let ok = 0, fail = 0, failList = [];
      for (const row of rows) {
        const username    = String(row.username     || '').trim();
        const password    = String(row.password     || '').trim();
        const deptName    = String(row.department_name   || '').trim();
        const sectionName = String(row.section_name      || '').trim();
        const groupName   = String(row.group_name        || '').trim();
        const costName    = String(row.cost_center_name  || '').trim();

        if (!username || !password) { fail++; failList.push('Thiếu username/password'); continue; }

        // ── Tự động tạo cây: Department → Section → Group → Cost Center ──
        let deptId = null, sectionId = null, groupId = null, costId = null;

        if (deptName) {
          deptId = await getOrCreate(
            API + '/departments',
            API + '/departments',
            deptName,
            { name: deptName }
          );
          // Reload depts sau khi tạo mới
          const freshDepts = toArray(await fetch(API + '/departments').then(r => r.json()).catch(() => []));
          setDepts(freshDepts);
        }

        if (sectionName && deptId) {
          sectionId = await getOrCreate(
            API + '/departments/' + deptId + '/sections',
            API + '/departments/' + deptId + '/sections',
            sectionName,
            { name: sectionName }
          );
        }

        if (groupName && sectionId) {
          groupId = await getOrCreate(
            API + '/sections/' + sectionId + '/groups',
            API + '/sections/' + sectionId + '/groups',
            groupName,
            { name: groupName }
          );
        }

        if (costName && (groupId || sectionId || deptId)) {
          const parentKey = groupId   ? 'group_id'      :
                            sectionId ? 'section_id'    : 'department_id';
          const parentId  = groupId || sectionId || deptId;
          const listUrl   = groupId   ? API + '/groups/'      + groupId   + '/cost-centers' :
                            sectionId ? API + '/cost-centers/by-section/' + sectionId :
                                        API + '/cost-centers/by-department/' + deptId;
          costId = await getOrCreate(
            API + '/cost-centers',
            listUrl,
            costName,
            { name: costName, [parentKey]: parentId }
          );
        }

        const payload = {
          username,
          password,
          full_name:      String(row.full_name || '').trim(),
          role:           String(row.role      || 'user').trim(),
          department_id:  deptId,
          section_id:     sectionId,
          group_id:       groupId,
          cost_center_id: costId,
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
  const lockedBadge = (u) => u.locked_at
    ? <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">🔒</span>
    : null;

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

            <button type="submit" className="sm:col-span-2 bg-[#079DD9] text-white p-3 rounded-lg text-sm font-medium hover:bg-[#0589c0] transition-colors">✅ {t('create_user')}</button>
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
        {/* <p className="text-xs text-gray-400 mt-1">{t('required_columns')}: username, password, full_name, department_name, role</p> */}
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
                    <div className="font-medium text-sm text-gray-800 truncate">{u.full_name || u.username}{lockedBadge(u)}</div>
                    <div className="text-xs text-gray-500">@{u.username}</div>
                    <div className="text-xs text-gray-500">{u.department_name || '—'}</div>
                  </div>
                </div>
                <span className={'px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ' + roleColor(u.role)}>{u.role}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <Btn color="yellow" size="sm" onClick={() => { fetchDepts(); setEditUser({...u, password: ''}); }}>✏️ {t('edit')}</Btn>
                {!(u.username === 'admin' || (u.role === 'admin' && u.id === 1)) && <Btn color="red" size="sm" onClick={() => deleteUser(u.id)}>🗑️ {t('delete')}</Btn>}
                {u.locked_at && <Btn color="green" size="sm" onClick={() => unlockUser(u.id, u.username)}>🔓 {t('unlock')}</Btn>}
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
              <th className="p-2 border text-center">🔒</th>
              <th className="p-2 border">{t('action')}</th>
            </tr></thead>
            <tbody>
              {userPager.paged.map((u, idx) => (
                <tr key={u.id} className={'hover:bg-gray-50 ' + (selected.has(u.id) ? 'bg-red-50' : '')}>
                  <td className="border p-2 text-center"><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} /></td>
                  <td className="border p-2 text-center text-gray-400 text-xs">{idx + 1}</td>
                  <td className="border p-2">{u.username}{lockedBadge(u)}</td>
                  <td className="border p-2">{u.full_name}</td>
                  <td className="border p-2 text-xs">{u.department_name || '—'}</td>
                  <td className="border p-2 text-xs">{u.section_name    || '—'}</td>
                  <td className="border p-2 text-xs">{u.group_name      || '—'}</td>
                  <td className="border p-2 text-xs">{u.cost_center     || '—'}</td>
                  <td className="border p-2 text-center"><span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + roleColor(u.role)}>{u.role}</span></td>
                  <td className="border p-2 text-center">
                    {u.locked_at
                      ? <Btn color="green" size="sm" onClick={() => unlockUser(u.id, u.username)}>🔓 {t('unlock')}</Btn>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="border p-2 text-center space-x-1">
                    <Btn color="yellow" size="sm" onClick={() => { fetchDepts(); setEditUser({...u, password: '', section_id: u.section_id || '', group_id: u.group_id || '', cost_center_id: u.cost_center_id || ''}); }}>✏️</Btn>
                    {!(u.username === 'admin' || (u.role === 'admin' && u.id === 1)) && <Btn color="red" size="sm" onClick={() => deleteUser(u.id)}>🗑️</Btn>}
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
            <h3 className="text-lg font-bold">✏️ {t("edit_user")}</h3>
            <input value={editUser.full_name} onChange={e => setEditUser(u => ({...u, full_name: e.target.value}))} placeholder={t("full_name")} className="w-full p-3 border rounded-lg text-sm" />
            <input value={editUser.password}  onChange={e => setEditUser(u => ({...u, password: e.target.value}))}  placeholder={t("new_password_hint")} type="password" className="w-full p-3 border rounded-lg text-sm" />

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
              <Btn color="gray" onClick={() => setEditUser(null)} className="flex-1">{t("cancel")}</Btn>
              <Btn color="blue" onClick={saveEdit} className="flex-1">💾 {t("save_device")}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;