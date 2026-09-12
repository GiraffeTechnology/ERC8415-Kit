export class APIError extends Error {
  constructor(status,message){super(message);this.name="APIError";this.status=status;}
}
export class Client {
  constructor(baseUrl,{apiKey,fetchImpl=globalThis.fetch,timeoutMs=10000}={}){
    const u=new URL(baseUrl);
    if(u.username||u.password||(u.protocol!=="https:"&&
      !(u.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(u.hostname))))
      throw new Error("Use HTTPS or a loopback development URL");
    this.baseUrl=baseUrl.replace(/\/$/,"");this.apiKey=apiKey;this.fetch=fetchImpl;
    this.timeoutMs=timeoutMs;this.csrf="";this.cookie="";
  }
  async request(method,path,body){
    const headers={Accept:"application/json"};
    if(body!==undefined)headers["Content-Type"]="application/json";
    if(this.apiKey)headers.Authorization="Bearer "+this.apiKey;
    if(this.csrf)headers["X-CSRF-Token"]=this.csrf;
    if(this.cookie&&typeof window==="undefined")headers.Cookie=this.cookie;
    const r=await this.fetch(this.baseUrl+path,{method,headers,credentials:"include",
      signal:AbortSignal.timeout(this.timeoutMs),body:body===undefined?undefined:JSON.stringify(body)});
    let data;try{data=await r.json();}catch{throw new APIError(r.status,"Invalid API response");}
    if(!r.ok)throw new APIError(r.status,typeof data.detail==="string"?data.detail:"API request failed");
    const cookie=r.headers.get("set-cookie");if(cookie)this.cookie=cookie.split(";")[0];
    return data;
  }
  async login(username,password){
    const r=await this.request("POST","/auth/login",{username,password});this.csrf=r.csrf;return r;
  }
  async logout(){
    const r=await this.request("POST","/auth/logout",{});this.csrf="";this.cookie="";return r;
  }
  register(id,holder,metadata={}){return this.request("POST","/asset/register",{id,holder,metadata});}
  state(id){return this.request("GET","/asset/"+encodeURIComponent(id)+"/state");}
  holder(id){return this.request("GET","/asset/"+encodeURIComponent(id)+"/holder");}
  history(id){return this.request("GET","/asset/"+encodeURIComponent(id)+"/history");}
  assets(){return this.request("GET","/assets");}
  update(id,version,state){return this.command("/state/update",id,version,{state});}
  verify(id,version,proof){return this.command("/proof/verify",id,version,proof);}
  transfer(id,version,holder){return this.command("/transfer",id,version,{holder});}
  freeze(id,version){return this.command("/freeze",id,version);}
  revoke(id,version){return this.command("/revoke",id,version);}
  settle(id,version){return this.command("/settlement",id,version);}
  command(path,id,version,extra={}){return this.request("POST",path,{...extra,asset_id:id,expected_version:version});}
}
