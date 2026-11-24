import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { createMeta, sealNote } from './crypto';
import type { ImportedNote, NotePayload, Sealed, VaultMeta } from './crypto';

/*
 * Firestore yapısı (içerik tamamen şifreli, sunucuda düz metin yok):
 *   kasaMeta/config  -> { salt, iterations, check: {iv, ct} }
 *   kasa/{id}        -> { iv, ct, by, updatedAt }
 */
const META_REF = () => doc(db, 'kasaMeta', 'config');
const MAX_CONTENT = 700_000;
const BATCH_LIMIT = 450;

export interface RawNote extends Sealed {
  id: string;
}

export async function loadMeta(): Promise<VaultMeta | null> {
  const snap = await getDoc(META_REF());
  return snap.exists() ? (snap.data() as VaultMeta) : null;
}

export async function saveMeta(meta: VaultMeta): Promise<void> {
  await setDoc(META_REF(), meta);
}

export function watchNotes(onData: (notes: RawNote[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, 'kasa'),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, iv: String(d.data().iv), ct: String(d.data().ct) }))),
    (err) => onError(err),
  );
}

function stored(sealed: Sealed) {
  return { ...sealed, by: auth.currentUser?.email ?? '', updatedAt: serverTimestamp() };
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

/**
 * Master şifre değiştirme: tüm notlar yeni anahtarla yeniden şifrelenip
 * tek işlemde (atomik) yazılır. 450'den fazla notta yapılmaz.
 */
export async function changeMasterPassword(
  current: { id: string; payload: NotePayload }[],
  newPassword: string,
): Promise<CryptoKey> {
  if (current.length > BATCH_LIMIT) throw new Error('Not sayısı çok fazla, şifre değişimi tek işlemde yapılamıyor.');
  const { meta, key } = await createMeta(newPassword);
  const batch = writeBatch(db);
  batch.set(META_REF(), meta);
  for (const n of current) {
    batch.set(doc(db, 'kasa', n.id), stored(await sealNote(key, n.id, n.payload)));
  }
  await batch.commit();
  return key;
}
