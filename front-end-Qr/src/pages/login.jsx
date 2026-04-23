import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from "react-i18next";

export default function Login() {
  const { t, i18n } = useTranslation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

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
        <div className="text-white text-sm animate-pulse">
          {t("checking")}
        </div>
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
        setError(data?.message || t("login_error"));
      }
    } catch {
      setError(t("server_error"));
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
          <p className="text-sm text-gray-500">
            {t("app_description")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder={t("username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full p-3 rounded-xl border shadow focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="password"
            placeholder={t("password")}
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
            {t("login")}
          </button>
        </form>

        {/* chọn ngôn ngữ */}
        <div className="mt-4 flex justify-center bg-gray-100 rounded-full p-1 text-sm">
          {["vi", "en", "ja"].map((lng) => (
            <button
              key={lng}
              onClick={() => i18n.changeLanguage(lng)}
              className={`px-3 py-1 rounded-full transition ${
                i18n.language === lng
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600"
              }`}
            >
              {lng === "vi" && "🇻🇳"}
              {lng === "en" && "🇺🇸"}
              {lng === "ja" && "🇯🇵"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}