import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
const source=html.match(/async function screenVisualCandidates\(brief,key,personal,commons,offset=0\)\{[\s\S]*?\r?\n\}\r?\nasync function importChosenCommons/)?.[0].replace(/\r?\nasync function importChosenCommons$/,'');
assert.ok(source,"visual screening function missing");
const context=vm.createContext({
  REMOTE:false,SERVER:true,
  aiAccount:()=>({}),
  visualThumbnail:async id=>"data:image/jpeg;base64,"+id,
  fetch:async(_url,options)=>{
    const content=JSON.parse(options.body).messages[0].content;
    const ids=content.filter(part=>part.type==="text"&&part.text.startsWith("素材 ID:")).map(part=>part.text.match(/^素材 ID: ([^；]+)/)[1]);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({ratings:ids.map(id=>({id,score:id==="personal-7"?3:0,reason:id==="personal-7"?"适合美食主题":"主体不符"}))})}}]})};
  }
});
vm.runInContext(source,context);
const personal=Array.from({length:8},(_,index)=>({id:`personal-${index+1}`,name:`素材 ${index+1}`}));
const commons=[{id:"commons-1",title:"公开素材 1",url:"https://example.test/one.jpg"},{id:"commons-2",title:"公开素材 2",url:"https://example.test/two.jpg"}];
const first=await vm.runInContext("screenVisualCandidates('美食日常分享，灯泡、红色格子餐布、高脚杯','',personal,commons)",vm.createContext({...context,personal,commons}));
assert.equal(first.notes.length,6);
assert.equal(first.personal.length,0);
const second=await vm.runInContext("screenVisualCandidates('美食日常分享，灯泡、红色格子餐布、高脚杯','',personal,commons,6)",vm.createContext({...context,personal,commons}));
assert.equal(second.personal[0]?.id,"personal-7");
assert.equal(second.notes.length,4);
console.log("design visual screening batches passed");
