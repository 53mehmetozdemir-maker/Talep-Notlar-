'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

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
