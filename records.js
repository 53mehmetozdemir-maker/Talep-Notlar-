import { db } from "./firebase.js";
import { state } from "./state.js";
import {
  collection, addDoc, getDocs,
  deleteDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ADD */
window.add = async () => {

  if (!no.value || !date.value || !dept.value || !desc.value) {
    alert("Boş alan var");
    return;
  }

  const snap = await getDocs(collection(db, "records"));

  let exists = false;
  snap.forEach(d => {
    if (d.data().no === no.value) exists = true;
  });

  if (exists) {
    alert("Talep no zaten var");
    return;
  }

  await addDoc(collection(db, "records"), {
    no: no.value,
    date: date.value,
    dept: dept.value,
    desc: desc.value,
    user: state.user.email
  });

  renderRecords();
  loadDashboard?.();
};

/* DELETE */
window.del = async (id) => {
  await deleteDoc(doc(db, "records", id));
  renderRecords();
  loadDashboard?.();
};

/* EDIT */
window.edit = async (id) => {
  const v = prompt("Yeni açıklama");
  if (!v) return;
  await updateDoc(doc(db, "records", id), { desc: v });
  renderRecords();
};

/* RENDER ENGINE */
export async function renderRecords() {

  const tb = document.getElementById("tb");
  tb.innerHTML = "";

  const snap = await getDocs(collection(db, "records"));

  let arr = [];

  snap.forEach(d => arr.push({ id: d.id, ...d.data() }));

  arr = arr.filter(x => {

    const searchMatch =
      (x.no + x.dept + x.desc)
        .toLowerCase()
        .includes(state.search.toLowerCase());

    const dateMatch =
      (!state.startDate || !state.endDate)
        ? true
        : (x.date >= state.startDate && x.date <= state.endDate);

    return searchMatch && dateMatch;
  });

  arr.forEach(x => {
    tb.innerHTML += `
      <tr>
        <td>${x.no}</td>
        <td>${x.date}</td>
        <td>${x.dept}</td>
        <td>${x.desc}</td>
        <td>${x.user}</td>
        <td>
          <button onclick="edit('${x.id}')">Edit</button>
          <button onclick="del('${x.id}')">Del</button>
        </td>
      </tr>
    `;
  });

  document.getElementById("totalRecords").innerText = arr.length;
}