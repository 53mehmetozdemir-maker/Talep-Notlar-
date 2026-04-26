import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.loadDashboard = async function () {

  const r = await getDocs(collection(db, "records"));
  const u = await getDocs(collection(db, "users"));

  document.getElementById("totalRecords").innerText = r.size;
  document.getElementById("totalUsers").innerText = u.size;

  let html = "";

  r.forEach(d => {
    const x = d.data();
    html += `
      <div class="card">
        ${x.user} → ${x.desc}
      </div>
    `;
  });

  document.getElementById("activity").innerHTML = html;
};