import { db } from "./firebase.js";
import {
  collection, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.loadDashboard = async function(){

  const recordsSnap = await getDocs(collection(db,"records"));
  const usersSnap = await getDocs(collection(db,"users"));

  document.getElementById("totalRecords").innerText = recordsSnap.size;
  document.getElementById("totalUsers").innerText = usersSnap.size;

  // son 5 kayıt (activity feed)
  const q = query(collection(db,"records"), limit(5));
  const lastSnap = await getDocs(q);

  let html = "<h3>🕒 Son İşlemler</h3>";

  lastSnap.forEach(d=>{
    const x = d.data();
    html += `
      <div class="card" style="padding:10px;margin:5px 0">
        <b>${x.user}</b> → ${x.desc}
      </div>
    `;
  });

  document.getElementById("activity").innerHTML = html;
}