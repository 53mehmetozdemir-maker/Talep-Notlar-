import { db } from "./firebase.js";
import {
  collection, getDocs, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* USERS */
window.loadUsers = async function () {

  const snap = await getDocs(collection(db, "users"));

  let html = "";

  snap.forEach(d => {
    const u = d.data();

    html += `
      <div class="card">
        <b>${u.email}</b>

        <select onchange="changeRole('${d.id}',this.value)">
          <option ${u.role === "viewer" ? "selected" : ""}>viewer</option>
          <option ${u.role === "standard" ? "selected" : ""}>standard</option>
          <option ${u.role === "admin" ? "selected" : ""}>admin</option>
        </select>
      </div>
    `;
  });

  document.getElementById("userList").innerHTML = html;
};

window.changeRole = async function (id, role) {
  await updateDoc(doc(db, "users", id), { role });
  loadUsers();
};