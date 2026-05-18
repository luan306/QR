import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import { usePager, Pagination, Card, SectionTitle, Btn } from './adminUtils.jsx';

const API            = '/api';
const toArray        = (d) => (Array.isArray(d) ? d : d?.data ?? d?.result ?? []);
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_ALL     = 9999;

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


export default DeviceTypes;