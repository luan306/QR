import { useState, useEffect, useContext } from 'react';
import { UserContext } from '../routes/AppRoutes';

export function useCurrentUser() {
  // Nếu đang ở trong PrivateLayout (đã có context), dùng luôn
  const ctxUser = useContext(UserContext);

  const [currentUser, setCurrentUser] = useState(ctxUser);
  const [loading, setLoading] = useState(!ctxUser);

  useEffect(() => {
    if (ctxUser) {
      setCurrentUser(ctxUser);
      setLoading(false);
      return;
    }
    fetch('/api/current-user')
      .then((r) => r.json())
      .then((data) => {
        const user = data.user || data;
        if (!user?.id) { window.location.href = '/login'; return; }
        setCurrentUser(user);
      })
      .catch(() => {
        setCurrentUser({ id: 1, full_name: 'IT', role: 'admin' });
      })
      .finally(() => setLoading(false));
  }, [ctxUser]);

  return { currentUser, loading, setCurrentUser };
}