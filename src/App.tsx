import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import './features/pages.css';
import { useAuth } from './context/auth-context';
import { canCreate, isAdmin } from './lib/roles';
import { LoginScreen } from './components/LoginScreen';
import { Navbar } from './components/Navbar';
import { RequireRole } from './components/RequireRole';
import { RecordsPage } from './features/records/RecordsPage';
import { NewRecordPage } from './features/records/NewRecordPage';
import { ResolvedPage } from './features/resolved/ResolvedPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { AdminPage } from './features/admin/AdminPage';

function Shell() {
  return (
    <>
      <Navbar />
      <div className="wrap">
        <Outlet />
      </div>
    </>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LoginScreen />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/talepler" replace />} />
        <Route path="takvim" element={<CalendarPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="talepler" element={<RecordsPage />} />
        <Route path="cozulenler" element={<ResolvedPage />} />
        <Route element={<RequireRole allow={canCreate} />}>
          <Route path="yeni" element={<NewRecordPage />} />
        </Route>
        <Route element={<RequireRole allow={isAdmin} />}>
          <Route path="yonetim" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/talepler" replace />} />
      </Route>
    </Routes>
  );
}