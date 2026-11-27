import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const worker=readFileSync(new URL("../worker/index.js",import.meta.url),"utf8");
const source=worker.match(/const verifiedAiAccounts=new Map\(\);[\s\S]*?\r?\nfunction json\(/)?.[0].replace(/\r?\nfunction json\($/,"");
assert.ok(source,"shared AI account validation missing");
let status=207,checks=0;
const context=vm.createContext({DAV:"https://dav.example.test/",TextEncoder,btoa,
  dav:async()=>{checks++;return {status,ok:status>=200&&status<300};},
  hash:async bytes=>Array.from(bytes).join("-"),
  json:(data,code)=>new Response(JSON.stringify(data),{status:code,headers:{"Content-Type":"application/json"}})
});
vm.runInContext(source,context);
const env={SILICONFLOW_API_KEY:"shared-test-key",AI_USER_LIMITER:{limit:async()=>({success:true})},AI_GLOBAL_LIMITER:{limit:async()=>({success:true})}};
const first=await context.aiAccess({user:"one@example.test",pass:"app-password"},env);
assert.equal(first.key,"shared-test-key");
const again=await context.aiAccess({user:"one@example.test",pass:"app-password"},env);
assert.equal(again.key,"shared-test-key");
assert.equal(checks,1,"same design turn should not reverify WebDAV for every model call");
status=429;
const limited=await context.aiAccess({user:"two@example.test",pass:"app-password"},env);
assert.equal(limited.error.status,503);
assert.match((await limited.error.json()).error,/HTTP 429/);
status=401;
const invalid=await context.aiAccess({user:"three@example.test",pass:"wrong-password"},env);
assert.equal(invalid.error.status,401);
assert.match((await invalid.error.json()).error,/应用密码已失效/);
console.log("shared AI WebDAV validation and transient-error checks passed");
