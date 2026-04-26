import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.loadDashboard = async () => {

  const r = await getDocs(collection(db, "records"));
  const u = await getDocs(collection(db, "users"));

  totalRecords.innerText = r.size;
  totalUsers.innerText = u.size;

  let html = "";

  r.forEach(d => {
    html += `<div class="card">${d.data().desc}</div>`;
  });

  activity.innerHTML = html;
};