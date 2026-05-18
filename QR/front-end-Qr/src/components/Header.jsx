import { useTranslation } from "react-i18next";
export default function Header({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const { t, i18n } = useTranslation();
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {}
    // Xóa session storage audit nếu có
    try { sessionStorage.removeItem('audit_session_state'); } catch {}
    window.location.replace('/login');
  };

  return (
    <header className="bg-[#079DD9] text-white p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <img
          src="./src/assets/1041882.png"
          className="w-8 h-8"
          alt="logo"
        />
        <div>
          <div className="font-bold text-lg">SMC - IT Equipment Inventory</div>
          <div className="text-xs opacity-80">{t("app_description")}</div>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className="text-sm">
          👋 {t("hello")}
          {currentUser?.username ? `, ${currentUser.username}` : ''}
        </div>

        {isAdmin && (
          <button
            onClick={() => (window.location.href = '/admin')}
            className="bg-yellow-400 text-gray-800 px-3 py-1 rounded-lg text-sm"
          >
            {t("admin_page")}
          </button>
        )}

        <button
          onClick={handleLogout}
          className="bg-[#F24444] hover:bg-[#d93a3a] px-3 py-1 rounded-lg shadow text-sm text-white font-medium transition-colors"
        >
          {t("logout")}
        </button>
      </div>
    </header>
  );
}