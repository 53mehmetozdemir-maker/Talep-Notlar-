import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export let currentUser = null;
export let role = "viewer";

window.login = async () => {
  await signInWithEmailAndPassword(auth, luser.value, lpass.value);
};

window.logout = () => signOut(auth);

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
    currentUser = user;
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