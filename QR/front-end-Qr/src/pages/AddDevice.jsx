import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTranslation } from "react-i18next";
import { useActiveRound } from '../hooks/useActiveRound';
import RoundStatusBanner from '../components/RoundStatusBanner';

const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.result)) return data.result;
  return [];
};

export default function AddDevice() {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const navigate        = useNavigate();
  const location        = useLocation();
  const { activeRound, roundStatus } = useActiveRound();

  // Chặn khi không có đợt active
  const roundBlocked = roundStatus === 'none' || roundStatus === 'ended';

  const [deviceTypes, setDeviceTypes] = useState([]);

  const [form, setForm] = useState({
    qr_code:        location.state?.qr || '',
    name:           '',
    device_type_id: '',
    location:       '',
  });

  useEffect(() => {
    fetch('/api/device-types')
      .then((r) => r.json())
      .then((d) => setDeviceTypes(toArray(d)))
      .catch(() => setDeviceTypes([]));
  }, []);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (roundBlocked) return; // guard phòng thủ
    try {
      const payload = {
        ...form,
        department_id:  currentUser?.department_id  || null,
        section_id:     currentUser?.section_id     || null,
        group_id:       currentUser?.group_id       || null,
        cost_center_id: currentUser?.cost_center_id || null,
        added_by:       currentUser?.id             || null,
      };

      const res  = await fetch('/api/devices', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.success) {
        alert('✅ ' + t("device_added_successfully"));
        navigate('/inventory', { state: { reload: true } });
      } else {
        alert('❌ ' + t("device_add_error") + ': ' + (data?.message || 'Unknown'));
      }
    } catch {
      alert('❌ ' + t("server_error"));
    }
  };

  const locationInfo = [
    currentUser?.department_name,
    currentUser?.section_name,
    currentUser?.group_name,
    currentUser?.cost_center_name,
  ].filter(Boolean).join(' › ');

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <Header currentUser={currentUser} />

      <main className="flex-1 p-4 pb-20 overflow-auto">
        <h2 className="text-xl font-bold mb-4 text-indigo-600">➕ {t("add_new_device")}</h2>

        {/* Banner trạng thái đợt kiểm kê */}
        <RoundStatusBanner roundStatus={roundStatus} />

        {/* Thông tin vị trí tự động */}
        {locationInfo && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700">
            📍 {t("location_auto")}: <span className="font-semibold">{locationInfo}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="qr_code"
            type="text"
            placeholder={t("qr_code")}
            required
            value={form.qr_code}
            onChange={handleChange}
            disabled={roundBlocked}
            className={`w-full p-3 rounded-xl border shadow transition-opacity ${roundBlocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
          />
          <input
            name="name"
            type="text"
            placeholder={t("device_name")}
            required
            value={form.name}
            onChange={handleChange}
            disabled={roundBlocked}
            className={`w-full p-3 rounded-xl border shadow transition-opacity ${roundBlocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
          />

          <select
            name="device_type_id"
            required
            value={form.device_type_id}
            onChange={handleChange}
            disabled={roundBlocked}
            className={`w-full p-3 rounded-xl border shadow transition-opacity ${roundBlocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
          >
            <option value="">-- {t("select_device_type")} --</option>
            {deviceTypes.map((dtype) => (
              <option key={dtype.id} value={dtype.id}>{dtype.name}</option>
            ))}
          </select>

          <input
            name="location"
            type="text"
            placeholder={t("location")}
            value={form.location}
            onChange={handleChange}
            disabled={roundBlocked}
            className={`w-full p-3 rounded-xl border shadow transition-opacity ${roundBlocked ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
          />

          <div className="flex space-x-2">
            <button
              type="submit"
              disabled={roundBlocked}
              title={roundBlocked ? 'Không thể thêm thiết bị ngoài đợt kiểm kê' : ''}
              className={`flex-1 p-3 rounded-xl shadow text-white font-semibold transition-all
                ${roundBlocked
                  ? 'bg-gray-400 cursor-not-allowed opacity-60'
                  : 'bg-green-500 hover:bg-green-600'}`}
            >
              {t("save_device")}
            </button>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="flex-1 bg-gray-200 text-gray-700 p-3 rounded-xl shadow hover:bg-gray-300"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      </main>

      <BottomNav currentUser={currentUser} />
    </div>
  );
}