import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.loadDashboard = async function(){

  const r = await getDocs(collection(db,"records"));
  document.getElementById("totalRecords").innerText = r.size;

  const u = await getDocs(collection(db,"users"));
  document.getElementById("totalUsers").innerText = u.size;
}