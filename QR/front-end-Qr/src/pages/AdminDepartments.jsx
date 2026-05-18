import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionTitle } from './adminUtils.jsx';

const API     = '/api';
const toArray = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);

const inputCls  = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 focus:border-[#079DD9] bg-white';
const selectCls = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 focus:border-[#079DD9] bg-white disabled:bg-gray-50 disabled:text-gray-400';

// ── Build flat rows — KHÔNG gộp ô, mỗi dòng độc lập ──────────
function buildRows(departments, sections, groups, costs) {
  const rows = [];
  departments.forEach((dep, di) => {
    const depSecs      = sections.filter(s => String(s.department_id) === String(dep.id));
    const deptDirCosts = costs.filter(c => String(c.department_id) === String(dep.id) && !c.section_id && !c.group_id);

    // Dept không có section, không có cost → 1 dòng trống
    if (depSecs.length === 0 && deptDirCosts.length === 0) {
      rows.push({ key: `d${dep.id}`, dep, sec: null, grp: null, cost: null, deptIdx: di });
      return;
    }

    // Dept không có section, có cost trực tiếp
    if (depSecs.length === 0 && deptDirCosts.length > 0) {
      deptDirCosts.forEach(cost => {
        rows.push({ key: `d${dep.id}dc${cost.id}`, dep, sec: null, grp: null, cost, deptIdx: di });
      });
      return;
    }

    // Dept có section
    depSecs.forEach(sec => {
      const secGrps  = groups.filter(g => String(g.section_id) === String(sec.id));
      const secCosts = costs.filter(c => String(c.section_id) === String(sec.id) && !c.group_id);

      if (secGrps.length === 0 && secCosts.length === 0) {
        rows.push({ key: `d${dep.id}s${sec.id}`, dep, sec, grp: null, cost: null, deptIdx: di });
        return;
      }

      if (secGrps.length === 0) {
        secCosts.forEach(cost => {
          rows.push({ key: `d${dep.id}s${sec.id}c${cost.id}`, dep, sec, grp: null, cost, deptIdx: di });
        });
        return;
      }

      secGrps.forEach(grp => {
        const grpCosts = costs.filter(c => String(c.group_id) === String(grp.id));
        if (grpCosts.length === 0) {
          rows.push({ key: `d${dep.id}s${sec.id}g${grp.id}`, dep, sec, grp, cost: null, deptIdx: di });
        } else {
          grpCosts.forEach(cost => {
            rows.push({ key: `d${dep.id}s${sec.id}g${grp.id}c${cost.id}`, dep, sec, grp, cost, deptIdx: di });
          });
        }
      });

      // Cost trực tiếp của section (không qua group)
      secCosts.forEach(cost => {
        rows.push({ key: `d${dep.id}s${sec.id}dc${cost.id}`, dep, sec, grp: null, cost, deptIdx: di });
      });
    });

    // Cost trực tiếp của dept (không qua section)
    deptDirCosts.forEach(cost => {
      rows.push({ key: `d${dep.id}dc${cost.id}`, dep, sec: null, grp: null, cost, deptIdx: di });
    });
  });
  return rows;
}

export default function AdminDepartments() {
  const { t } = useTranslation();

  const [departments, setDepartments] = useState([]);
  const [sections,    setSections]    = useState([]);
  const [groups,      setGroups]      = useState([]);
  const [costs,       setCosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);

  // ── Filter ────────────────────────────────────────────────────
  const [fDept, setFDept] = useState('');
  const [fSec,  setFSec]  = useState('');
  const [fGrp,  setFGrp]  = useState('');
  const [fCost, setFCost] = useState('');

  // ── Modal: Khởi tạo ──────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createErr,  setCreateErr]  = useState('');
  const [cDeptName,  setCDeptName]  = useState('');
  const [cSecName,   setCSecName]   = useState('');
  const [cGrpName,   setCGrpName]   = useState('');
  const [cCostName,  setCCostName]  = useState('');
  const [cDeptId,    setCDeptId]    = useState('');
  const [cSecId,     setCSecId]     = useState('');
  const [cGrpId,     setCGrpId]     = useState('');
  const [cModalSecs, setCModalSecs] = useState([]);
  const [cModalGrps, setCModalGrps] = useState([]);

  // ── Modal: Chỉnh sửa ─────────────────────────────────────────
  const [showEdit,     setShowEdit]     = useState(false);
  const [editErr,      setEditErr]      = useState('');
  const [editDeptName, setEditDeptName] = useState('');
  const [editSecName,  setEditSecName]  = useState('');
  const [editGrpName,  setEditGrpName]  = useState('');
  const [editCostName, setEditCostName] = useState('');
  const [editIds,      setEditIds]      = useState({});

  // ── Load ──────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/departments/all-hierarchy`);
      const data = await res.json();
      setDepartments(toArray(data.departments));
      setSections(toArray(data.sections));
      setGroups(toArray(data.groups));
      setCosts(toArray(data.costs));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const okRes = (res, data) => res.ok || data?.success || data?.id;

  // ── Create modal cascades ─────────────────────────────────────
  useEffect(() => {
    setCModalSecs([]); setCSecId(''); setCModalGrps([]); setCGrpId('');
    if (!cDeptId) return;
    fetch(`${API}/departments/${cDeptId}/sections`).then(r => r.json()).then(d => setCModalSecs(toArray(d))).catch(() => {});
  }, [cDeptId]);

  useEffect(() => {
    setCModalGrps([]); setCGrpId('');
    if (!cSecId) return;
    fetch(`${API}/sections/${cSecId}/groups`).then(r => r.json()).then(d => setCModalGrps(toArray(d))).catch(() => {});
  }, [cSecId]);

  const resetCreate = () => {
    setCDeptName(''); setCSecName(''); setCGrpName(''); setCCostName('');
    setCDeptId(''); setCSecId(''); setCGrpId('');
    setCModalSecs([]); setCModalGrps([]); setCreateErr('');
  };

  // ── Create submit ─────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault(); setCreateErr('');
    let deptId = cDeptId || null;
    if (!deptId && cDeptName.trim()) {
      const res  = await fetch(`${API}/departments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cDeptName.trim() }) });
      const data = await res.json();
      if (!okRes(res, data)) { setCreateErr(data.message || 'Lỗi tạo bộ phận'); return; }
      deptId = data.id || data.insertId;
    }
    if (!deptId) { setCreateErr('Vui lòng nhập hoặc chọn bộ phận'); return; }

    let secId = cSecId || null;
    if (!secId && cSecName.trim()) {
      const res  = await fetch(`${API}/departments/${deptId}/sections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cSecName.trim() }) });
      const data = await res.json();
      if (!okRes(res, data)) { setCreateErr(data.message || 'Lỗi tạo section'); return; }
      secId = data.id || data.insertId;
    }

    let grpId = cGrpId || null;
    if (!grpId && cGrpName.trim() && secId) {
      const res  = await fetch(`${API}/groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cGrpName.trim(), section_id: secId }) });
      const data = await res.json();
      if (!okRes(res, data)) { setCreateErr(data.message || 'Lỗi tạo group'); return; }
      grpId = data.id || data.insertId;
    }

    if (cCostName.trim()) {
      const body = grpId ? { name: cCostName.trim(), group_id: grpId }
                 : secId ? { name: cCostName.trim(), section_id: secId }
                 :         { name: cCostName.trim(), department_id: deptId };
      const res  = await fetch(`${API}/cost-centers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!okRes(res, data)) { setCreateErr(data.message || 'Lỗi tạo cost center'); return; }
    }

    setShowCreate(false); resetCreate(); loadAll();
  };

  // ── Open edit modal ───────────────────────────────────────────
  const openEdit = (row) => {
    setEditIds({
      deptId: row.dep?.id  || null,
      secId:  row.sec?.id  || null,
      grpId:  row.grp?.id  || null,
      costId: row.cost?.id || null,
    });
    setEditDeptName(row.dep?.name  || '');
    setEditSecName(row.sec?.name   || '');
    setEditGrpName(row.grp?.name   || '');
    setEditCostName(row.cost?.name || '');
    if (row.dep?.id) {
      fetch(`${API}/departments/${row.dep.id}/sections`).then(r => r.json()).then(d => setCModalSecs(toArray(d))).catch(() => {});
    }
    if (row.sec?.id) {
      fetch(`${API}/sections/${row.sec.id}/groups`).then(r => r.json()).then(d => setCModalGrps(toArray(d))).catch(() => {});
    }
    setEditErr('');
    setShowEdit(true);
  };

  // ── Save edit ─────────────────────────────────────────────────
  const handleSaveEdit = async (e) => {
    e.preventDefault(); setEditErr('');

    const patch = async (url, name) => {
      const res  = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
      const data = await res.json();
      if (!okRes(res, data)) throw new Error((res.status === 409 ? '⚠️ Trùng tên: ' : '❌ ') + (data.message || t('error')));
    };

    const create = async (url, body) => {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!okRes(res, data)) throw new Error((res.status === 409 ? '⚠️ Trùng tên: ' : '❌ ') + (data.message || t('error')));
      return data.id || data.insertId;
    };

    try {
      if (editIds.deptId && editDeptName.trim())
        await patch(`${API}/departments/${editIds.deptId}`, editDeptName);

      let secId = editIds.secId;
      if (secId && editSecName.trim())
        await patch(`${API}/sections/${secId}`, editSecName);
      else if (secId && !editSecName.trim()) {
        if (!confirm('Xóa section này? Cost Center trực tiếp sẽ chuyển lên bộ phận.')) { setEditErr('Đã huỷ'); return; }
        await fetch(`${API}/cost-centers/reparent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_type: 'section', from_id: secId, to_type: 'department', to_id: editIds.deptId }) }).catch(() => {});
        await fetch(`${API}/sections/${secId}`, { method: 'DELETE' });
        secId = null;
      } else if (!secId && editSecName.trim() && editIds.deptId)
        secId = await create(`${API}/departments/${editIds.deptId}/sections`, { name: editSecName.trim() });

      let grpId = editIds.grpId;
      if (grpId && editGrpName.trim())
        await patch(`${API}/groups/${grpId}`, editGrpName);
      else if (grpId && !editGrpName.trim()) {
        if (!confirm('Xóa group này? Cost Center bên trong sẽ chuyển lên ' + (secId ? 'section.' : 'bộ phận.'))) { setEditErr('Đã huỷ'); return; }
        const reparentTo = secId
          ? { from_type: 'group', from_id: grpId, to_type: 'section',    to_id: secId }
          : { from_type: 'group', from_id: grpId, to_type: 'department', to_id: editIds.deptId };
        await fetch(`${API}/cost-centers/reparent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reparentTo) }).catch(() => {});
        await fetch(`${API}/groups/${grpId}`, { method: 'DELETE' });
        grpId = null;
      } else if (!grpId && editGrpName.trim()) {
        const body = secId
          ? { name: editGrpName.trim(), section_id: secId }
          : { name: editGrpName.trim(), department_id: editIds.deptId };
        grpId = await create(`${API}/groups`, body);
      }

      if (editIds.costId && editCostName.trim()) {
        await patch(`${API}/cost-centers/${editIds.costId}`, editCostName);
        const newGrpId  = grpId  || null;
        const newSecId  = !grpId ? (secId || null) : null;
        const newDeptId = !grpId && !secId ? (editIds.deptId || null) : null;
        const parentChanged =
          String(newGrpId || '') !== String(editIds.grpId  || '') ||
          String(newSecId || '') !== String(editIds.secId  || '');
        if (parentChanged) {
          await fetch(`${API}/cost-centers/${editIds.costId}/parent`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: newGrpId, section_id: newSecId, department_id: newDeptId }),
          });
        }
      } else if (editIds.costId && !editCostName.trim()) {
        await fetch(`${API}/cost-centers/${editIds.costId}`, { method: 'DELETE' });
      } else if (!editIds.costId && editCostName.trim()) {
        const body = grpId ? { name: editCostName.trim(), group_id: grpId }
                   : secId ? { name: editCostName.trim(), section_id: secId }
                   :         { name: editCostName.trim(), department_id: editIds.deptId };
        await create(`${API}/cost-centers`, body);
      }

      setShowEdit(false); loadAll();
    } catch (err) { setEditErr(err.message); }
  };

  // ── Delete — xóa hết dòng đó, không đụng cấp cha nếu dòng khác còn dùng ──
  const deleteRow = async (row) => {
    if (!confirm('Xóa dòng này?')) return;

    const otherRows = rows.filter(r => r.key !== row.key);
    const depUsed  = otherRows.some(r => r.dep?.id  && String(r.dep.id)  === String(row.dep?.id));
    const secUsed  = otherRows.some(r => r.sec?.id  && String(r.sec.id)  === String(row.sec?.id));
    const grpUsed  = otherRows.some(r => r.grp?.id  && String(r.grp.id)  === String(row.grp?.id));

    // Xóa tuần tự từ sâu → nông, bỏ qua cấp nào dòng khác còn dùng
    if (row.cost?.id) await fetch(`${API}/cost-centers/${row.cost.id}`, { method: 'DELETE' });
    if (row.grp?.id  && !grpUsed) await fetch(`${API}/groups/${row.grp.id}`,      { method: 'DELETE' });
    if (row.sec?.id  && !secUsed) await fetch(`${API}/sections/${row.sec.id}`,    { method: 'DELETE' });
    if (row.dep?.id  && !depUsed) await fetch(`${API}/departments/${row.dep.id}`, { method: 'DELETE' });

    loadAll();
  };

  const rows = buildRows(departments, sections, groups, costs);

  // Options cho dropdown (unique, sorted)
  const deptOpts = [...new Map(rows.filter(r => r.dep).map(r => [r.dep.id, r.dep.name])).entries()];
  const secOpts  = [...new Map(rows.filter(r => r.sec && (!fDept || String(r.dep?.id) === fDept)).map(r => [r.sec.id, r.sec.name])).entries()];
  const grpOpts  = [...new Map(rows.filter(r => r.grp && (!fDept || String(r.dep?.id) === fDept) && (!fSec || String(r.sec?.id) === fSec)).map(r => [r.grp.id, r.grp.name])).entries()];
  const costOpts = [...new Map(rows.filter(r => r.cost && (!fDept || String(r.dep?.id) === fDept) && (!fSec || String(r.sec?.id) === fSec) && (!fGrp || String(r.grp?.id) === fGrp)).map(r => [r.cost.id, r.cost.name])).entries()];

  const filteredRows = rows.filter(r =>
    (!fDept || String(r.dep?.id)  === fDept) &&
    (!fSec  || String(r.sec?.id)  === fSec)  &&
    (!fGrp  || String(r.grp?.id)  === fGrp)  &&
    (!fCost || String(r.cost?.id) === fCost)
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>🏢 {t('department')}</SectionTitle>
        <div className="flex gap-2">
          <button onClick={loadAll}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            🔄 {t('refresh')}
          </button>
          <button onClick={() => { resetCreate(); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#079DD9] hover:bg-[#0689be] text-white text-sm font-semibold transition-colors shadow-sm">
            ＋ Khởi tạo bộ phận
          </button>
        </div>
      </div>

      {/* ── Bảng ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">
            Danh sách bộ phận
            {!loading && <span className="ml-1.5 text-gray-400 font-normal">({departments.length})</span>}
          </span>
        </div>

        {/* ── Filter bar ─────────────────────────────────────── */}
        {!loading && departments.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2">
            <select value={fDept} onChange={e => { setFDept(e.target.value); setFSec(''); setFGrp(''); setFCost(''); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40">
              <option value="">🏢 Tất cả bộ phận</option>
              {deptOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={fSec} onChange={e => { setFSec(e.target.value); setFGrp(''); setFCost(''); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 disabled:opacity-40"
              disabled={secOpts.length === 0}>
              <option value="">📁 Tất cả section</option>
              {secOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={fGrp} onChange={e => { setFGrp(e.target.value); setFCost(''); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 disabled:opacity-40"
              disabled={grpOpts.length === 0}>
              <option value="">👥 Tất cả group</option>
              {grpOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={fCost} onChange={e => setFCost(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#079DD9]/40 disabled:opacity-40"
              disabled={costOpts.length === 0}>
              <option value="">💰 Tất cả cost center</option>
              {costOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            {(fDept || fSec || fGrp || fCost) && (
              <button onClick={() => { setFDept(''); setFSec(''); setFGrp(''); setFCost(''); }}
                className="px-3 py-2 rounded-lg text-xs text-red-500 border border-red-200 hover:bg-red-50 transition-colors">
                ✕ Xóa filter
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="py-12 text-center text-gray-400 text-sm">{t('inv_loading')}</div>
        )}
        {!loading && departments.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">{t('no_department_data')}</div>
        )}

        {!loading && departments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-300">
              <thead>
                <tr className="bg-[#079DD9] text-white text-xs">
                  <th className="border border-[#0589c2] px-4 py-3 text-left font-semibold w-10">#</th>
                  <th className="border border-[#0589c2] px-4 py-3 text-left font-semibold">Bộ phận</th>
                  <th className="border border-[#0589c2] px-4 py-3 text-left font-semibold">Section</th>
                  <th className="border border-[#0589c2] px-4 py-3 text-left font-semibold">Group</th>
                  <th className="border border-[#0589c2] px-4 py-3 text-left font-semibold">Cost Center</th>
                  <th className="border border-[#0589c2] px-4 py-3 text-left font-semibold w-28">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const isEven = row.deptIdx % 2 === 0;
                  const rowCls = isEven ? 'bg-white hover:bg-blue-50/40' : 'bg-gray-50 hover:bg-blue-50/40';
                  const td = 'border border-gray-300 px-4 py-2.5 align-middle text-left';

                  return (
                    <tr key={row.key} className={rowCls}>
                      <td className={`${td} text-gray-400 text-xs`}>{idx + 1}</td>
                      <td className={td}><span className="font-semibold text-gray-800">🏢 {row.dep.name}</span></td>
                      <td className={td}>
                        {row.sec ? <span className="text-blue-700 font-medium">📁 {row.sec.name}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className={td}>
                        {row.grp ? <span className="text-purple-700 font-medium">👥 {row.grp.name}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className={td}>
                        {row.cost ? <span className="text-amber-700 font-medium">💰 {row.cost.name}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openEdit(row)}
                            className="w-8 h-8 rounded-lg bg-amber-400 hover:bg-amber-500 text-white flex items-center justify-center text-sm transition-colors shadow-sm"
                            title="Chỉnh sửa">✏️</button>
                          <button onClick={() => deleteRow(row)}
                            className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-sm transition-colors shadow-sm"
                            title="Xóa dòng này">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ Modal: Khởi tạo ════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-800">🏢 Khởi tạo bộ phận</h3>
              <button onClick={() => { setShowCreate(false); resetCreate(); }} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {/* Bộ phận */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Bộ phận <span className="text-red-400">*</span></label>
                <select value={cDeptId} onChange={e => { setCDeptId(e.target.value); setCDeptName(''); }} className={selectCls}>
                  <option value="">-- Chọn bộ phận có sẵn --</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <div className="flex items-center gap-2"><div className="flex-1 h-px bg-gray-200"/><span className="text-xs text-gray-400 shrink-0">hoặc tạo mới</span><div className="flex-1 h-px bg-gray-200"/></div>
                <input value={cDeptName} onChange={e => { setCDeptName(e.target.value); if (e.target.value) setCDeptId(''); }} placeholder="Nhập tên bộ phận mới" className={inputCls} disabled={!!cDeptId} />
              </div>
              {/* Section */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Section <span className="text-gray-400 font-normal normal-case">(tuỳ chọn)</span></label>
                <select value={cSecId} onChange={e => { setCSecId(e.target.value); setCSecName(''); }} className={selectCls} disabled={!cDeptId && !cDeptName.trim()}>
                  <option value="">-- Chọn section có sẵn --</option>
                  {cModalSecs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input value={cSecName} onChange={e => { setCSecName(e.target.value); if (e.target.value) setCSecId(''); }} placeholder="Nhập tên section mới" className={inputCls} disabled={(!cDeptId && !cDeptName.trim()) || !!cSecId} />
              </div>
              {/* Group */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Group <span className="text-gray-400 font-normal normal-case">(tuỳ chọn)</span></label>
                <select value={cGrpId} onChange={e => { setCGrpId(e.target.value); setCGrpName(''); }} className={selectCls} disabled={!cSecId && !cSecName.trim()}>
                  <option value="">-- Chọn group có sẵn --</option>
                  {cModalGrps.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <input value={cGrpName} onChange={e => { setCGrpName(e.target.value); if (e.target.value) setCGrpId(''); }} placeholder="Nhập tên group mới" className={inputCls} disabled={(!cSecId && !cSecName.trim()) || !!cGrpId} />
              </div>
              {/* Cost Center */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost Center <span className="text-gray-400 font-normal normal-case">(tuỳ chọn)</span></label>
                <input value={cCostName} onChange={e => setCCostName(e.target.value)} placeholder="Nhập tên cost center" className={inputCls} />
              </div>
              {createErr && <p className="text-red-500 text-xs">⚠️ {createErr}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowCreate(false); resetCreate(); }} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Huỷ</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#079DD9] hover:bg-[#0689be] text-white text-sm font-semibold transition-colors shadow-sm">✅ Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Modal: Chỉnh sửa ═══════════════════════════════════ */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-800">✏️ Chỉnh sửa</h3>
              <button onClick={() => setShowEdit(false)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm">✕</button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">🏢 Bộ phận</label>
                <input value={editDeptName} onChange={e => setEditDeptName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  📁 Section {editIds.secId
                    ? <span className="text-red-400 font-normal normal-case text-xs">(xóa trắng để xóa)</span>
                    : <span className="text-gray-400 font-normal normal-case">(để trống nếu không cần)</span>}
                </label>
                <input value={editSecName} onChange={e => setEditSecName(e.target.value)}
                  placeholder={editIds.secId ? '' : 'Nhập tên section mới...'}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  👥 Group {editIds.grpId
                    ? <span className="text-red-400 font-normal normal-case text-xs">(xóa trắng để xóa group)</span>
                    : <span className="text-gray-400 font-normal normal-case">(để trống nếu không cần)</span>}
                </label>
                <input value={editGrpName} onChange={e => setEditGrpName(e.target.value)}
                  placeholder={editIds.grpId ? '' : 'Nhập tên group mới...'}
                  className={inputCls} />
              </div>
              {(editIds.secId || editSecName.trim() || editIds.deptId) && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    💰 Cost Center {editIds.costId
                      ? <span className="text-red-400 font-normal normal-case text-xs">(xóa trắng để xóa)</span>
                      : <span className="text-gray-400 font-normal normal-case">(để trống nếu không cần)</span>}
                  </label>
                  <input value={editCostName} onChange={e => setEditCostName(e.target.value)}
                    placeholder={editIds.costId ? '' : 'Nhập tên cost center mới...'}
                    className={inputCls} />
                </div>
              )}
              {editErr && <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">{editErr}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowEdit(false)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Huỷ</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#079DD9] hover:bg-[#0689be] text-white text-sm font-semibold transition-colors shadow-sm">💾 Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}