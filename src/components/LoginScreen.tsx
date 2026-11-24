import { useState } from 'react';
import type { FormEvent } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../lib/firebase';
import { ThemeButton } from './ThemeButton';

function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        return 'E-posta veya şifre hatalı.';
      case 'auth/too-many-requests':
        return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.';
      case 'auth/network-request-failed':
        return 'Bağlantı hatası. İnternetinizi kontrol edin.';
    }
  }
  return 'Giriş yapılamadı. Lütfen tekrar deneyin.';
}

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  async function handleForgot() {
    setError('');
    setInfo('');
    const mail = email.trim();
    if (!mail) {
      setError('Önce yukarıdaki alana e-posta adresinizi yazın, sonra tekrar tıklayın.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, mail);
      setInfo(
        'Bu adres sistemde kayıtlıysa şifre yenileme bağlantısı gönderildi. Gelen kutunuzu ve gereksiz (spam) klasörünü kontrol edin.',
      );
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'auth/user-not-found') {
        // Hesabın var olup olmadığını belli etmemek için aynı mesajı göster.
        setInfo(
          'Bu adres sistemde kayıtlıysa şifre yenileme bağlantısı gönderildi. Gelen kutunuzu ve gereksiz (spam) klasörünü kontrol edin.',
        );
      } else if (err instanceof FirebaseError && err.code === 'auth/invalid-email') {
        setError('E-posta adresi geçersiz görünüyor.');
      } else if (err instanceof FirebaseError && err.code === 'auth/too-many-requests') {
        setError('Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.');
      } else if (err instanceof FirebaseError && err.code === 'auth/network-request-failed') {
        setError('Bağlantı hatası. İnternetinizi kontrol edin.');
      } else {
        setError('Şifre yenileme e-postası gönderilemedi. Lütfen tekrar deneyin.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="login-box" onSubmit={handleSubmit}>
      <ThemeButton className="login-theme-btn" />
      <div className="login-logo">T</div>
      <h1>
        Talep
        <br />
        Notları
      </h1>
      <span className="login-sub">Kurumsal talep yönetimi // v4.1</span>
      <input
        type="email"
        autoComplete="username"
        placeholder="E-posta adresiniz"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Şifreniz"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <div className="login-error" role="alert">{error}</div>}
      {info && <div className="login-info" role="status">{info}</div>}
      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? 'Giriş yapılıyor…' : 'Giriş Yap →'}
      </button>
      <button className="login-forgot" type="button" disabled={busy} onClick={handleForgot}>
        Şifremi unuttum
      </button>
    </form>
  );
}
