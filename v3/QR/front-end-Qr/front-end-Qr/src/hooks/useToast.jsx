import { useState, useCallback } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ visible: false, message: '', color: '#16a34a' });

  const showSuccess = useCallback((message = '✅ Quét thành công!') => {
    try {
      const b = document.getElementById('beep-sound');
      b.currentTime = 0;
      b.play().catch(() => {});
    } catch {}
    setToast({ visible: true, message, color: '#16a34a' });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 1200);
  }, []);

  const showError = useCallback((message = '⚠️ Lỗi') => {
    try {
      const b = document.getElementById('beep-sound');
      b.currentTime = 0;
      b.play().catch(() => {});
    } catch {}
    setToast({ visible: true, message, color: '#dc2626' });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 1500);
  }, []);

  return { toast, showSuccess, showError };
}