import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useCurrentUser } from '../hooks/useCurrentUser';

const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.result)) return data.result;
  return [];
};

export default function AddDevice() {
  const { currentUser } = useCurrentUser();
  const navigate        = useNavigate();
  const location        = useLocation();

  const [departments, setDepartments] = useState([]);
  const [deviceTypes, setDeviceTypes] = useState([]);

  const [form, setForm] = useState({
    qr_code:        location.state?.qr || '',
    name:           '',
    device_type_id: '',
    department_id:  '',
    location:       '',
  });

  useEffect(() => {
    fetch('/api/departments')
      .then((r) => r.json())
      .then((d) => setDepartments(toArray(d)))
      .catch(() => setDepartments([]));

    fetch('/api/device-types')
      .then((r) => r.json())
      .then((d) => setDeviceTypes(toArray(d)))
      .catch(() => setDeviceTypes([]));
  }, []);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res  = await fetch('/api/devices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (data?.success) {
        alert('✅ Đã thêm thiết bị!');
        navigate('/inventory');
      } else {
        alert('❌ Lỗi thêm: ' + (data?.message || 'Unknown'));
      }
    } catch {
      alert('❌ Lỗi server khi thêm thiết bị');
    }
  };

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />

      <main className="flex-1 p-4 pb-20 overflow-auto">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">➕ Thêm thiết bị mới</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="qr_code"
            type="text"
            placeholder="Mã QR"
            required
            value={form.qr_code}
            onChange={handleChange}
            className="w-full p-3 rounded-xl border shadow"
          />
          <input
            name="name"
            type="text"
            placeholder="Tên thiết bị"
            required
            value={form.name}
            onChange={handleChange}
            className="w-full p-3 rounded-xl border shadow"
          />

          <select
            name="device_type_id"
            required
            value={form.device_type_id}
            onChange={handleChange}
            className="w-full p-3 rounded-xl border shadow"
          >
            <option value="">-- Chọn loại thiết bị --</option>
            {deviceTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <select
            name="department_id"
            required
            value={form.department_id}
            onChange={handleChange}
            className="w-full p-3 rounded-xl border shadow"
          >
            <option value="">-- Chọn bộ phận --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <input
            name="location"
            type="text"
            placeholder="Vị trí / Ghi chú"
            value={form.location}
            onChange={handleChange}
            className="w-full p-3 rounded-xl border shadow"
          />

          <div className="flex space-x-2">
            <button
              type="submit"
              className="flex-1 bg-green-500 text-white p-3 rounded-xl shadow hover:bg-green-600"
            >
              Lưu thiết bị
            </button>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="flex-1 bg-gray-200 text-gray-700 p-3 rounded-xl shadow hover:bg-gray-300"
            >
              Hủy
            </button>
          </div>
        </form>
      </main>

      <BottomNav currentUser={currentUser} />
    </div>
  );
}