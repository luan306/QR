import { useNavigate } from 'react-router-dom';
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow p-10 flex flex-col items-center max-w-sm w-full text-center">
        <div className="text-8xl font-bold text-indigo-200 mb-2">404</div>

        <div className="text-xl font-semibold text-gray-700 mb-1">
          {t("page_not_found")}
        </div>

        <div className="text-sm text-gray-400 mb-8">
          {t("contact_it_support")}
        </div>

        <button
          onClick={() => navigate('/scan')}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition"
        >
          ← {t("back_home")}
        </button>
      </div>
    </div>
  );
}