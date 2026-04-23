import { useState, useEffect } from 'react';

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    fetch('/api/current-user')
      .then((r) => {
        if (!r.ok) throw new Error('not authenticated');
        return r.json();
      })
      .then((data) => {
        const user = data.user || data;
        if (!user?.id) {
          window.location.href = '/login';
          return;
        }
        setCurrentUser(user);
      })
      .catch(() => {
        // Không có session hợp lệ → về login
        window.location.href = '/login';
      })
      .finally(() => setLoading(false));
  }, []);

  return { currentUser, loading, setCurrentUser };
}