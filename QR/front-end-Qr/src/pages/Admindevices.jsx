import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import { usePager, Pagination, Card, SectionTitle, Btn } from './adminUtils.jsx';

const API            = '/api';
const toArray        = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_ALL     = 9999;

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
                        className="flex-1 border border-[#079DD9]/50 p-1 rounded text-xs" autoFocus />
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
              className="w-full border rounded-lg pl-8 pr-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40"
            />
            {searchRaw && (
              <button onClick={() => setSearchRaw('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs font-bold">✕</button>
            )}
          </div>

          {/* Department */}
          <select
            value={filterDept}
            onChange={e => { setFilterDept(e.target.value); setFilterSection(''); setFilterGroup(''); setFilterCost(''); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[130px]"
          >
            <option value="">📂 {t('department')}</option>
            {departments.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>

          {/* Section */}
          <select
            value={filterSection}
            onChange={e => { setFilterSection(e.target.value); setFilterGroup(''); setFilterCost(''); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[110px] disabled:opacity-40"
            disabled={!filterDept}
          >
            <option value="">📁 {t('section')}</option>
            {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Group */}
          <select
            value={filterGroup}
            onChange={e => { setFilterGroup(e.target.value); setFilterCost(''); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[110px] disabled:opacity-40"
            disabled={!filterSection}
          >
            <option value="">👥 {t('group')}</option>
            {groupOptions.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          {/* Cost Center */}
          <select
            value={filterCost}
            onChange={e => { setFilterCost(e.target.value); setSelected(new Set()); }}
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 min-w-[110px] disabled:opacity-40"
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
            {loading ? '⏳ Đang tải...' : <span>{filtered.length} / {devices.length} {t('items')}</span>}
            {filterDept    && <span className="bg-[#d0eefa] text-[#0589c0] px-2 py-0.5 rounded-full text-xs">{departments.find(d => String(d.id) === filterDept)?.name || filterDept}</span>}
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


export default Devices;