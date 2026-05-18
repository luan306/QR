import { useTranslation } from 'react-i18next';

export default function RoundStatusBanner({ roundStatus, activeRound, compact = false }) {
  const { t } = useTranslation();

  if (!roundStatus || roundStatus === 'loading' || roundStatus === 'active') return null;

  if (compact) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium mb-4 bg-amber-50 border-amber-300 text-amber-800">
        <span>⏳</span>
        <span>{t('inv_round_status_none_title')} — {t('inv_round_status_none_desc')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 px-4 py-6 rounded-2xl border mb-4 bg-amber-50 border-amber-300">
      <span className="text-3xl">⏳</span>
      <p className="font-semibold text-sm text-amber-800">{t('inv_round_status_none_title')}</p>
      <p className="text-xs text-amber-800 opacity-80">{t('inv_round_status_none_desc')}</p>
    </div>
  );
}