import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

window.login = function(){
  const email = luser.value;
  const pass = lpass.value;

  signInWithEmailAndPassword(auth,email,pass)
  .catch(e=>alert(e.message));
}

window.logout = function(){
  signOut(auth);
}

onAuthStateChanged(auth,(user)=>{
  if(user){
    document.getElementById("loginBox").style.display="none";
    document.getElementById("panel").style.display="block";
    window.loadDashboard?.();
  }else{
    document.getElementById("loginBox").style.display="block";
    document.getElementById("panel").style.display="none";
  }
});