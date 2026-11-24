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
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
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

export interface VaultMeta {
  salt: string;
  iterations: number;
  check: Sealed;
}

export async function createMeta(password: string): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const check = await seal(key, META_CHECK, META_AAD);
  return { meta: { salt: toB64(salt), iterations: KDF_ITERATIONS, check }, key };
}

/** Şifre doğruysa anahtarı döner, yanlışsa null. */
export async function unlockWithMeta(password: string, meta: VaultMeta): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(password, fromB64(meta.salt), meta.iterations);
    return (await open(key, meta.check, META_AAD)) === META_CHECK ? key : null;
  } catch {
    return null;
  }
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
