import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../lib/firebase';
import { ThemeButton } from './ThemeButton';

function resetError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/expired-action-code':
        return 'Bu bağlantının süresi dolmuş. Giriş ekranından yeni bir şifre yenileme isteği oluşturun.';
      case 'auth/invalid-action-code':
        return 'Bu bağlantı geçersiz ya da daha önce kullanılmış. Giriş ekranından yeni bir istek oluşturun.';
      case 'auth/weak-password':
        return 'Şifre çok zayıf. En az 8 karakter kullanın.';
      case 'auth/network-request-failed':
        return 'Bağlantı hatası. İnternetinizi kontrol edin.';
    }
  }
  return 'Şifre değiştirilemedi. Lütfen tekrar deneyin.';
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get('oobCode') || '';

  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(!!code);
  const [error, setError] = useState(code ? '' : 'Bağlantı eksik ya da bozuk. Giriş ekranından yeni bir istek oluşturun.');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    verifyPasswordResetCode(auth, code)
      .then((mail) => {
        if (!alive) return;
        setEmail(mail);
        setChecking(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(resetError(err));
        setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (pass1.length < 8) return setError('Şifre en az 8 karakter olmalı.');
    if (pass1 !== pass2) return setError('Şifreler aynı değil.');
    setBusy(true);
    try {
      await confirmPasswordReset(auth, code, pass1);
      setDone(true);
    } catch (err) {
      setError(resetError(err));
    } finally {
      setBusy(false);
    }
  }

  const canType = !checking && !done && !!email;

  return (
    <form className="login-box" onSubmit={handleSubmit}>
      <ThemeButton className="login-theme-btn" />
      <div className="login-logo">T</div>
      <h1>
        Şifre
        <br />
        Yenile
      </h1>
      <span className="login-sub">{email || 'Talep Notları'}</span>

      {checking && <div className="login-info">Bağlantı kontrol ediliyor…</div>}

      {canType && (
        <>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Yeni şifre (en az 8 karakter)"
            value={pass1}
            onChange={(e) => setPass1(e.target.value)}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Yeni şifre (tekrar)"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            required
          />
        </>
      )}

      {error && <div className="login-error" role="alert">{error}</div>}

      {done && (
        <div className="login-info" role="status">
          Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz. KASA kullanıyorsanız ilk açılışta KASA ekranındaki
          "Giriş şifremi değiştirdim" seçeneğini kullanın (eski şifrenizi hatırlamıyorsanız "Anahtarımı sıfırla" deyip
          yöneticinizden onay isteyin).
        </div>
      )}

      {canType && (
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Şifreyi Değiştir →'}
        </button>
      )}
      {(done || (!checking && !canType)) && (
        <button className="btn-primary" type="button" onClick={() => navigate('/', { replace: true })}>
          Giriş ekranına dön →
        </button>
      )}
    </form>
  );
}
