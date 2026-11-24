/**
 * KASA şifreleme katmanı (tarayıcıdaki WebCrypto).
 * - Anahtar: PBKDF2-SHA256 (varsayılan 600.000 tur) -> AES-256-GCM
 * - Her not kendi rastgele IV'si ile şifrelenir, belge kimliği "additionalData" olarak bağlanır.
 * - Master şifre ve anahtar hiçbir yere gönderilmez/kaydedilmez.
 */

export const KDF_ITERATIONS = 600_000;
const META_AAD = 'kasa-meta';
const META_CHECK = 'kasa-dogrulama-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  extractable = false,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export interface Sealed {
  iv: string;
  ct: string;
}

async function seal(key: CryptoKey, text: string, aad: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(text),
  );
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: enc.encode(aad) },
    key,
    fromB64(sealed.ct),
  );
  return dec.decode(pt);
}

/** Notun içeriği (şifrelenen kısım). Başlık ve etiketler de şifrelenir. */
export interface NotePayload {
  title: string;
  tags: string[];
  content: string;
  pinned: boolean;
  /** Eski uygulamadaki oluşturma/güncelleme zamanları (ISO) korunur. */
  createdAt: string;
  updatedAt: string;
}

export function sealNote(key: CryptoKey, docId: string, payload: NotePayload): Promise<Sealed> {
  return seal(key, JSON.stringify(payload), `note:${docId}`);
}

export async function openNote(key: CryptoKey, docId: string, sealed: Sealed): Promise<NotePayload> {
  const p = JSON.parse(await open(key, sealed, `note:${docId}`)) as Partial<NotePayload>;
  return {
    title: String(p.title ?? ''),
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
    content: String(p.content ?? ''),
    pinned: Boolean(p.pinned),
    createdAt: String(p.createdAt ?? ''),
    updatedAt: String(p.updatedAt ?? ''),
  };
}

/**
 * kasaMeta/config. Yeni sistemde sadece { check, keysVersion: 2 } vardır.
 * Eski ortak-şifre sisteminden kalan { salt, iterations } alanları geçişte silinir.
 */
export interface VaultMeta {
  check: Sealed;
  keysVersion?: number;
  salt?: string;
  iterations?: number;
}

export const isKeysV2 = (m: VaultMeta): boolean => m.keysVersion === 2;

export function makeCheck(key: CryptoKey): Promise<Sealed> {
  return seal(key, META_CHECK, META_AAD);
}

export async function verifyCheck(key: CryptoKey, check: Sealed): Promise<boolean> {
  try {
    return (await open(key, check, META_AAD)) === META_CHECK;
  } catch {
    return false;
  }
}

/** Eski ortak master şifreyle anahtarı türetir (sadece geçiş için, dışa aktarılabilir). */
export async function unlockLegacy(password: string, meta: VaultMeta): Promise<CryptoKey | null> {
  if (!meta.salt || !meta.iterations) return null;
  const key = await deriveKey(password, fromB64(meta.salt), meta.iterations, true);
  return (await verifyCheck(key, meta.check)) ? key : null;
}

/* ---------- Veri anahtarı (DEK) ---------- */

/** Notları şifreleyen rastgele anahtar. Yönetici oturumlarında başkasına sarmak için dışa aktarılabilir. */
export function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportDek(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export function importDek(raw: Uint8Array<ArrayBuffer>, extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}

/* ---------- Kullanıcı anahtar çifti (giriş şifresiyle korunur) ---------- */

/** kasaUsers/{uid} belgesi: açık anahtar + giriş şifresiyle şifreli özel anahtar. */
export interface UserKeyRecord {
  email: string;
  publicKey: string;
  salt: string;
  iterations: number;
  wrappedPrivate: Sealed;
}

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;
const privAad = (uid: string) => `kasa-priv:${uid}`;

async function sealPrivate(password: string, uid: string, pkcs8: Uint8Array<ArrayBuffer>) {
  const salt = randomBytes(16);
  const pwKey = await deriveKey(password, salt, KDF_ITERATIONS);
  return { salt: toB64(salt), iterations: KDF_ITERATIONS, wrappedPrivate: await seal(pwKey, toB64(pkcs8), privAad(uid)) };
}

export async function createUserKeys(password: string, uid: string, email: string): Promise<UserKeyRecord> {
  const pair = await crypto.subtle.generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, [
    'encrypt',
    'decrypt',
  ]);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { email, publicKey: toB64(spki), ...(await sealPrivate(password, uid, pkcs8)) };
}

async function openPrivateBytes(password: string, uid: string, rec: UserKeyRecord): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const pwKey = await deriveKey(password, fromB64(rec.salt), rec.iterations);
    return fromB64(await open(pwKey, rec.wrappedPrivate, privAad(uid)));
  } catch {
    return null;
  }
}

/** Şifre doğruysa özel anahtarı döner, yanlışsa null. */
export async function openUserPrivateKey(password: string, uid: string, rec: UserKeyRecord): Promise<CryptoKey | null> {
  const bytes = await openPrivateBytes(password, uid, rec);
  if (!bytes) return null;
  return crypto.subtle.importKey('pkcs8', bytes, RSA, false, ['decrypt']);
}

/** Giriş şifresi değişince: eski şifreyle açıp yeni şifreyle yeniden korur. */
export async function rewrapUserKeys(
  oldPassword: string,
  newPassword: string,
  uid: string,
  rec: UserKeyRecord,
): Promise<UserKeyRecord | null> {
  const bytes = await openPrivateBytes(oldPassword, uid, rec);
  if (!bytes) return null;
  return { ...rec, ...(await sealPrivate(newPassword, uid, bytes)) };
}

/** Veri anahtarını kullanıcının açık anahtarıyla sarar (RSA-OAEP). */
export async function wrapDekForUser(dek: CryptoKey, publicKeyB64: string): Promise<string> {
  const pub = await crypto.subtle.importKey('spki', fromB64(publicKeyB64), RSA, false, ['encrypt']);
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, await exportDek(dek));
  return toB64(new Uint8Array(wrapped));
}

export async function unwrapDek(privateKey: CryptoKey, wrappedB64: string, extractable: boolean): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromB64(wrappedB64)));
  return importDek(raw, extractable);
}

/* ---------- Eski "Tüm Notlar" dışa aktarım dosyası ---------- */

export interface ImportedNote {
  title: string;
  tags: string[];
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface LegacyFile {
  notes?: {
    title?: string;
    tags?: string[];
    encryptedContent?: string;
    createdAt?: string;
    updatedAt?: string;
  }[];
}

const LEGACY_ITERATIONS = 150_000;

function utf8FromB64(b64: string): string {
  return dec.decode(fromB64(b64));
}

/** "v2.salt.iv.ct" biçimi: PBKDF2-SHA256 (150.000) + AES-256-GCM. */
async function openLegacyV2(value: string, password: string): Promise<string> {
  const [, salt, iv, ct] = value.split('.');
  const key = await deriveKey(password, fromB64(salt), LEGACY_ITERATIONS);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct));
  return dec.decode(pt);
}

export function legacyNeedsPassword(json: unknown): boolean {
  const f = json as LegacyFile;
  return (f.notes ?? []).some((n) => (n.encryptedContent ?? '').startsWith('v2.'));
}

export interface LegacyResult {
  notes: ImportedNote[];
  failed: string[];
}

/**
 * Eski dosyayı çözer. "v2." ile başlayanlar için eski master şifre gerekir;
 * diğerleri sadece base64 kodludur ({"c": içerik}).
 */
export async function parseLegacyFile(json: unknown, legacyPassword: string): Promise<LegacyResult> {
  const f = json as LegacyFile;
  if (!f || !Array.isArray(f.notes)) throw new Error('Dosya biçimi tanınmadı (notes listesi yok).');
  const notes: ImportedNote[] = [];
  const failed: string[] = [];

  for (const n of f.notes) {
    const title = (n.title ?? '').trim() || '(başlıksız)';
    const raw = n.encryptedContent ?? '';
    try {
      let content: string;
      if (raw.startsWith('v2.')) {
        content = await openLegacyV2(raw, legacyPassword);
      } else {
        const parsed = JSON.parse(utf8FromB64(raw)) as { c?: unknown };
        if (typeof parsed.c !== 'string') throw new Error('içerik yok');
        content = parsed.c;
      }
      const now = new Date().toISOString();
      notes.push({
        title,
        tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
        content,
        createdAt: n.createdAt ?? now,
        updatedAt: n.updatedAt ?? n.createdAt ?? now,
      });
    } catch {
      failed.push(title);
    }
  }
  return { notes, failed };
}
