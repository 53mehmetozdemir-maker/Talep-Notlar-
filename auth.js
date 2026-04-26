import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.login = async function () {
  const email = luser.value;
  const pass = lpass.value;

  await signInWithEmailAndPassword(auth, email, pass);
};

window.logout = async function () {
  await signOut(auth);
};

export let role = "viewer";

/* ROLE SYSTEM */
async function loadRole(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, { email: user.email, role: "viewer" });
    role = "viewer";
  } else {
    role = snap.data().role;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadRole(user);

    loginBox.style.display = "none";
    panel.style.display = "block";

    window.render?.();
    window.loadDashboard?.();
  } else {
    loginBox.style.display = "block";
    panel.style.display = "none";
  }
});