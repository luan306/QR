import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from 'react-router-dom';
import AdminMapTab from './AdminMapTab';

const Dashboard       = lazy(() => import('./AdminDashboard').then(m => ({ default: m.Dashboard })));
const Users           = lazy(() => import('./AdminUsers'));
const DeviceTypes     = lazy(() => import('./AdminDeviceTypes'));
const AuditTab        = lazy(() => import('./AdminAudit'));
const InventoryRounds = lazy(() => import('./InventoryRounds'));
const Departments     = lazy(() => import('./AdminDepartments'));

const TABS_CONFIG = [
  { id: 'dashboard',   labelKey: 'dashboard',        icon: '📊' },
  { id: 'rounds',      labelKey: 'inv_rounds_title', icon: '📋' },
  { id: 'management',  labelKey: 'management',       icon: '⚙️' },
  { id: 'audit',       labelKey: 'audit',            icon: '🔍' },
  { id: 'map',         labelKey: 'map',              icon: '🗺️' },
];

const MANAGEMENT_TABS = [
  { id: 'users',       labelKey: 'manage_users',  icon: '👤' },
  { id: 'deviceTypes', labelKey: 'device_types',  icon: '📦' },
  { id: 'departments', labelKey: 'department',    icon: '🏢' },
];

function PageLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-[#079DD9] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400">{t('inv_loading')}</span>
      </div>
    </div>
  );
}

export default function Admin() {
  const navigate           = useNavigate();
  const { t }              = useTranslation();
  const [tab, setTab]      = useState('dashboard');
  const [mgmtTab, setMgmtTab] = useState('users');
  const [user, setUser]    = useState(null);
  const [open, setOpen]    = useState(false);

  useEffect(() => {
    fetch('/api/current-user')
      .then(r => r.json())
      .then(d => {
        const u = d.user || d;
        if (!u?.id)             { navigate('/login', { replace: true }); return; }
        if (u.role !== 'admin') { alert(t('contact_it_support')); navigate('/scan', { replace: true }); return; }
        setUser(u);
      })
      .catch(() => navigate('/login', { replace: true }));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.replace('/login');
  };

  const selectTab = (id) => { setTab(id); setOpen(false); };

  if (!user) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-[#079DD9] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-400">{t('checking')}</span>
      </div>
    </div>
  );

  const SidebarContent = ({ onClose }) => (
    <>
      <div className="p-4 text-lg font-bold border-b border-[#0589c0] flex items-center justify-between flex-shrink-0">
        <span>🛠️ {t('admin_panel')}</span>
        {onClose && <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none md:hidden">✕</button>}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {TABS_CONFIG.map(item => (
          <div key={item.id}>
            <button
              onClick={() => selectTab(item.id)}
              className={'w-full text-left px-4 py-2.5 rounded-lg transition-colors text-sm ' +
                (tab === item.id ? 'bg-white/20 font-semibold' : 'hover:bg-white/10')}
            >
              {item.icon} <span className="ml-1">{t(item.labelKey)}</span>
            </button>

            {/* Sub-tabs Management — chỉ hiện khi tab đang chọn */}
            {item.id === 'management' && tab === 'management' && (
              <div className="ml-4 mt-1 space-y-0.5">
                {MANAGEMENT_TABS.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setMgmtTab(sub.id)}
                    className={'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ' +
                      (mgmtTab === sub.id
                        ? 'bg-white/30 font-semibold text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white')}
                  >
                    {sub.icon} <span className="ml-1">{t(sub.labelKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-[#0589c0] flex-shrink-0">
        <div className="text-xs text-[#a8dff5] mb-2">👤 {user.username}</div>
        <button
          onClick={handleLogout}
          className="w-full py-2 bg-[#F24444] hover:bg-[#d93a3a] rounded-lg text-sm text-white font-medium transition-colors"
        >
          🚪 {t('logout')}
        </button>
      </div>
    </>
  );

  const currentTabLabel = TABS_CONFIG.find(i => i.id === tab);

  // Label mobile top bar: nếu đang ở management thì hiện sub-tab
  const mobileLabel = tab === 'management'
    ? MANAGEMENT_TABS.find(s => s.id === mgmtTab)
    : currentTabLabel;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-[#079DD9] text-white flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={'fixed inset-y-0 left-0 z-50 w-64 bg-[#079DD9] text-white flex flex-col shadow-2xl transform transition-transform duration-300 md:hidden ' + (open ? 'translate-x-0' : '-translate-x-full')}>
        <SidebarContent onClose={() => setOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden bg-[#079DD9] text-white flex items-center justify-between px-4 py-3 shadow flex-shrink-0">
          <button onClick={() => setOpen(true)} className="text-2xl leading-none w-8">☰</button>
          <span className="font-bold text-sm">{mobileLabel?.icon} {t(mobileLabel?.labelKey ?? '')}</span>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Suspense fallback={<PageLoader />}>
            {tab === 'dashboard'  && <Dashboard />}
            {tab === 'rounds'     && <InventoryRounds />}
            {tab === 'audit'      && <AuditTab />}
            {tab === 'map'        && <AdminMapTab />}

            {/* Management — hiện sub-tab tương ứng */}
            {tab === 'management' && (
              <>
                {/* Tab bar ngang cho desktop */}
                <div className="hidden md:flex gap-1 mb-6 bg-white rounded-2xl p-1 shadow-sm border border-gray-100 w-fit">
                  {MANAGEMENT_TABS.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setMgmtTab(sub.id)}
                      className={'px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ' +
                        (mgmtTab === sub.id
                          ? 'bg-[#079DD9] text-white shadow'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}
                    >
                      {sub.icon} <span className="ml-1">{t(sub.labelKey)}</span>
                    </button>
                  ))}
                </div>

                {mgmtTab === 'users'       && <Users />}
                {mgmtTab === 'deviceTypes' && <DeviceTypes />}
                {mgmtTab === 'departments' && <Departments />}
              </>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}