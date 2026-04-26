import { db, auth } from "./firebase.js";
import {
  collection, addDoc, getDocs,
  deleteDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.searchText = "";
window.startDate = "";
window.endDate = "";

/* UNIQUE CHECK + VALIDATION */
window.add = async function () {

  const fields = [no, date, dept, desc];
  let error = false;

  fields.forEach(f => {
    if (!f.value) {
      f.style.border = "2px solid red";
      error = true;
    } else {
      f.style.border = "";
    }
  });

  if (error) return;

  /* UNIQUE TALep NO */
  const snap = await getDocs(collection(db, "records"));
  let exists = false;

  snap.forEach(d => {
    if (d.data().no === no.value) exists = true;
  });

  if (exists) {
    alert("Bu talep numarası zaten var!");
    return;
  }

  await addDoc(collection(db, "records"), {
    no: no.value,
    date: date.value,
    dept: dept.value,
    desc: desc.value,
    user: auth.currentUser.email
  });

  render();
  loadDashboard?.();
};

/* DELETE */
window.del = async function (id) {
  await deleteDoc(doc(db, "records", id));
  render();
  loadDashboard?.();
};

/* EDIT */
window.edit = async function (id) {
  const val = prompt("Yeni açıklama");
  if (!val) return;

  await updateDoc(doc(db, "records", id), { desc: val });
  render();
};

/* RENDER */
window.render = async function () {

  const tb = document.getElementById("tb");
  tb.innerHTML = "";

  const snap = await getDocs(collection(db, "records"));

  let data = [];

  snap.forEach(d => data.push({ id: d.id, ...d.data() }));

  data = data.filter(x => {

    const matchSearch =
      (x.no + x.dept + x.desc)
        .toLowerCase()
        .includes(window.searchText.toLowerCase());

    const matchDate =
      (!startDate || !endDate)
        ? true
        : (x.date >= startDate && x.date <= endDate);

    return matchSearch && matchDate;
  });

  data.forEach(x => {
    tb.innerHTML += `
      <tr>
        <td>${x.no}</td>
        <td>${x.date}</td>
        <td>${x.dept}</td>
        <td>${x.desc}</td>
        <td>${x.user}</td>
        <td>
          <button onclick="edit('${x.id}')">Düzenle</button>
          <button onclick="del('${x.id}')">Sil</button>
        </td>
      </tr>
    `;
  });

  document.getElementById("totalRecords").innerText = data.length;
};