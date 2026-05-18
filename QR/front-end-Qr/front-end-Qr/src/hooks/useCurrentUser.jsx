import { useState, useEffect, useContext } from 'react';
import { UserContext } from '../routes/AppRoutes';
import api from '../utils/api';

export function useCurrentUser() {
  const ctxUser = useContext(UserContext);

  const [currentUser, setCurrentUser] = useState(ctxUser);
  const [loading, setLoading] = useState(!ctxUser);

  useEffect(() => {
    if (ctxUser) {
      setCurrentUser(ctxUser);
      setLoading(false);
      return;
    }
    api.get('/api/current-user')
      .then((r) => r?.json())
      .then((data) => {
        if (!data) return;
        const user = data.user || data;
        if (!user?.id) { window.location.href = '/login'; return; }
        setCurrentUser(user);
      })
      .catch(() => {
        window.location.href = '/login';
      })
      .finally(() => setLoading(false));
  }, [ctxUser]);

  return { currentUser, loading, setCurrentUser };
}