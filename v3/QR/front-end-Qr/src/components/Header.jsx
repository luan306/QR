export default function Header({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';

  const handleLogout = async () => {
    try {
      await fetch('/logout', { method: 'GET' });
    } catch {}
    // Xóa session storage audit nếu có
    try { sessionStorage.removeItem('audit_session_state'); } catch {}
    window.location.replace('/login');
  };

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <img
          src="https://cdn-icons-png.flaticon.com/512/1041/1041882.png"
          className="w-8 h-8"
          alt="logo"
        />
        <div>
          <div className="font-bold text-lg">Asset Manager</div>
          <div className="text-xs opacity-80">Quản lý &amp; kiểm kê tài sản</div>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className="text-sm">
          👋 Xin chào{currentUser?.username ? `, ${currentUser.username}` : ''}
        </div>
        {isAdmin && (
          <button
            onClick={() => (window.location.href = '/admin')}
            className="bg-yellow-400 text-gray-800 px-3 py-1 rounded-lg text-sm"
          >
            Trang Admin
          </button>
        )}
        <button
          onClick={handleLogout}
          className="bg-red-500 px-3 py-1 rounded-lg shadow hover:bg-red-600 text-sm"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}