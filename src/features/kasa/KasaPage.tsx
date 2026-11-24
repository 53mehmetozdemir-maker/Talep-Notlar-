import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../../context/auth-context';
import { appConfirm, appToast } from '../../lib/dialog';
import { isAdmin } from '../../lib/roles';
import { Modal } from '../records/Modal';
import { importNotes, loadStatus, newNoteId, removeNote, rotateVault, saveNote, watchAccess, watchNotes, writeKeyRecord } from './api';
import type { AccessUser, RawNote, VaultStatus } from './api';
import { AccessDialog } from './AccessDialog';
import { AccessGate } from './AccessGate';
import { exportDek, isKeysV2, legacyNeedsPassword, openNote, parseLegacyFile, toB64, wrapDekForUser } from './crypto';
import type { ImportedNote, NotePayload } from './crypto';
import {
  downloadText,
  errMsg,
  fold,
  formatDate,
  highlight,
  highlightSql,
  isCodeNote,
  isSensitiveNote,
  safeFileName,
  searchTerms,
  splitKeyValue,
} from './kasaUtils';
import { IDLE_MINUTES, lockVault, setVaultKey, touchVault, useVaultKey } from './vaultSession';
import './kasa.css';

interface VaultNote {
  id: string;
  payload: NotePayload;
}

type SortMode = 'updated' | 'created' | 'title';

async function copyText(text: string, okMessage = 'Kopyalandı') {
  try {
    await navigator.clipboard.writeText(text);
    appToast(okMessage, 'success');
  } catch {
    appToast('Kopyalanamadı (tarayıcı izni yok).', 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Not düzenleme penceresi                                             */
/* ------------------------------------------------------------------ */

function NoteEditor({
  note,
  allTags,
  allowPin,
  onClose,
  onSave,
}: {
  note: VaultNote | null;
  allTags: string[];
  allowPin: boolean;
  onClose: () => void;
  onSave: (id: string | null, payload: NotePayload) => Promise<void>;
}) {
  const [title, setTitle] = useState(note?.payload.title ?? '');
  const [tags, setTags] = useState<string[]>(note?.payload.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [content, setContent] = useState(note?.payload.content ?? '');
  const [pinned, setPinned] = useState(note?.payload.pinned ?? false);
  const [busy, setBusy] = useState(false);

  function addTag(raw: string) {
    const t = raw.trim();
    if (t && !tags.some((x) => fold(x) === fold(t))) setTags([...tags, t]);
    setTagInput('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      appToast('Başlık boş olamaz.', 'error');
      return;
    }
    const finalTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags;
    const now = new Date().toISOString();
    setBusy(true);
    try {
      await onSave(note?.id ?? null, {
        title: title.trim(),
        tags: finalTags,
        content,
        pinned,
        createdAt: note?.payload.createdAt || now,
        updatedAt: now,
      });
      onClose();
    } catch (err) {
      appToast(`Kaydedilemedi: ${errMsg(err)}`, 'error');
      setBusy(false);
    }
  }

  const suggestions = allTags.filter((t) => !tags.includes(t)).slice(0, 12);

  return (
    <Modal onClose={onClose} variant="edit">
      <form className="ks-modal panel panel-clip" onSubmit={submit}>
        <h3>{note ? 'Notu düzenle' : 'Yeni not'}</h3>
        <label htmlFor="ks-title">Başlık</label>
        <input id="ks-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />

        <label htmlFor="ks-tag">Etiketler</label>
        <div className="ks-chips">
          {tags.map((t) => (
            <button type="button" key={t} className="ks-chip ks-chip-on" onClick={() => setTags(tags.filter((x) => x !== t))} title="Kaldır">
              {t} ×
            </button>
          ))}
          <input
            id="ks-tag"
            className="ks-tag-input"
            placeholder="etiket yazıp Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
          />
        </div>
        {suggestions.length > 0 && (
          <div className="ks-chips ks-suggest">
            {suggestions.map((t) => (
              <button type="button" key={t} className="ks-chip" onClick={() => addTag(t)}>
                + {t}
              </button>
            ))}
          </div>
        )}

        <label htmlFor="ks-content">İçerik</label>
        <textarea id="ks-content" className="ks-textarea" rows={14} spellCheck={false} value={content} onChange={(e) => setContent(e.target.value)} />

        {allowPin && (
          <label className="ks-check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Sabitle (listenin başında görünsün)
          </label>
        )}

        <div className="ks-modal-actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Vazgeç
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* İçe aktarma penceresi                                               */
/* ------------------------------------------------------------------ */

function ImportDialog({
  key0,
  existing,
  onClose,
}: {
  key0: CryptoKey;
  existing: VaultNote[];
  onClose: () => void;
}) {
  const [json, setJson] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [legacyPw, setLegacyPw] = useState('');
  const [ready, setReady] = useState<{ fresh: ImportedNote[]; dup: number; failed: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isBackup = (json as { format?: string } | null)?.format === 'kasa-backup';
  const needsPw = json !== null && !isBackup && legacyNeedsPassword(json);

  async function onFile(file: File | undefined) {
    setReady(null);
    setError('');
    setJson(null);
    if (!file) return;
    try {
      setJson(JSON.parse(await file.text()));
      setFileName(file.name);
    } catch {
      setError('Dosya okunamadı: geçerli bir JSON değil.');
    }
  }

  async function prepare() {
    setBusy(true);
    setError('');
    try {
      let incoming: ImportedNote[] = [];
      let failed: string[] = [];
      if (isBackup) {
        const b = json as { notes: RawNote[] };
        for (const r of b.notes) {
          try {
            const p = await openNote(key0, r.id, r);
            incoming.push({ title: p.title, tags: p.tags, content: p.content, createdAt: p.createdAt, updatedAt: p.updatedAt });
          } catch {
            failed.push(`(not ${r.id.slice(0, 6)}…)`);
          }
        }
        if (incoming.length === 0) throw new Error('Yedek açılamadı. Yedek, anahtar yenilenmeden önce alınmış olabilir.');
      } else {
        const res = await parseLegacyFile(json, legacyPw);
        incoming = res.notes;
        failed = res.failed;
        if (incoming.length === 0) throw new Error('Hiç not çözülemedi.');
      }
      const have = new Set(existing.map((n) => `${n.payload.title}|${n.payload.createdAt}`));
      const fresh = incoming.filter((n) => !have.has(`${n.title}|${n.createdAt}`));
      setReady({ fresh, dup: incoming.length - fresh.length, failed });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!ready) return;
    setBusy(true);
    try {
      await importNotes(key0, ready.fresh);
      appToast(`${ready.fresh.length} not KASA’ya eklendi.`, 'success');
      onClose();
    } catch (err) {
      setError(`Aktarılamadı: ${errMsg(err)}`);
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} variant="edit">
      <div className="ks-modal panel panel-clip">
        <h3>Dosyadan içe aktar</h3>
        <p className="ks-hint">
          Eski “Tüm Notlar” dışa aktarım dosyasını veya KASA yedeğini seçin. Dosya tarayıcınızda çözülür, KASA’ya şifrelenerek yazılır; düz metin
          hiçbir yere gönderilmez.
        </p>
        <input type="file" accept=".json,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />
        {fileName && json !== null && <div className="ks-hint">Seçilen: {fileName}</div>}

        {needsPw && !ready && (
          <>
            <label htmlFor="ks-lpw">Eski notlar uygulamasındaki master şifre</label>
            <input id="ks-lpw" type="password" autoComplete="off" value={legacyPw} onChange={(e) => setLegacyPw(e.target.value)} />
            <div className="ks-hint">Dosyada şifreli notlar var; bu şifre sadece bu pencerede kullanılır, kaydedilmez.</div>
          </>
        )}

        {ready && (
          <div className="ks-summary">
            <b>{ready.fresh.length}</b> yeni not eklenecek
            {ready.dup > 0 && <> · {ready.dup} not zaten var, atlanacak</>}
            {ready.failed.length > 0 && (
              <div className="ks-error">
                {ready.failed.length} not çözülemedi (şifre yanlış olabilir): {ready.failed.slice(0, 5).join(', ')}
                {ready.failed.length > 5 && '…'}
              </div>
            )}
          </div>
        )}
        {error && <div className="ks-error">{error}</div>}

        <div className="ks-modal-actions">
          {!ready ? (
            <button type="button" className="btn-primary" disabled={busy || json === null || (needsPw && !legacyPw)} onClick={() => void prepare()}>
              {busy ? 'Çözülüyor…' : 'Çöz ve önizle'}
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy || ready.fresh.length === 0} onClick={() => void commit()}>
              {busy ? 'Yazılıyor…' : `KASA’ya ekle (${ready.fresh.length})`}
            </button>
          )}
          <button type="button" className="btn-cancel" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Not ayrıntısı                                                       */
/* ------------------------------------------------------------------ */

function NoteBody({ note, terms, hidden }: { note: VaultNote; terms: string[]; hidden: boolean }) {
  const { content, tags } = note.payload;
  const code = isCodeNote(tags, content);

  if (code) {
    return (
      <pre className={`ks-code${hidden ? ' ks-blur' : ''}`}>
        <code>{highlightSql(content, terms)}</code>
      </pre>
    );
  }

  return (
    <div className={`ks-text${hidden ? ' ks-blur' : ''}`}>
      {content.split('\n').map((line, i) => {
        const url = /^\s*(https?:\/\/\S+)\s*$/.exec(line);
        const kv = url ? { label: 'Adres', value: url[1] } : splitKeyValue(line);
        if (!kv) return <div key={i} className="ks-line">{line ? highlight(line, terms) : ' '}</div>;
        return (
          <div key={i} className="ks-line ks-kv">
            <span className="ks-k">{highlight(kv.label, terms)}</span>
            <span className="ks-v">{highlight(kv.value, terms)}</span>
            <button type="button" className="ks-mini" onClick={() => void copyText(kv.value, `“${kv.label}” kopyalandı`)} title="Değeri kopyala">
              kopyala
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Açık kasa                                                           */
/* ------------------------------------------------------------------ */

function Vault({ cryptoKey, uid }: { cryptoKey: CryptoKey; uid: string }) {
  const { role } = useAuth();
  const admin = isAdmin(role);

  const [raw, setRaw] = useState<RawNote[] | null>(null);
  const [notes, setNotes] = useState<VaultNote[] | null>(null);
  const [undecryptable, setUndecryptable] = useState(0);
  const [loadError, setLoadError] = useState('');

  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string>('*');
  const [sort, setSort] = useState<SortMode>('updated');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<VaultNote | 'new' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [access, setAccess] = useState<AccessUser[] | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Gerçek zamanlı şifreli veri
  useEffect(() => {
    return watchNotes(
      (r) => {
        setRaw(r);
        setLoadError('');
      },
      (e) => setLoadError(`Veriler okunamadı: ${e.message}`),
    );
  }, []);

  // Yönetici: kullanıcı/onay durumları
  useEffect(() => {
    if (!admin) return;
    return watchAccess(setAccess, (e) => appToast(`Erişim listesi okunamadı: ${e.message}`, 'error'));
  }, [admin]);

  // Çözme
  useEffect(() => {
    if (!raw) return;
    let cancelled = false;
    (async () => {
      const out: VaultNote[] = [];
      let bad = 0;
      for (const r of raw) {
        try {
          out.push({ id: r.id, payload: await openNote(cryptoKey, r.id, r) });
        } catch {
          bad++;
        }
      }
      if (!cancelled) {
        setNotes(out);
        setUndecryptable(bad);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, cryptoKey]);

  // Boşta kalma sayacı + kısayollar
  useEffect(() => {
    const activity = () => touchVault();
    const onKey = (e: KeyboardEvent) => {
      touchVault();
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const terms = useMemo(() => searchTerms(query), [query]);
  const pendingCount = (access ?? []).filter((u) => !u.approved).length;

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes ?? []) for (const t of n.payload.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
  }, [notes]);

  const pinnedCount = (notes ?? []).filter((n) => n.payload.pinned).length;

  const visible = useMemo(() => {
    const list = (notes ?? []).filter((n) => {
      if (tag === '*') {
        /* hepsi */
      } else if (tag === '★') {
        if (!n.payload.pinned) return false;
      } else if (!n.payload.tags.includes(tag)) return false;
      if (!terms.length) return true;
      const hay = fold(`${n.payload.title}\n${n.payload.tags.join(' ')}\n${n.payload.content}`);
      return terms.every((t) => hay.includes(t));
    });
    const by: Record<SortMode, (a: VaultNote, b: VaultNote) => number> = {
      updated: (a, b) => b.payload.updatedAt.localeCompare(a.payload.updatedAt),
      created: (a, b) => b.payload.createdAt.localeCompare(a.payload.createdAt),
      title: (a, b) => a.payload.title.localeCompare(b.payload.title, 'tr'),
    };
    return list.sort((a, b) => Number(b.payload.pinned) - Number(a.payload.pinned) || by[sort](a, b));
  }, [notes, tag, terms, sort]);

  const selected = selectedId ? ((notes ?? []).find((n) => n.id === selectedId) ?? null) : null;
  const allTagNames = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setRevealedId(null);
  }, []);

  async function handleSave(id: string | null, payload: NotePayload) {
    const noteId = id ?? newNoteId();
    await saveNote(cryptoKey, noteId, payload);
    select(noteId);
    appToast(id ? 'Not güncellendi.' : 'Not eklendi.', 'success');
  }

  async function handleDelete(n: VaultNote) {
    if (!(await appConfirm(`“${n.payload.title}” notu silinsin mi? Bu işlem geri alınamaz.`))) return;
    try {
      await removeNote(n.id);
      select(null);
      appToast('Not silindi.', 'success');
    } catch (err) {
      appToast(`Silinemedi: ${errMsg(err)}`, 'error');
    }
  }

  async function togglePin(n: VaultNote) {
    try {
      await saveNote(cryptoKey, n.id, { ...n.payload, pinned: !n.payload.pinned });
    } catch (err) {
      appToast(`Güncellenemedi: ${errMsg(err)}`, 'error');
    }
  }

  async function approveUser(u: AccessUser) {
    setBusyUid(u.uid);
    try {
      await writeKeyRecord(u.uid, await wrapDekForUser(cryptoKey, u.publicKey));
      appToast(`${u.email} onaylandı.`, 'success');
    } catch (err) {
      appToast(`Onaylanamadı: ${errMsg(err)}`, 'error');
    } finally {
      setBusyUid(null);
    }
  }

  async function revokeUser(u: AccessUser) {
    if (!raw || !access) return;
    const ok = await appConfirm(
      `${u.email} kullanıcısının erişimi kaldırılsın mı? Veri anahtarı yenilenecek ve tüm notlar yeniden şifrelenecek. Eski yedek dosyaları açılamaz hale gelir.`,
    );
    if (!ok) return;
    setBusyUid(u.uid);
    try {
      const keep = access.filter((x) => x.approved && x.uid !== u.uid);
      setVaultKey(await rotateVault(cryptoKey, raw, keep, [u.uid]));
      appToast(`${u.email} erişimi kaldırıldı, notlar yeni anahtarla şifrelendi.`, 'success');
    } catch (err) {
      appToast(`Kaldırılamadı: ${errMsg(err)}`, 'error');
    } finally {
      setBusyUid(null);
    }
  }

  async function downloadRecoveryKey() {
    const ok = await appConfirm(
      'Kurtarma dosyası notların anahtarını DÜZ olarak içerir. Eline geçiren herkes notları açabilir. Güvenli bir yerde saklayacak mısın?',
    );
    if (!ok) return;
    const dek = toB64(await exportDek(cryptoKey));
    const body = { format: 'kasa-recovery', version: 1, createdAt: new Date().toISOString(), dek };
    downloadText(`kasa-kurtarma-anahtari-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(body), 'application/json');
    appToast('Kurtarma anahtarı indirildi. Güvenli bir yere kaydet.', 'success');
  }

  function exportBackup() {
    if (!raw) return;
    const file = { format: 'kasa-backup', version: 2, exportedAt: new Date().toISOString(), notes: raw };
    downloadText(`kasa-yedek-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(file), 'application/json');
    appToast('Şifreli yedek indirildi. Anahtar yenilenirse eski yedekler açılamaz.', 'success');
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = visible.findIndex((n) => n.id === selectedId);
    const next = visible[e.key === 'ArrowDown' ? Math.min(visible.length - 1, i + 1) : Math.max(0, i - 1)];
    if (next) select(next.id);
  }

  function snippet(n: VaultNote): ReactNode {
    const { content, tags } = n.payload;
    if (isSensitiveNote(tags, content)) return <span className="ks-secret">••••••• gizli içerik</span>;
    const f = fold(content);
    let at = -1;
    for (const t of terms) {
      const i = f.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    const start = Math.max(0, at - 30);
    const text = content.slice(start, start + 140).replace(/\s+/g, ' ').trim();
    return (
      <>
        {start > 0 && '…'}
        {highlight(text, terms)}
      </>
    );
  }

  if (loadError) {
    return (
      <div className="panel panel-clip ks-gate">
        <div className="ks-gate-icon">⚠️</div>
        <h3>KASA okunamadı</h3>
        <p>{loadError}</p>
        <p className="ks-hint">Firestore kurallarında “kasa” ve “kasaMeta” için erişim izni tanımlı olmayabilir.</p>
      </div>
    );
  }

  const sel = selected;
  const selSensitive = sel ? isSensitiveNote(sel.payload.tags, sel.payload.content) : false;
  const selHidden = sel ? selSensitive && revealedId !== sel.id : false;

  return (
    <div className={`ks-root${sel ? ' has-sel' : ''}`}>
      <div className="ks-actions">
        <button type="button" className="ks-btn ks-btn-hi" onClick={() => setEditing('new')}>
          + Yeni not
        </button>
        <button type="button" className="ks-btn" onClick={() => setShowImport(true)}>
          İçe aktar
        </button>
        <button type="button" className="ks-btn" onClick={exportBackup} disabled={!raw}>
          Şifreli yedek indir
        </button>
        {admin && (
          <button type="button" className="ks-btn" onClick={() => setShowAccess(true)}>
            Erişim yönetimi{pendingCount > 0 ? ` (${pendingCount} bekleyen)` : ''}
          </button>
        )}
        <button type="button" className="ks-btn ks-btn-lock" onClick={lockVault}>
          🔒 Kilitle
        </button>
      </div>

      <div className="panel panel-clip ks-toolbar">
        <div className="ks-search">
          <input
            ref={searchRef}
            placeholder="Ara: başlık, etiket, içerik…  ( / )"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
              if (e.key === 'ArrowDown' && visible[0]) {
                e.preventDefault();
                select(visible[0].id);
              }
            }}
          />
          {query && (
            <button type="button" className="ks-clear" onClick={() => setQuery('')} aria-label="Aramayı temizle">
              ×
            </button>
          )}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sıralama">
          <option value="updated">Son güncellenen</option>
          <option value="created">Yeni eklenen</option>
          <option value="title">Başlık (A-Z)</option>
        </select>
        <span className="ks-count">
          {notes ? `${visible.length} / ${notes.length} not` : 'Çözülüyor…'}
        </span>
      </div>

      {undecryptable > 0 && <div className="ks-error ks-banner">{undecryptable} not bu anahtarla açılamadı.</div>}

      <div className="ks-grid">
        <aside className="panel ks-tags">
          <button type="button" className={`ks-tag-row${tag === '*' ? ' on' : ''}`} onClick={() => setTag('*')}>
            <span>Tümü</span>
            <em>{notes?.length ?? 0}</em>
          </button>
          <button type="button" className={`ks-tag-row${tag === '★' ? ' on' : ''}`} onClick={() => setTag('★')}>
            <span>★ Sabitlenenler</span>
            <em>{pinnedCount}</em>
          </button>
          <div className="ks-tag-sep" />
          {tagCounts.map(([t, c]) => (
            <button type="button" key={t} className={`ks-tag-row${tag === t ? ' on' : ''}`} onClick={() => setTag(t)}>
              <span>{t}</span>
              <em>{c}</em>
            </button>
          ))}
        </aside>

        <section className="panel ks-list" tabIndex={0} onKeyDown={onListKey} aria-label="Not listesi">
          {!notes ? (
            <div className="empty">
              <div className="empty-text">Notlar çözülüyor…</div>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🗝️</div>
              <div className="empty-title">{notes.length === 0 ? 'KASA boş' : 'Sonuç yok'}</div>
              <div className="empty-text">
                {notes.length === 0 ? 'Yeni not ekleyin veya eski dosyayı içe aktarın.' : 'Aramayı ya da etiketi değiştirin.'}
              </div>
            </div>
          ) : (
            visible.map((n) => (
              <button type="button" key={n.id} className={`ks-item${n.id === selectedId ? ' on' : ''}`} onClick={() => select(n.id)}>
                <div className="ks-item-top">
                  <b>
                    {n.payload.pinned && <span className="ks-star">★ </span>}
                    {highlight(n.payload.title, terms)}
                  </b>
                  <small>{formatDate(n.payload.updatedAt)}</small>
                </div>
                <div className="ks-item-tags">
                  {n.payload.tags.slice(0, 3).map((t) => (
                    <span key={t} className="ks-chip ks-chip-sm">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="ks-snip">{snippet(n)}</div>
              </button>
            ))
          )}
        </section>

        <section className="panel ks-detail">
          {!sel ? (
            <div className="empty">
              <div className="empty-icon">🔑</div>
              <div className="empty-title">Bir not seçin</div>
              <div className="empty-text">Soldan bir not seçin ya da yukarıdan arayın.</div>
            </div>
          ) : (
            <>
              <button type="button" className="ks-back" onClick={() => select(null)}>
                ← Listeye dön
              </button>
              <div className="ks-detail-head">
                <h3>{sel.payload.title}</h3>
                <div className="ks-item-tags">
                  {sel.payload.tags.map((t) => (
                    <button type="button" key={t} className="ks-chip" onClick={() => setTag(t)} title="Bu etikete göre filtrele">
                      {t}
                    </button>
                  ))}
                </div>
                <small className="ks-dates">
                  Oluşturulma {formatDate(sel.payload.createdAt)} · Güncelleme {formatDate(sel.payload.updatedAt)}
                </small>
              </div>
              <div className="ks-tools">
                <button type="button" className="ks-btn ks-btn-hi" onClick={() => void copyText(sel.payload.content, 'Tüm not kopyalandı')}>
                  Kopyala
                </button>
                {selSensitive && (
                  <button type="button" className="ks-btn" onClick={() => setRevealedId(selHidden ? sel.id : null)}>
                    {selHidden ? 'Göster' : 'Gizle'}
                  </button>
                )}
                {admin && (
                  <button type="button" className="ks-btn" onClick={() => void togglePin(sel)}>
                    {sel.payload.pinned ? '★ Sabitlemeyi kaldır' : '☆ Sabitle'}
                  </button>
                )}
                {admin && (
                  <button type="button" className="ks-btn" onClick={() => setEditing(sel)}>
                    Düzenle
                  </button>
                )}
                <button
                  type="button"
                  className="ks-btn"
                  onClick={() =>
                    downloadText(
                      `${safeFileName(sel.payload.title)}.${isCodeNote(sel.payload.tags, sel.payload.content) ? 'sql' : 'txt'}`,
                      sel.payload.content,
                    )
                  }
                >
                  İndir
                </button>
                {admin && (
                  <button type="button" className="ks-btn ks-btn-del" onClick={() => void handleDelete(sel)}>
                    Sil
                  </button>
                )}
              </div>
              {selHidden && <div className="ks-hint ks-hide-note">Bu not hassas görünüyor, bulanık gösteriliyor. “Göster” ile açın.</div>}
              <NoteBody note={sel} terms={terms} hidden={selHidden} />
            </>
          )}
        </section>
      </div>

      <p className="ks-foot">
        İçerik tarayıcıda şifrelenir (AES-256-GCM). {IDLE_MINUTES} dakika işlem yapılmazsa KASA otomatik kilitlenir.
      </p>

      {editing && (
        <NoteEditor
          key={editing === 'new' ? 'new' : editing.id}
          note={editing === 'new' ? null : editing}
          allTags={allTagNames}
          allowPin={admin}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
      {showImport && <ImportDialog key0={cryptoKey} existing={notes ?? []} onClose={() => setShowImport(false)} />}
      {showAccess && (
        <AccessDialog
          users={access}
          myUid={uid}
          busyUid={busyUid}
          onApprove={(u) => void approveUser(u)}
          onRevoke={(u) => void revokeUser(u)}
          onRecoveryKey={() => void downloadRecoveryKey()}
          onClose={() => setShowAccess(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function KasaPage() {
  const { user, role } = useAuth();
  const key = useVaultKey();
  const [status, setStatus] = useState<VaultStatus | undefined>(undefined);
  const [error, setError] = useState('');
  const uid = user?.uid ?? '';

  const refresh = useCallback(async () => {
    try {
      setStatus(await loadStatus(uid));
      setError('');
    } catch (e) {
      setError(`KASA bilgisi okunamadı: ${errMsg(e)}`);
    }
  }, [uid]);

  useEffect(() => {
    let active = true;
    loadStatus(uid)
      .then((s) => active && setStatus(s))
      .catch((e: unknown) => active && setError(`KASA bilgisi okunamadı: ${errMsg(e)}`));
    return () => {
      active = false;
    };
  }, [uid]);

  let body: ReactNode;
  if (error) {
    body = (
      <div className="panel panel-clip ks-gate">
        <div className="ks-gate-icon">⚠️</div>
        <h3>KASA açılamadı</h3>
        <p>{error}</p>
        <p className="ks-hint">Firestore kurallarında KASA için erişim izni tanımlı olmayabilir.</p>
      </div>
    );
  } else if (!status) {
    body = (
      <div className="empty">
        <div className="empty-text">Yükleniyor…</div>
      </div>
    );
  } else if (key && status.meta && isKeysV2(status.meta)) {
    body = <Vault cryptoKey={key} uid={uid} />;
  } else {
    body = <AccessGate status={status} uid={uid} email={user?.email ?? ''} admin={isAdmin(role)} onRefresh={refresh} />;
  }

  return (
    <div>
      <div className="page-hdr">
        <h2>
          <em>KASA</em>
        </h2>
        <p>Sunucu, bağlantı, şifre ve SQL notları · tarayıcıda şifreli</p>
      </div>
      {body}
    </div>
  );
}
