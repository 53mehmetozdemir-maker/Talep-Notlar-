'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

initializeApp();

const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const MAIL_USER = 'talepnotlari.destek@gmail.com';
const SITE_URL = 'https://53mehmetozdemir-maker.github.io/Talep-Notlar-/';

const HOUR = 60 * 60 * 1000;

/** Basit sayaç: pencere içinde max kadar istek. Aşılırsa false döner. */
async function hit(key, max, windowMs) {
  const db = getFirestore();
  const ref = db.doc(`resetLimits/${crypto.createHash('sha256').update(key).digest('hex')}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    if (!snap.exists || now - snap.data().start > windowMs) {
      tx.set(ref, { count: 1, start: now });
      return true;
    }
    if (snap.data().count >= max) return false;
    tx.update(ref, { count: snap.data().count + 1 });
    return true;
  });
}

function resetMailHtml(link) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.5">
<p>Merhaba,</p>
<p>Talep Notları hesabınızın şifresini yenilemek için aşağıdaki düğmeye tıklayın.</p>
<p><a href="${link}" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Şifremi yenile</a></p>
<p>Düğme çalışmazsa bu bağlantıyı tarayıcınıza yapıştırın:<br><a href="${link}">${link}</a></p>
<p>Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın, şifreniz değişmez.</p>
<p>Teşekkürler,<br>Talep Notları ekibi</p>
</div>`;
}

/**
 * Giriş ekranındaki "Şifremi unuttum": Türkçe şifre yenileme maili gönderir.
 * Giriş: { email: string }. Hesabın var olup olmadığını belli etmez.
 */
exports.sendPasswordReset = onCall(
  { region: 'europe-west1', maxInstances: 5, secrets: [GMAIL_APP_PASSWORD] },
  async (request) => {
    const raw = request.data && typeof request.data.email === 'string' ? request.data.email : '';
    const email = raw.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'E-posta adresi geçersiz görünüyor.');
    }

    const fwd = request.rawRequest && request.rawRequest.headers && request.rawRequest.headers['x-forwarded-for'];
    const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || (request.rawRequest && request.rawRequest.ip) || 'bilinmiyor';

    // Hesabın olup olmadığına bakmadan sınırla (bilgi sızdırmaz).
    if (!(await hit(`ip:${ip}`, 20, HOUR)) || !(await hit(`mail:${email}`, 3, HOUR))) {
      throw new HttpsError('resource-exhausted', 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.');
    }

    let link;
    try {
      await getAuth().getUserByEmail(email);
      const firebaseLink = await getAuth().generatePasswordResetLink(email);
      const code = new URL(firebaseLink).searchParams.get('oobCode');
      if (!code) throw new Error('oobCode yok');
      link = `${SITE_URL}#/sifre-yenile?oobCode=${encodeURIComponent(code)}`;
    } catch (err) {
      if (err && err.code === 'auth/user-not-found') return { ok: true };
      console.error('sendPasswordReset link hata', err && (err.code || err.message));
      throw new HttpsError('internal', 'Şifre yenileme e-postası gönderilemedi.');
    }

    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: MAIL_USER, pass: GMAIL_APP_PASSWORD.value() },
      });
      await transporter.sendMail({
        from: `"Talep Notları" <${MAIL_USER}>`,
        to: email,
        subject: 'Talep Notları şifrenizi yenileyin',
        text: `Merhaba,\n\nTalep Notları hesabınızın şifresini yenilemek için bu bağlantıya tıklayın:\n${link}\n\nBu isteği siz yapmadıysanız bu e-postayı dikkate almayın, şifreniz değişmez.\n\nTeşekkürler,\nTalep Notları ekibi`,
        html: resetMailHtml(link),
      });
    } catch (err) {
      console.error('sendPasswordReset mail hata', err && (err.code || err.responseCode));
      throw new HttpsError('internal', 'Şifre yenileme e-postası gönderilemedi.');
    }

    return { ok: true };
  },
);

/**
 * Yönetim ekranından bir kullanıcının giriş şifresini değiştirir.
 * Sadece users/{uid}.role == 'admin' olan kullanıcılar çağırabilir.
 * Giriş: { uid: string, password: string }
 */
exports.setUserPassword = onCall({ region: 'europe-west1', maxInstances: 5 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Giriş yapmanız gerekiyor.');
  }

  const callerSnap = await getFirestore().doc(`users/${request.auth.uid}`).get();
  if (!callerSnap.exists || callerSnap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Bu işlem için admin yetkisi gerekir.');
  }

  const data = request.data || {};
  const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (!uid) {
    throw new HttpsError('invalid-argument', 'Kullanıcı seçilmedi.');
  }
  if (uid === request.auth.uid) {
    throw new HttpsError(
      'invalid-argument',
      'Kendi şifrenizi buradan değiştiremezsiniz. Giriş ekranındaki "Şifremi unuttum" bağlantısını kullanın.',
    );
  }
  if (password.length < 8 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'Şifre en az 8, en fazla 128 karakter olmalı.');
  }

  try {
    await getAuth().updateUser(uid, { password });
    // Kullanıcının açık oturumlarını sonlandır; yeni şifreyle yeniden girsin.
    await getAuth().revokeRefreshTokens(uid);
  } catch (err) {
    if (err && err.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'Bu kullanıcının giriş hesabı bulunamadı.');
    }
    // Şifre loglanmaz, sadece hata kodu.
    console.error('setUserPassword hata', err && err.code);
    throw new HttpsError('internal', 'Şifre değiştirilemedi.');
  }

  return { ok: true };
});
