import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import type { Role } from '../lib/roles';

interface Props {
  allow: (role: Role) => boolean;
}

export function RequireRole({ allow }: Props) {
  const { role } = useAuth();
  return allow(role) ? <Outlet /> : <Navigate to="/talepler" replace />;
}