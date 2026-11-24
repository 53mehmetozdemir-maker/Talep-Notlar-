import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { generateDek, makeCheck, openNote, sealNote, wrapDekForUser } from './crypto';
import type { ImportedNote, NotePayload, Sealed, UserKeyRecord, VaultMeta } from './crypto';

/*
 * Firestore yapısı (sunucuda hiçbir düz metin yok):
 *   kasaMeta/config  -> { check, keysVersion: 2 }            (yönetici yazar)
 *   kasa/{id}        -> { iv, ct, by, updatedAt }            (not, veri anahtarıyla şifreli)
 *   kasaUsers/{uid}  -> UserKeyRecord                        (kullanıcı kendi belgesini yazar)
 *   kasaKeys/{uid}   -> { wrapped, by, updatedAt }           (veri anahtarı, kullanıcının açık anahtarıyla sarılı; yönetici yazar)
 */
const META_REF = () => doc(db, 'kasaMeta', 'config');
const MAX_CONTENT = 700_000;
const BATCH_LIMIT = 450;

export interface RawNote extends Sealed {
  id: string;
}

export interface AccessUser {
  uid: string;
  email: string;
  publicKey: string;
  approved: boolean;
}

function who(): string {
  return auth.currentUser?.email ?? '';
}

/* ---------- Giriş şifresi doğrulama ---------- */

/** Girilen şifrenin gerçekten bu hesabın giriş şifresi olduğunu Firebase ile doğrular. */
export async function verifyLoginPassword(password: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user?.email) return false;
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return true;
  } catch {
    return false;
  }
}

/* ---------- Durum ---------- */

export interface VaultStatus {
  meta: VaultMeta | null;
  userRec: UserKeyRecord | null;
  wrappedDek: string | null;
}

export async function loadStatus(uid: string): Promise<VaultStatus> {
  const [m, u, k] = await Promise.all([
    getDoc(META_REF()),
    getDoc(doc(db, 'kasaUsers', uid)),
    getDoc(doc(db, 'kasaKeys', uid)),
  ]);
  return {
    meta: m.exists() ? (m.data() as VaultMeta) : null,
    userRec: u.exists() ? (u.data() as UserKeyRecord) : null,
    wrappedDek: k.exists() ? String(k.data().wrapped) : null,
  };
}

export async function saveUserRecord(uid: string, rec: UserKeyRecord): Promise<void> {
  await setDoc(doc(db, 'kasaUsers', uid), { ...rec, updatedAt: serverTimestamp() });
}

/** Kullanıcı kendi (eski/bozuk) anahtar kaydını siler; yeniden onay gerekir. */
export async function deleteMyKeyRecord(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'kasaKeys', uid));
}

export async function writeKeyRecord(uid: string, wrapped: string): Promise<void> {
  await setDoc(doc(db, 'kasaKeys', uid), { wrapped, by: who(), updatedAt: serverTimestamp() });
}

/** Yönetici: kullanıcı listesi ve onay durumları (gerçek zamanlı). */
export function watchAccess(onData: (users: AccessUser[]) => void, onError: (e: Error) => void): () => void {
  let users: Omit<AccessUser, 'approved'>[] = [];
  let keyed = new Set<string>();
  const push = () => onData(users.map((u) => ({ ...u, approved: keyed.has(u.uid) })));
  const a = onSnapshot(
    collection(db, 'kasaUsers'),
    (snap) => {
      users = snap.docs.map((d) => ({ uid: d.id, email: String(d.data().email ?? ''), publicKey: String(d.data().publicKey ?? '') }));
      push();
    },
    onError,
  );
  const b = onSnapshot(
    collection(db, 'kasaKeys'),
    (snap) => {
      keyed = new Set(snap.docs.map((d) => d.id));
      push();
    },
    onError,
  );
  return () => {
    a();
    b();
  };
}

/* ---------- Notlar ---------- */

export function watchNotes(onData: (notes: RawNote[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, 'kasa'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, iv: String(d.data().iv), ct: String(d.data().ct) }))),
    (err) => onError(err),
  );
}

/** Tek seferlik okuma (eski sistemden geçişte kullanılır). */
export async function loadRawNotes(): Promise<RawNote[]> {
  const snap = await getDocs(collection(db, 'kasa'));
  return snap.docs.map((d) => ({ id: d.id, iv: String(d.data().iv), ct: String(d.data().ct) }));
}

function stored(sealed: Sealed) {
  return { ...sealed, by: who(), updatedAt: serverTimestamp() };
}

export function newNoteId(): string {
  return doc(collection(db, 'kasa')).id;
}

export async function saveNote(key: CryptoKey, id: string, payload: NotePayload): Promise<void> {
  if (payload.content.length > MAX_CONTENT) throw new Error('Not çok uzun (en fazla yaklaşık 700.000 karakter).');
  await setDoc(doc(db, 'kasa', id), stored(await sealNote(key, id, payload)));
}

export async function removeNote(id: string): Promise<void> {
  await deleteDoc(doc(db, 'kasa', id));
}

/** İçe aktarılan notları 450'şerli gruplar halinde yazar. */
export async function importNotes(key: CryptoKey, notes: ImportedNote[]): Promise<void> {
  for (let i = 0; i < notes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const n of notes.slice(i, i + BATCH_LIMIT)) {
      if (n.content.length > MAX_CONTENT) throw new Error(`"${n.title}" notu çok uzun.`);
      const id = newNoteId();
      const sealed = await sealNote(key, id, { ...n, pinned: false });
      batch.set(doc(db, 'kasa', id), stored(sealed));
    }
    await batch.commit();
  }
}

/* ---------- Anahtar yenileme (kurulum, eski sistemden geçiş, erişim kaldırma) ---------- */

export interface Recipient {
  uid: string;
  publicKey: string;
}

/**
 * Yeni rastgele veri anahtarı üretir; tüm notları ona göre yeniden şifreler,
 * anahtarı alıcılara sarar, istenen kullanıcıların anahtar kaydını siler ve
 * hepsini TEK işlemde (atomik) yazar. Herhangi bir not açılamazsa hiçbir şey yazılmaz.
 */
export async function rotateVault(
  oldKey: CryptoKey | null,
  raw: RawNote[],
  recipients: Recipient[],
  removeUids: string[],
): Promise<CryptoKey> {
  if (raw.length + recipients.length + removeUids.length + 1 > 500) {
    throw new Error('Not sayısı çok fazla, anahtar yenileme tek işlemde yapılamıyor.');
  }
  if (raw.length > 0 && !oldKey) throw new Error('Mevcut anahtar yok.');

  const newKey = await generateDek();
  const batch = writeBatch(db);

  for (const r of raw) {
    let payload: NotePayload;
    try {
      payload = await openNote(oldKey as CryptoKey, r.id, r);
    } catch {
      throw new Error('Bazı notlar açılamadığı için işlem iptal edildi. Hiçbir veri değiştirilmedi.');
    }
    batch.set(doc(db, 'kasa', r.id), stored(await sealNote(newKey, r.id, payload)));
  }
  // set (merge değil): eski ortak-şifre alanları (salt, iterations) böylece silinir
  batch.set(META_REF(), { check: await makeCheck(newKey), keysVersion: 2 });
  for (const rc of recipients) {
    batch.set(doc(db, 'kasaKeys', rc.uid), { wrapped: await wrapDekForUser(newKey, rc.publicKey), by: who(), updatedAt: serverTimestamp() });
  }
  for (const uid of removeUids) batch.delete(doc(db, 'kasaKeys', uid));

  await batch.commit();
  return newKey;
}
