import { useSyncExternalStore } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';

/** Açık kasa anahtarı sadece bellekte tutulur; sayfa yenilenince veya çıkışta silinir. */
let key: CryptoKey | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();

export const IDLE_MINUTES = 10;

function emit() {
  listeners.forEach((l) => l());
}

function arm() {
  window.clearTimeout(timer);
  timer = window.setTimeout(lockVault, IDLE_MINUTES * 60_000);
}

export function setVaultKey(k: CryptoKey) {
  key = k;
  arm();
  emit();
}

export function lockVault() {
  key = null;
  window.clearTimeout(timer);
  emit();
}

/** Kullanıcı etkinliğinde boşta kalma sayacını sıfırlar. */
export function touchVault() {
  if (key) arm();
}

export function useVaultKey(): CryptoKey | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => key,
  );
}

onAuthStateChanged(auth, (u) => {
  if (!u) lockVault();
});
