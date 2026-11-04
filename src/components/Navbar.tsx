import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/auth-context';
import { canCreate, isAdmin } from '../lib/roles';
import type { Role } from '../lib/roles';
import { ThemeButton } from './ThemeButton';

interface Item {
  to: string;
  label: string;
  visible: (role: Role) => boolean;
}

const ITEMS: Item[] = [
  { to: '/takvim', label: 'Dağıtım Takvimi', visible: () => true },
  { to: '/dashboard', label: 'Dashboard', visible: () => true },
  { to: '/talepler', label: 'Talepler', visible: () => true },
  { to: '/cozulenler', label: 'Çözülen Talepler', visible: () => true },
  { to: '/yeni', label: 'Yeni Talep', visible: canCreate },
  { to: '/yonetim', label: 'Yönetim', visible: isAdmin },
];

export function Navbar() {
  const { role } = useAuth();

  return (
    <nav>
      <div className="nav-brand">
        <div className="nav-logo">T</div>
        Talep&nbsp;Notları
      </div>
      {ITEMS.filter((i) => i.visible(role)).map((i) => (
        <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          {i.label}
        </NavLink>
      ))}
      <ThemeButton className="theme-btn" />
      <button type="button" className="logout-btn" onClick={() => signOut(auth)}>
        Çıkış
      </button>
    </nav>
  );
}
