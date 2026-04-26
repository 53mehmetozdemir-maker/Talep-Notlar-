window.render = async function(){

  const tb = document.getElementById("tb");
  const q = (window.searchValue || "").toLowerCase();

  tb.innerHTML="";

  const snap = await getDocs(collection(db,"records"));

  snap.forEach(d=>{
    const x = d.data();

    const text = (x.no + x.dept + x.desc).toLowerCase();

    if(text.includes(q)){

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
    }
  });
}

window.setSearch = function(v){
  window.searchValue = v;
  render();
}