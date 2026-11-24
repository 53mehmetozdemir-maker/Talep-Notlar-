import { useState } from 'react';
import type { FormEvent } from 'react';
import { appConfirm, appToast } from '../../lib/dialog';
import { deleteMyKeyRecord, loadRawNotes, rotateVault, saveUserRecord, verifyLoginPassword, writeKeyRecord } from './api';
import type { VaultStatus } from './api';
import {
  createUserKeys,
  fromB64,
  importDek,
  isKeysV2,
  openUserPrivateKey,
  rewrapUserKeys,
  unlockLegacy,
  unwrapDek,
  verifyCheck,
  wrapDekForUser,
} from './crypto';
import type { UserKeyRecord } from './crypto';
import { errMsg, sleep } from './kasaUtils';
import { setVaultKey } from './vaultSession';

interface Props {
  status: VaultStatus;
  uid: string;
  email: string;
  admin: boolean;
  onRefresh: () => Promise<void>;
}

type Mode = 'setup' | 'setup-wait' | 'migrate' | 'migrate-wait' | 'request' | 'pending' | 'unlock';

export function AccessGate({ status, uid, email, admin, onRefresh }: Props) {
  const { meta, userRec, wrappedDek } = status;
  const [pw, setPw] = useState('');
  const [oldMaster, setOldMaster] = useState('');
  const [oldLogin, setOldLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showChange, setShowChange] = useState(false);

  const mode: Mode =
    meta === null
      ? admin
        ? 'setup'
        : 'setup-wait'
      : !isKeysV2(meta)
        ? admin
          ? 'migrate'
          : 'migrate-wait'
        : !userRec
          ? 'request'
          : !wrappedDek
            ? 'pending'
            : 'unlock';

  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setPw('');
      setOldMaster('');
      setOldLogin('');
    }
  }

  /** Anahtar çifti yoksa oluşturur (önce şifrenin gerçekten giriş şifresi olduğunu doğrular). */
  async function ensureKeys(): Promise<UserKeyRecord> {
    if (userRec) return userRec;
    if (!(await verifyLoginPassword(pw))) {
      await sleep(1200);
      throw new Error('Giriş şifresi yanlış.');
    }
    const rec = await createUserKeys(pw, uid, email);
    await saveUserRecord(uid, rec);
    return rec;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    void run(async () => {
      if (mode === 'setup') {
        const rec = await ensureKeys();
        setVaultKey(await rotateVault(null, [], [{ uid, publicKey: rec.publicKey }], []));
        appToast('KASA kuruldu.', 'success');
        await onRefresh();
      } else if (mode === 'migrate' && meta) {
        const oldKey = await unlockLegacy(oldMaster, meta);
        if (!oldKey) {
          await sleep(1200);
          throw new Error('Eski ortak master şifre yanlış.');
        }
        const rec = await ensureKeys();
        const raw = await loadRawNotes();
        setVaultKey(await rotateVault(oldKey, raw, [{ uid, publicKey: rec.publicKey }], []));
        appToast(`${raw.length} not yeni anahtar sistemine geçirildi.`, 'success');
        await onRefresh();
      } else if (mode === 'request') {
        await ensureKeys();
        appToast('Erişim isteği gönderildi, yönetici onayı bekleniyor.', 'success');
        await onRefresh();
      } else if (mode === 'unlock' && userRec && wrappedDek && meta) {
        const priv = await openUserPrivateKey(pw, uid, userRec);
        if (!priv) {
          await sleep(1200);
          throw new Error('Giriş şifresi yanlış. Giriş şifreni yakın zamanda değiştirdiysen aşağıdan eski şifreni gir.');
        }
        let dek: CryptoKey;
        try {
          dek = await unwrapDek(priv, wrappedDek, admin);
        } catch {
          throw new Error('Anahtar kaydın geçersiz. Aşağıdan “Anahtarımı sıfırla” yapıp yöneticiden yeniden onay iste.');
        }
        if (!(await verifyCheck(dek, meta.check))) {
          throw new Error('Anahtar kaydın eskimiş (anahtar yenilenmiş). “Anahtarımı sıfırla” yapıp yöneticiden yeniden onay iste.');
        }
        setVaultKey(dek);
      }
    });
  }

  function changePassword() {
    if (!userRec) return;
    void run(async () => {
      if (!(await verifyLoginPassword(pw))) throw new Error('Yeni giriş şifresi yanlış (hesabın şu anki şifresini yaz).');
      const next = await rewrapUserKeys(oldLogin, pw, uid, userRec);
      if (!next) {
        await sleep(1200);
        throw new Error('Eski giriş şifresi yanlış.');
      }
      await saveUserRecord(uid, next);
      appToast('Anahtarın yeni şifreyle yeniden korundu, şimdi açabilirsin.', 'success');
      setShowChange(false);
      await onRefresh();
    });
  }

  function resetKeys() {
    void run(async () => {
      if (
        !(await appConfirm(
          'Anahtarın sıfırlansın mı? KASA erişimin kapanır, yöneticinin seni yeniden onaylaması gerekir. Notlar silinmez.',
        ))
      )
        return;
      if (!(await verifyLoginPassword(pw))) throw new Error('Giriş şifresi yanlış (önce yukarıdaki alana yaz).');
      if (wrappedDek) await deleteMyKeyRecord(uid);
      await saveUserRecord(uid, await createUserKeys(pw, uid, email));
      appToast('Anahtarın sıfırlandı. Yönetici onayı bekleniyor.', 'success');
      await onRefresh();
    });
  }

  function recover(file: File | undefined) {
    if (!file || !meta) return;
    void run(async () => {
      const parsed = await file
        .text()
        .then((t) => JSON.parse(t) as { format?: string; dek?: string })
        .catch(() => null);
      if (!parsed || parsed.format !== 'kasa-recovery' || !parsed.dek) throw new Error('Bu bir kurtarma anahtarı dosyası değil.');
      const dekB64 = parsed.dek;
      const dek = await importDek(fromB64(dekB64), true);
      if (!(await verifyCheck(dek, meta.check))) throw new Error('Kurtarma anahtarı güncel değil (anahtar yenilenmiş olabilir).');
      const rec = await ensureKeys();
      await writeKeyRecord(uid, await wrapDekForUser(dek, rec.publicKey));
      appToast('Anahtarın yeniden tanımlandı. Şimdi giriş şifrenle açabilirsin.', 'success');
      await onRefresh();
    });
  }

  if (mode === 'setup-wait' || mode === 'migrate-wait') {
    return (
      <div className="panel panel-clip ks-gate">
        <div className="ks-gate-icon">🔒</div>
        <h3>{mode === 'setup-wait' ? 'KASA henüz kurulmamış' : 'KASA güncelleniyor'}</h3>
        <p>
          {mode === 'setup-wait'
            ? 'İlk kurulumu bir yönetici yapmalı.'
            : 'KASA yeni anahtar sistemine geçiriliyor. Bir yöneticinin geçişi tamamlaması gerekiyor.'}
        </p>
      </div>
    );
  }

  if (mode === 'pending') {
    return (
      <div className="panel panel-clip ks-gate">
        <div className="ks-gate-icon">⏳</div>
        <h3>Yönetici onayı bekleniyor</h3>
        <p>
          Anahtarın oluşturuldu. Bir yönetici seni onaylayınca KASA’yı giriş şifrenle açabileceksin.
        </p>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void run(onRefresh)}>
          Durumu yenile
        </button>
        <GateExtras
          admin={admin}
          busy={busy}
          pw={pw}
          setPw={setPw}
          showPwField
          onReset={resetKeys}
          onRecover={recover}
        />
        {error && <div className="ks-error">{error}</div>}
      </div>
    );
  }

  const title: Record<string, string> = {
    setup: 'KASA kurulumu',
    migrate: 'Yeni anahtar sistemine geçiş',
    request: 'KASA erişimi iste',
    unlock: 'KASA kilitli',
  };
  const text: Record<string, string> = {
    setup: 'Anahtarın giriş şifrenle korunarak oluşturulur. Diğer kullanıcıları sonradan onaylarsın.',
    migrate:
      'Mevcut notlar eski ortak master şifreyle şifreli. Eski ortak şifreyi ve giriş şifreni gir; notlar yeniden şifrelenir ve eski ortak şifre geçersiz olur.',
    request: 'Giriş şifreni gir. Anahtarın oluşturulur ve yönetici onayına gönderilir.',
    unlock: 'KASA’yı açmak için hesabının giriş şifresini yaz. Oturum şifreyi saklamaz, bu yüzden her açılışta sorulur.',
  };

  return (
    <form className="panel panel-clip ks-gate" onSubmit={submit}>
      <div className="ks-gate-icon">🔐</div>
      <h3>{title[mode]}</h3>
      <p>{text[mode]}</p>

      {mode === 'migrate' && (
        <>
          <label htmlFor="ks-old">Eski ortak master şifre</label>
          <input id="ks-old" type="password" autoComplete="off" value={oldMaster} onChange={(e) => setOldMaster(e.target.value)} />
        </>
      )}
      <label htmlFor="ks-pw">Giriş şifren</label>
      <input
        id="ks-pw"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />

      {error && <div className="ks-error">{error}</div>}
      <button type="submit" className="btn-primary" disabled={busy || !pw || (mode === 'migrate' && !oldMaster)}>
        {busy
          ? 'Bekleyin…'
          : mode === 'setup'
            ? 'KASA’yı kur'
            : mode === 'migrate'
              ? 'Geçişi yap'
              : mode === 'request'
                ? 'Erişim iste'
                : 'Kilidi aç'}
      </button>

      {mode === 'unlock' && (
        <>
          <button type="button" className="ks-link" onClick={() => setShowChange((v) => !v)}>
            Giriş şifremi değiştirdim
          </button>
          {showChange && (
            <div className="ks-extra">
              <label htmlFor="ks-oldlogin">Eski giriş şifren</label>
              <input id="ks-oldlogin" type="password" autoComplete="off" value={oldLogin} onChange={(e) => setOldLogin(e.target.value)} />
              <div className="ks-hint">Yukarıdaki alana şu anki (yeni) giriş şifreni yaz.</div>
              <button type="button" className="ks-btn ks-btn-hi" disabled={busy || !pw || !oldLogin} onClick={changePassword}>
                Anahtarımı yeni şifreye taşı
              </button>
            </div>
          )}
          <GateExtras admin={admin} busy={busy} pw={pw} setPw={setPw} showPwField={false} onReset={resetKeys} onRecover={recover} />
        </>
      )}
    </form>
  );
}

function GateExtras({
  admin,
  busy,
  pw,
  setPw,
  showPwField,
  onReset,
  onRecover,
}: {
  admin: boolean;
  busy: boolean;
  pw: string;
  setPw: (v: string) => void;
  showPwField: boolean;
  onReset: () => void;
  onRecover: (f: File | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ks-extras">
      <button type="button" className="ks-link" onClick={() => setOpen((v) => !v)}>
        Sorun mu var?
      </button>
      {open && (
        <div className="ks-extra">
          {showPwField && (
            <>
              <label htmlFor="ks-pw-x">Giriş şifren (sıfırlama için)</label>
              <input id="ks-pw-x" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </>
          )}
          <button type="button" className="ks-btn" disabled={busy || !pw} onClick={onReset}>
            Anahtarımı sıfırla
          </button>
          <div className="ks-hint">Anahtarın bozulduysa sıfırla; yönetici seni yeniden onaylar. Notlar silinmez.</div>
          {admin && (
            <>
              <label htmlFor="ks-rec">Kurtarma anahtarı dosyası (yönetici)</label>
              <input id="ks-rec" type="file" accept=".json,application/json" disabled={busy || !pw} onChange={(e) => onRecover(e.target.files?.[0])} />
              <div className="ks-hint">Başka yönetici kalmadıysa, indirdiğin kurtarma dosyasıyla erişimini geri alabilirsin (giriş şifren de gerekir).</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
