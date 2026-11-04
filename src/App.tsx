import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/auth-context';
import { canCreate, isAdmin } from './lib/roles';
import { LoginScreen } from './components/LoginScreen';
import { Navbar } from './components/Navbar';
import { PlaceholderPage } from './components/PlaceholderPage';
import { RequireRole } from './components/RequireRole';
import { RecordsPage } from './features/records/RecordsPage';

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
        <Route path="takvim" element={<PlaceholderPage title="Talep" accent="Dağıtım Takvimi" description="Personel görev planlaması ve aylık dağıtım görünümü" />} />
        <Route path="dashboard" element={<PlaceholderPage title="Genel" accent="Bakış" description="Anlık istatistikler ve departman dağılımı" />} />
        <Route path="talepler" element={<RecordsPage />} />
        <Route path="cozulenler" element={<PlaceholderPage title="Çözülen" accent="Talepler" description="Çözdüğünüz talepleri buradan kayıt altına alın" />} />
        <Route element={<RequireRole allow={canCreate} />}>
          <Route path="yeni" element={<PlaceholderPage title="Yeni" accent="Kayıt" description="Yeni talep oluştur" />} />
        </Route>
        <Route element={<RequireRole allow={isAdmin} />}>
          <Route path="yonetim" element={<PlaceholderPage title="Sistem" accent="Yönetimi" description="Departman · Kullanıcı · Yetki · Dağıtım Takvimi" />} />
        </Route>
        <Route path="*" element={<Navigate to="/talepler" replace />} />
      </Route>
    </Routes>
  );
}
