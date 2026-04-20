import { useState, useCallback } from 'react';

export function useAssets(currentUser) {
  const [assets, setAssets] = useState([]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices');
      if (!res.ok) throw new Error('no devices');
      const data = await res.json();
      let mapped = data.map((d) => ({
        id: d.id,
        name: d.name,
        qr: d.qr_code,
        device_type: d.device_type_name || '-',
        dept: d.department_name || d.department || 'Chưa rõ',
        department_id: d.department_id || d.department?.id || null,
        note: d.location || '',
        scanned: d.status === 'Đã quét' || d.status === 'scanned',
      }));
      if (currentUser?.role && currentUser.role !== 'admin') {
        mapped = mapped.filter((a) => a.department_id === currentUser.department_id);
      }
      setAssets(mapped);
    } catch {
      setAssets([]);
    }
  }, [currentUser]);

  const addAsset = (asset) => setAssets((prev) => [...prev, asset]);

  const markScanned = (qr) => {
    setAssets((prev) =>
      prev.map((a) => (a.qr === qr ? { ...a, scanned: true } : a))
    );
  };

  return { assets, loadDevices, addAsset, markScanned };
}