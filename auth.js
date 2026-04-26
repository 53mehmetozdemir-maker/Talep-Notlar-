import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export let currentUser = null;
export let role = "viewer";

/* LOGIN */
window.login = async () => {
  const email = document.getElementById("luser").value;
  const pass = document.getElementById("lpass").value;

  await signInWithEmailAndPassword(auth, email, pass);
};

/* LOGOUT */
window.logout = () => signOut(auth);

/* ROLE LOAD */
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

/* AUTH STATE */
onAuthStateChanged(auth, async (user) => {

  const loginBox = document.getElementById("loginBox");
  const panel = document.getElementById("panel");

  if (!loginBox || !panel) {
    console.error("loginBox veya panel HTML'de yok!");
    return;
  }

  if (user) {
    currentUser = user;
    await loadRole(user);

    loginBox.style.display = "none";
    panel.style.display = "block";

    // güvenli çağrılar
    window.render?.();
    window.loadDashboard?.();
    window.loadUsers?.();
    window.loadDepts?.();

  } else {
    currentUser = null;
    role = "viewer";

    loginBox.style.display = "block";
    panel.style.display = "none";
  }
});