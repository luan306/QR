import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import Login     from '../pages/login';
import Scan      from '../pages/Scan';
import Inventory from '../pages/Inventory';
import AddDevice from '../pages/AddDevice';
import Audit     from '../pages/Audit';
import MapPage   from '../pages/MapPage';
import NotFound  from '../pages/NotFound';
import Admin     from '../pages/Admin';
import { AuditProvider } from '../context/AuditContext';

export const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

function useAuth() {
  const [state, setState] = useState({ user: null, status: 'loading' });
  useEffect(() => {
    fetch('/api/current-user')
      .then((r) => { if (!r.ok) throw new Error('unauthorized'); return r.json(); })
      .then((data) => {
        const user = data.user || data;
        if (!user?.id) throw new Error('no user');
        setState({ user, status: 'ok' });
      })
      .catch(() => setState({ user: null, status: 'fail' }));
  }, []);
  return state;
}

function RoleRoute({ element, roles }) {
  const user = useContext(UserContext);
  if (roles && !roles.includes(user?.role)) return <Navigate to="/scan" replace />;
  return element;
}

function PrivateRoutes() {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-gray-500 text-sm animate-pulse">Đang xác thực...</div>
      </div>
    );
  }

  if (status === 'fail' || !user) return <Navigate to="/login" replace />;

  return (
    <UserContext.Provider value={user}>
      <AuditProvider>
        <Routes>
          <Route path="/scan"      element={<Scan />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/map"       element={<MapPage />} />
          <Route path="/add"       element={<AddDevice />} />
          <Route path="/audit"     element={<RoleRoute roles={['admin', 'auditor']} element={<Audit />} />} />
          <Route path="/admin"     element={<RoleRoute roles={['admin']} element={<Admin />} />} />
          <Route path="*"          element={<NotFound />} />
        </Routes>
      </AuditProvider>
    </UserContext.Provider>
  );
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*"     element={<PrivateRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}