import { db } from "./firebase.js";
import {
  collection, getDocs, updateDoc, doc, addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* USERS */
export async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));

  users.innerHTML = "";

  snap.forEach(d => {
    const u = d.data();

    users.innerHTML += `
      <div class="card">
        ${u.email}
        <select onchange="setRole('${d.id}',this.value)">
          <option ${u.role==="viewer"?"selected":""}>viewer</option>
          <option ${u.role==="standard"?"selected":""}>standard</option>
          <option ${u.role==="admin"?"selected":""}>admin</option>
        </select>
      </div>
    `;
  });
}

window.setRole = async (id, role) => {
  await updateDoc(doc(db, "users", id), { role });
};

/* DEPTS */
export async function loadDepts() {
  const snap = await getDocs(collection(db, "depts"));

  dept.innerHTML = "";

  snap.forEach(d => {
    const o = document.createElement("option");
    o.text = d.data().name;
    dept.appendChild(o);
  });
}

window.addDept = async () => {
  await addDoc(collection(db, "depts"), { name: newDept.value });
  loadDepts();
};