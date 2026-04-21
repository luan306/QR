import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  // Nếu đã có session → vào thẳng /scan, không cho vào trang login nữa
  useEffect(() => {
    fetch('/api/current-user')
      .then((r) => {
        if (!r.ok) throw new Error('not logged in');
        return r.json();
      })
      .then((data) => {
        const user = data.user || data;
        if (user?.id) navigate('/scan', { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-600 to-purple-600">
        <div className="text-white text-sm animate-pulse">Đang kiểm tra...</div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data?.success) {
        navigate('/scan', { replace: true });
      } else {
        setError(data?.message || 'Đăng nhập thất bại');
      }
    } catch {
      setError('Lỗi kết nối server');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img
            src="./src/assets/1041882.png"
            className="w-32 h-32 object-contain rounded-2xl shadow-lg"
            alt="logo"
          />
          <h1 className="text-2xl font-bold text-indigo-700">ScanPro</h1>
          <p className="text-sm text-gray-500">Quản lý &amp; kiểm kê tài sản</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Tên đăng nhập"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full p-3 rounded-xl border shadow focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full p-3 rounded-xl border shadow focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white p-3 rounded-xl shadow hover:bg-indigo-700 font-semibold"
          >
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}