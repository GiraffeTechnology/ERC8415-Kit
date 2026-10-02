import test from "node:test";
import assert from "node:assert/strict";
import {Client,APIError} from "./index.js";
test("SDK operations and authentication",async()=>{
 const calls=[];
 const c=new Client("https://example.test/",{fetchImpl:async(url,options)=>{
  calls.push({url,...options});return new Response(url.includes("/assets?") ? '[]' : '{"csrf":"token"}',{headers:{"set-cookie":"kit_session=abc; Secure"}});
 }});
 await c.login("user","password");await c.register("a","h");await c.state("a/b");
 await c.holder("a");await c.history("a");await c.assets();await c.update("a",2,"ACTIVE");
 await c.verify("a",1,{issuer:"i",expires_at:1,signature:"s"});await c.transfer("a",3,"next");
 await c.freeze("a",4);await c.revoke("a",5);await c.settle("a",4);
 assert.equal(calls[2].url,"https://example.test/asset/a%2Fb/state");
 assert.equal(calls[1].headers["X-CSRF-Token"],"token");
 assert.equal(calls[1].headers.Cookie,"kit_session=abc");
 assert.deepEqual(JSON.parse(calls[11].body),{asset_id:"a",expected_version:4});
 await c.logout();assert.equal(c.csrf,"");assert.equal(c.cookie,"");
});
test("failure handling and secure URLs",async()=>{
 let calls=0;
 const c=new Client("https://example.test",{apiKey:"synthetic",fetchImpl:async(u,o)=>{
  calls++;assert.equal(o.headers.Authorization,"Bearer synthetic");
  return new Response('{"detail":"Stale version"}',{status:409});
 }});
 await assert.rejects(c.freeze("a",1),e=>e instanceof APIError&&e.status===409);assert.equal(calls,1);
 const bad=new Client("http://127.0.0.1",{fetchImpl:async()=>new Response("invalid",{status:502})});
 await assert.rejects(bad.assets(),e=>e.status===502);
 const v=new Client("https://example.test",{fetchImpl:async()=>new Response('{"detail":[]}',{status:422})});
 await assert.rejects(v.assets(),/API request failed/);
 assert.throws(()=>new Client("http://external.test"),/HTTPS/);
 assert.throws(()=>new Client("https://user:pass@example.test"),/HTTPS/);
});

test("assets consumes every page without changing its array interface",async()=>{
 const records=Array.from({length:205},(_,i)=>({id:"asset-"+i,institution:"trusted"}));
 const offsets=[];
 const c=new Client("https://example.test",{fetchImpl:async(url)=>{
  const query=new URL(url).searchParams;
  const offset=Number(query.get("offset"));offsets.push(offset);
  assert.equal(query.get("limit"),"100");
  return Response.json(records.slice(offset,offset+100));
 }});
 assert.deepEqual(await c.assets(),records);
 assert.deepEqual(offsets,[0,100,200]);
});
test("assets propagates a later-page error instead of returning a truncated list",async()=>{
 const c=new Client("https://example.test",{fetchImpl:async(url)=>
   url.endsWith("offset=0") ? Response.json(Array.from({length:100},(_,i)=>({id:i}))) :
   Response.json({detail:"Rate limit exceeded"},{status:429})});
 await assert.rejects(c.assets(),e=>e.status===429);
});
