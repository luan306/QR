import { useLocation, useNavigate } from 'react-router-dom';

export default function BottomNav({ currentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const role = currentUser?.role;
  const showAudit = role === 'admin' || role === 'auditor';

  const tabs = [
    { path: '/scan',      label: 'Quét QR',  icon: 'ri-qr-code-line' },
    { path: '/inventory', label: 'Kiểm kê',  icon: 'ri-file-list-3-line' },
    { path: '/add',       label: 'Thêm',     icon: 'ri-add-circle-line' },
    ...(showAudit
      ? [{ path: '/audit', label: 'Audit', icon: 'ri-survey-line' }]
      : []),
  ];

  return (
    <nav className="bg-white shadow-inner border-t flex justify-around py-2 fixed bottom-0 left-0 right-0">
      {tabs.map((t) => (
        <button
          key={t.path}
          onClick={() => navigate(t.path)}
          className={`flex flex-col items-center ${
            location.pathname === t.path ? 'text-indigo-600' : 'text-gray-500'
          }`}
        >
          <i className={`${t.icon} text-2xl`}></i>
          <span className="text-sm">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}