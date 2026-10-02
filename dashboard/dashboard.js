let csrf = "", currentRole = "", selected = null;
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
  selected = await api("/asset/"+encodeURIComponent(id)+"/state");
  showActions();
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
  const rows = [];
  for (;;) {
    const page = await api("/assets?limit=100&offset="+rows.length);
    rows.push(...page);
    if (page.length < 100) break;
  }
  el("count").textContent = "("+rows.length+")";
  el("empty").hidden = rows.length !== 0;
  el("assets").replaceChildren(...rows.map(asset => {
    const tr = document.createElement("tr");
    const td = document.createElement("td"), button = document.createElement("button");
    button.textContent = asset.id;
    button.onclick = () => timeline(asset.id).catch(error => notice(error.message));
    td.append(button);tr.append(td);
    for (const value of [asset.state+" · "+asset.execution_status+(asset.frozen ? " · frozen":""),asset.holder,asset.version]) {
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
  const me = await api("/auth/me");csrf=me.csrf;currentRole=me.role;
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

function showActions() {
  el("actions-panel").hidden = !selected;
  if (!selected) return;
  el("action-title").textContent = "Actions · " + selected.id;
  const active = ["ACTIVE","TRANSFERRED"].includes(selected.state);
  const terminal = ["SETTLED","REVOKED"].includes(selected.state);
  const ready = ["SIMULATED","LOCAL_EVM","CONFIRMED"].includes(selected.execution_status);
  const actions = [
    ["Verify proof","/proof/verify",["ADMIN","VERIFIER"],selected.state==="REGISTERED",()=>JSON.parse(el("proof-input").value)],
    ["Activate","/state/update",["ADMIN","CUSTODIAN"],["VERIFIED","TRANSFERRED"].includes(selected.state),()=>({state:"ACTIVE"})],
    ["Transfer","/transfer",["ADMIN","CUSTODIAN"],active,()=>({holder:el("new-holder").value})],
    ["Settle","/settlement",["ADMIN","CUSTODIAN"],active,()=>({})],
    ["Freeze","/freeze",["ADMIN","CUSTODIAN"],!terminal,()=>({})],
    ["Revoke","/revoke",["ADMIN"],!terminal,()=>({})]
  ];
  el("actions").replaceChildren(...actions.filter(a=>a[2].includes(currentRole)).map(([label,path,roles,valid,extra])=>{
    const button=document.createElement("button");button.textContent=label;
    button.disabled=!valid || !ready || (selected.frozen && path!=="/revoke");
    button.onclick=async()=>{button.disabled=true;try{
      await api(path,{...extra(),asset_id:selected.id,expected_version:selected.version});
      await refresh();await timeline(selected.id);notice(label+" completed.");
    }catch(error){notice(error.message);showActions();}};
    return button;
  }));
}
