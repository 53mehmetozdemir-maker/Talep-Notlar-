import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import type { Role } from '../lib/roles';

export interface AuthState {
  user: User | null;
  role: Role;
  loading: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}