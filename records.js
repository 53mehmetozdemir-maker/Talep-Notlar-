import { db, auth } from "./firebase.js";
import {
  collection, addDoc, getDocs, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.add = async function(){

  await addDoc(collection(db,"records"),{
    no:no.value,
    date:date.value,
    dept:dept.value,
    desc:desc.value,
    user:auth.currentUser.email
  });

  render();
}

window.del = async function(id){
  await deleteDoc(doc(db,"records",id));
  render();
}

window.render = async function(){

  const tb = document.getElementById("tb");
  tb.innerHTML="";

  const snap = await getDocs(collection(db,"records"));

  snap.forEach(d=>{
    const x = d.data();

    tb.innerHTML += `
      <tr>
        <td>${x.no}</td>
        <td>${x.date}</td>
        <td>${x.dept}</td>
        <td>${x.desc}</td>
        <td>${x.user}</td>
        <td><button onclick="del('${d.id}')">Sil</button></td>
      </tr>
    `;
  });
}