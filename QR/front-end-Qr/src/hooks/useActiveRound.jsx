import { useState, useEffect } from 'react';

export function useActiveRound() {
  const [activeRound, setActiveRound] = useState(null);
  const [roundStatus, setRoundStatus] = useState('loading');

  useEffect(() => {
    // Backend không hỗ trợ filter query param — lấy tất cả rồi tự tìm
    fetch('/api/inventory-rounds')
      .then(r => r.json())
      .then(data => {
        const rounds = Array.isArray(data) ? data : (data?.data ?? data?.result ?? []);
        const active = rounds.find(r => r.status === 'active');
        if (active) {
          setActiveRound(active);
          setRoundStatus('active');
        } else if (rounds.some(r => r.status === 'completed' || r.status === 'closed')) {
          setRoundStatus('ended');
        } else if (rounds.length === 0) {
          setRoundStatus('none');
        } else {
          // Có round nhưng đang draft/paused
          setRoundStatus('none');
        }
      })
      .catch(() => setRoundStatus('none'));
  }, []);

  return { activeRound, roundStatus };
}