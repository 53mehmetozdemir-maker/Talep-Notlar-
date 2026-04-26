import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

window.login = function(){
  const email = document.getElementById("luser").value;
  const pass = document.getElementById("lpass").value;

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
  }else{
    document.getElementById("loginBox").style.display="block";
    document.getElementById("panel").style.display="none";
  }
});