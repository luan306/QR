import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";

export default function BottomNav({ currentUser }) {
  const { t } = useTranslation();
  const location  = useLocation();
  const navigate  = useNavigate();
  const role       = currentUser?.role;
  const showAudit  = role === 'admin' || role === 'auditor';
  const [hasMap,   setHasMap] = useState(false);

  useEffect(() => {
    fetch('/api/layouts/has-enabled')
      .then(r => r.json())
      .then(d => setHasMap(d.has_enabled || false))
      .catch(() => setHasMap(false));
  }, [location.pathname]); // re-check khi navigate

  const tabs = [
      { path: '/scan',      label: t("scan"),      icon: 'ri-qr-code-line' },
      { path: '/inventory', label: t("inventory"), icon: 'ri-file-list-3-line' },
      ...(hasMap ? [{ path: '/map', label: t("map"), icon: 'ri-map-2-line' }] : []),
      { path: '/add',       label: t("add"),       icon: 'ri-add-circle-line' },
      ...(showAudit ? [{ path: '/audit', label: t("audit"), icon: 'ri-survey-line' }] : []),
    ];

  return (
    <nav className="bg-white shadow-inner border-t flex justify-around py-2 fixed bottom-0 left-0 right-0 z-40">
      {tabs.map((t) => (
        <button key={t.path} onClick={() => navigate(t.path)}
          className={`flex flex-col items-center px-2 transition-colors ${location.pathname === t.path ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <i className={`${t.icon} text-2xl`} />
          <span className="text-xs mt-0.5">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}