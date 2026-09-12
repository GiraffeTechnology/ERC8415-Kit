let csrf = "";
const el = id => document.getElementById(id);
function notice(message) { el("notice").textContent = message; }
async function api(path, body) {
  const response = await fetch(path, {method:body ? "POST":"GET", credentials:"same-origin",
    headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},
    body:body ? JSON.stringify(body):undefined});
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail:"Request failed");
  return data;
}
async function timeline(id) {
  const rows = await api("/asset/"+encodeURIComponent(id)+"/history");
  el("detail-title").textContent = "Audit · "+id;
  el("timeline").replaceChildren(...rows.map(row => {
    const li = document.createElement("li");
    li.textContent = row.operation+" · version "+row.version+" · "+row.record.asset.state+
      " · "+row.record.receipt.finality+" · "+row.created_at;
    return li;
  }));
}
async function refresh() {
  const rows = await api("/assets");
  el("count").textContent = "("+rows.length+")";
  el("empty").hidden = rows.length !== 0;
  el("assets").replaceChildren(...rows.map(asset => {
    const tr = document.createElement("tr");
    const td = document.createElement("td"), button = document.createElement("button");
    button.textContent = asset.id;
    button.onclick = () => timeline(asset.id).catch(error => notice(error.message));
    td.append(button);tr.append(td);
    for (const value of [asset.state+(asset.frozen ? " · frozen":""),asset.holder,asset.version]) {
      const cell = document.createElement("td");cell.textContent = value;tr.append(cell);
    }
    return tr;
  }));
}
async function users() {
  const rows = await api("/admin/users");
  el("users").replaceChildren(...rows.map(user => {
    const li = document.createElement("li");li.textContent = user.username+" · ";
    const select = document.createElement("select");select.setAttribute("aria-label","Role for "+user.username);
    for (const role of ["ADMIN","VERIFIER","CUSTODIAN","AUDITOR","VIEWER"]) {
      const option = document.createElement("option");option.value=role;option.textContent=role;
      option.selected=role===user.role;select.append(option);
    }
    const button=document.createElement("button");button.textContent="Save role";
    button.onclick=()=>api("/admin/users/"+encodeURIComponent(user.username)+"/role",{role:select.value})
      .then(()=>notice("Role updated.")).catch(error=>notice(error.message));
    li.append(select,button);return li;
  }));
}
async function signedIn() {
  const me = await api("/auth/me");csrf=me.csrf;
  el("identity").textContent=me.username+" · "+me.role;
  el("login-panel").hidden=true;el("workspace").hidden=false;el("logout").hidden=false;
  el("permissions").hidden=me.role!=="ADMIN";
  el("register-panel").hidden=!["ADMIN","CUSTODIAN"].includes(me.role);
  await refresh();if(me.role==="ADMIN") await users();
}
el("login").onsubmit=async event=>{
  event.preventDefault();
  try { const data=await api("/auth/login",Object.fromEntries(new FormData(event.target)));
    csrf=data.csrf;event.target.reset();await signedIn();notice("");
  } catch(error){notice(error.message);}
};
el("register").onsubmit=async event=>{
  event.preventDefault();try{await api("/asset/register",Object.fromEntries(new FormData(event.target)));
    event.target.reset();await refresh();notice("Asset registered.");}catch(error){notice(error.message);}
};
el("create-user").onsubmit=async event=>{
  event.preventDefault();try{await api("/admin/users",Object.fromEntries(new FormData(event.target)));
    event.target.reset();await users();notice("User added.");}catch(error){notice(error.message);}
};
el("refresh").onclick=()=>refresh().catch(error=>notice(error.message));
el("logout").onclick=async()=>{try{await api("/auth/logout",{});location.reload();}catch(error){notice(error.message);}};
signedIn().catch(()=>{});
