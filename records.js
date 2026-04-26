import { db } from "./firebase.js";
import { currentUser } from "./auth.js";
import {
  collection, addDoc, getDocs,
  deleteDoc, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.searchText = "";
window.startDate = "";
window.endDate = "";

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
    alert("Bu talep no zaten var");
    return;
  }

  await addDoc(collection(db, "records"), {
    no: no.value,
    date: date.value,
    dept: dept.value,
    desc: desc.value,
    user: currentUser.email
  });

  render();
};

window.del = async (id) => {
  await deleteDoc(doc(db, "records", id));
  render();
};

window.edit = async (id) => {
  const v = prompt("Yeni açıklama");
  if (!v) return;
  await updateDoc(doc(db, "records", id), { desc: v });
  render();
};

window.render = async () => {

  const tb = document.getElementById("tb");
  tb.innerHTML = "";

  const snap = await getDocs(collection(db, "records"));

  let arr = [];
  snap.forEach(d => arr.push({ id: d.id, ...d.data() }));

  arr = arr.filter(x => {
    const s = (x.no + x.dept + x.desc)
      .toLowerCase()
      .includes(searchText.toLowerCase());

    const d = (!startDate || !endDate)
      ? true
      : (x.date >= startDate && x.date <= endDate);

    return s && d;
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
          <button onclick="edit('${x.id}')">Düzenle</button>
          <button onclick="del('${x.id}')">Sil</button>
        </td>
      </tr>
    `;
  });

  document.getElementById("totalRecords").innerText = arr.length;
};