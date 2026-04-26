import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAuSzUO0Ru9DP_ffGJLE7eNGjFJn3KLQ68",
  authDomain: "talep-notlari.firebaseapp.com",
  projectId: "talep-notlari",
  storageBucket: "talep-notlari.firebasestorage.app",
  messagingSenderId: "707869290725",
  appId: "1:707869290725:web:3af237300865ed98dde40c",
  measurementId: "G-K32K2GF75C"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);