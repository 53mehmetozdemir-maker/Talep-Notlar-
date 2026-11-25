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
  const font = "'Space Grotesk',Arial,Helvetica,sans-serif";
  const mono = "'Space Mono','Courier New',monospace";
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Şifre Yenile</title></head>
<body style="margin:0;padding:0;background:#04040a;" bgcolor="#04040a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#04040a;">Talep Notları şifrenizi yenilemek için bağlantıya tıklayın.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#04040a" style="background:#04040a;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a14" style="width:100%;max-width:480px;background:#0a0a14;border:1px solid #272f11;">
<tr><td align="center" style="padding:44px 36px 8px 36px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="52" height="52" align="center" valign="middle" bgcolor="#c8ff00" style="width:52px;height:52px;background:#c8ff00;"><img src="${SITE_URL}mail-logo2.png" width="52" height="52" alt="T" style="display:block;border:0;outline:none;width:52px;height:52px;font-family:${mono};font-size:22px;font-weight:700;color:#04040a;line-height:52px;text-align:center;"></td></tr></table>
<h1 style="margin:20px 0 6px 0;font-family:${font};font-size:34px;line-height:1.05;font-weight:700;letter-spacing:-1.5px;color:#f0f0ff;">ŞİFRE<br>YENİLE</h1>
<div style="font-family:${mono};font-size:10px;letter-spacing:2px;color:#5a5a8a;">TALEP NOTLARI // KURUMSAL TALEP YÖNETİMİ</div>
</td></tr>
<tr><td align="left" style="padding:28px 36px 8px 36px;font-family:${font};font-size:15px;line-height:1.6;color:#f0f0ff;">
<p style="margin:0 0 14px 0;">Merhaba,</p>
<p style="margin:0 0 4px 0;color:#9898c8;">Hesabınızın şifresini yenilemek için aşağıdaki düğmeye tıklayın.</p>
</td></tr>
<tr><td align="center" style="padding:20px 36px 12px 36px;">
<a href="${link}" style="display:block;background:#c8ff00;color:#04040a;font-family:${font};font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;padding:15px 22px;text-align:center;">ŞİFREMİ YENİLE &rarr;</a>
</td></tr>
<tr><td align="left" style="padding:12px 36px 8px 36px;font-family:${mono};font-size:11px;line-height:1.6;color:#5a5a8a;">
Düğme çalışmazsa bu bağlantıyı tarayıcınıza yapıştırın:<br>
<a href="${link}" style="color:#9898c8;word-break:break-all;">${link}</a>
</td></tr>
<tr><td align="left" style="padding:20px 36px 36px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #1a1a30;padding-top:18px;font-family:${font};font-size:13px;line-height:1.6;color:#9898c8;">
Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın, şifreniz değişmez.<br>
<span style="color:#5a5a8a;">Talep Notları ekibi</span>
</td></tr></table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
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
