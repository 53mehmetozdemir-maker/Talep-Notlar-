import { db } from "./firebase.js";
import {
  collection, getDocs, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.loadUsers = async function(){

  const snap = await getDocs(collection(db,"users"));

  let html = "";

  snap.forEach(u=>{
    const d=u.data();

    html += `
      <div style="display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #ddd">
        <span>${d.email}</span>

        <select onchange="changeRole('${u.id}',this.value)">
          <option ${d.role==="viewer"?"selected":""}>viewer</option>
          <option ${d.role==="standard"?"selected":""}>standard</option>
          <option ${d.role==="admin"?"selected":""}>admin</option>
        </select>
      </div>
    `;
  });

  document.getElementById("userList").innerHTML = html;
}

window.changeRole = async function(id,role){
  await updateDoc(doc(db,"users",id),{role});
  loadUsers();
}