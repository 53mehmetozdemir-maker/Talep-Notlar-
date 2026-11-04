import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { parseRole } from '../lib/roles';
import { AuthContext } from './auth-context';
import type { AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: 'gözlemci',
    loading: true,
  });

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (active) setState({ user: null, role: 'gözlemci', loading: false });
        return;
      }
      let role = parseRole(undefined);
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) role = parseRole(snap.data().role);
      } catch (err) {
        console.error('Rol okunamadı, gözlemci olarak devam ediliyor:', err);
      }
      if (active) setState({ user, role, loading: false });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}