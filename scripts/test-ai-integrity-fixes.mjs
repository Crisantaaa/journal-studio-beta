import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {TextEncoder} from "node:util";

const html=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
const extract=(start,end)=>{
  const match=html.match(new RegExp(`${start}([\\s\\S]*?)\\r?\\n${end}`));
  assert.ok(match,`Missing function block: ${start}`);
  return match[1];
};
const snapshotSource=extract("async function capturePageEditSnapshot\\(p\\)\\{","async function applyBg");
const applySource=extract("async function applyBg\\(spec,source=\"AI 设计\",targetPageId=page\\(\\)\\.id,allowReviewFailed=false\\)\\{","document.getElementById\\(\"btnCompareBg\"\\)");
const checklistSource=extract("function designRequirementChecklist\\(decision,groups=decision.groups\\|\\|\\[\\],userRequest=\"\"\\)\\{","function parseDesignScene");
const reviewSource=extract("async function reviewDesignPreview\\(spec,request,key,height\\)\\{","function applyDesignReviewFix");
const problemSource=extract("function designReviewProblem\\(review\\)\\{","function addBotanicalStructure");
const repairSource=extract("async function regenerateReviewedSubject\\(spec,decision,review,height,key,waiting\\)\\{","function designReviewProblem");

const staleToasts=[];
const page={id:"page-1",height:1123,bg:{type:"solid",color:"#fff"},elements:[{id:"target",type:"image",assetId:"before",x:10,y:20,w:100,h:100}],strokes:[]};
const scene=vm.createContext({crypto:webcrypto,TextEncoder,PAGE_W:794,state:{pages:[page],cur:0},page:()=>page,pageHeight:p=>p.height,aiPending:false,toast:text=>staleToasts.push(text)});
vm.runInContext("async function capturePageEditSnapshot(p){"+snapshotSource+"\nasync function applyBg(spec,source=\"AI 设计\",targetPageId=page().id,allowReviewFailed=false){"+applySource,scene);
const sourceSnapshot=await vm.runInContext("capturePageEditSnapshot(page())",scene);
page.elements[0].x=45;
await vm.runInContext(`applyBg({limitedEdit:true,sourcePageId:"page-1",sourcePageSnapshot:${JSON.stringify(sourceSnapshot)},removeElementIds:["target"],layers:[]},"test","page-1")`,scene);
assert.equal(page.elements[0].x,45,"a stale local draft must not overwrite a changed target");
assert.ok(staleToasts.some(text=>text.includes("重新生成局部修改预览")));
Object.assign(scene,{uid:()=>"new-design-layer",describeBgChanges:()=>"changed",renderPage:()=>{},renderChat:()=>{},fitScale:()=>{},persist:()=>{},SERVER:false,aiPreview:null,previewComparing:false,selectedId:null});
page.designLayerIds=["target"];
await vm.runInContext('applyBg({background:{type:"solid",color:"#eee"},preserveElementIds:["target"],layers:[{type:"shape",shape:"ellipse",x:10,y:10,w:20,h:20,fill:"#fff"}]} ,"test","page-1")',scene);
assert.ok(page.elements.some(element=>element.id==="target"),"named preserved object must survive replacement of generated background layers");
assert.ok(page.elements.some(element=>element.id==="new-design-layer"));
page.elements.push({id:"user-note",type:"shape",shape:"rect",x:0,y:0,w:20,h:20,fill:"#123456"});
const layeredSnapshot=await vm.runInContext("capturePageEditSnapshot(page())",scene);
let nextLayer=0;scene.uid=()=>`replacement-${++nextLayer}`;
await vm.runInContext(`applyBg({layeredEdit:true,sourcePageId:"page-1",sourcePageSnapshot:${JSON.stringify(layeredSnapshot)},background:{type:"solid",color:"#eee"},layers:[{type:"shape",shape:"ellipse",x:20,y:20,w:30,h:30,fill:"#abcdef"}]} ,"test","page-1")`,scene);
assert.ok(page.elements.some(element=>element.id==="user-note"),"user-created elements must remain");
assert.ok(!page.elements.some(element=>element.id==="new-design-layer"),"old generated layer must be replaced, not appended again");
assert.equal(page.designLayerIds.length,1);

const requirementHelpers={materialBackgroundRemovalRequested:request=>/去掉.{0,20}背景/.test(request),wantsSeparateDecorations:request=>/分开|分散|多处/.test(request)};
const checkContext=vm.createContext(requirementHelpers);
vm.runInContext("function designRequirementChecklist(decision,groups=decision.groups||[],userRequest=\"\"){"+checklistSource,checkContext);
const checklist=vm.runInContext(`designRequirementChecklist({groups:[{id:"g1",subject:"灯泡"}],mustKeep:["杯子保持不变"],objectsToPreserve:["杯子"],requiredColors:["红色"],preserveBackground:true},undefined,"保留红色，只改灯泡")`,checkContext);
assert.deepEqual(Array.from(checklist,item=>item.type),["subject","preserve","color","preserve_background","user_request"]);
const preservePage={elements:[{id:"glass-element",type:"image",assetId:"glass"},{id:"other-element",type:"image",assetId:"other"}]};
const preserveContext=vm.createContext({...requirementHelpers,libraryAssets:[{id:"glass",name:"高脚杯插画"},{id:"other",name:"云朵"}]});
vm.runInContext("function designRequirementChecklist(decision,groups=decision.groups||[],userRequest=\"\"){"+checklistSource,preserveContext);
const protectedIds=vm.runInContext(`preservedElementIds({objectsToPreserve:["高脚杯"]},${JSON.stringify(preservePage)})`,preserveContext);
assert.deepEqual(Array.from(protectedIds),["glass-element"]);

let reviewPayload;
const reviewContext=vm.createContext({REMOTE:false,aiAccount:()=>({}),designPreviewThumbnail:async()=>"data:image/jpeg;base64,dGVzdA==",fetch:async(_url,options)=>{reviewPayload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({score:3,comment:"看起来不错",issue:"none",requirementResults:[]})}}]}),{status:200,headers:{"Content-Type":"application/json"}});}});
vm.runInContext("async function reviewDesignPreview(spec,request,key,height){"+reviewSource+"\nfunction designReviewProblem(review){"+problemSource,reviewContext);
const review=await vm.runInContext(`reviewDesignPreview({requirements:[{id:"color-1",type:"color",value:"红色"}]},"用户要求红色","",1123)`,reviewContext);
assert.equal(reviewPayload.messages[0].content[0].text.includes("color-1"),true,"review prompt must carry checklist IDs");
assert.equal(review.unmetRequirements.length,1,"missing per-item review evidence must fail closed");
assert.equal(vm.runInContext(`designReviewProblem(${JSON.stringify(review)})`,reviewContext),"requirement_unmet");

let repairedCalls=[];
const repairContext=vm.createContext({libraryAssets:[{id:"replacement-image"}],REMOTE:false,validateComposedSpec:()=>true,generateKolorsScene:async decision=>{repairedCalls.push(decision.groups[0].subject);return {layers:[{type:"image",assetId:"replacement-image",groupId:decision.groups[0].id,x:0,y:0,w:20,h:20}]};},page:()=>({elements:[]}),pageMatchesEditSnapshot:async()=>true,limitedEditReviewLayers:()=>[]});
vm.runInContext("async function regenerateReviewedSubject(spec,decision,review,height,key,waiting){"+repairSource,repairContext);
const repairSpec={groups:[{id:"g1",subject:"灯泡"},{id:"g2",subject:"高脚杯"}],layers:[{type:"image",assetId:"old-1",groupId:"g1",x:10,y:20,w:100,h:100},{type:"image",assetId:"old-2",groupId:"g2",x:200,y:300,w:80,h:120}],limitedEdit:false};
repairContext.repairSpec=repairSpec;
const failedReview={issue:"requirement_unmet",comment:"高脚杯缺失",unmetRequirements:[{type:"subject",groupId:"g2",value:"高脚杯",comment:"未显示"}]};
const repaired=await vm.runInContext(`regenerateReviewedSubject(repairSpec,{groups:repairSpec.groups},${JSON.stringify(failedReview)},1123,"",{textContent:""})`,repairContext);
assert.equal(repaired,true);
assert.deepEqual(repairedCalls,["高脚杯"],"repair must target only the subject named by review");
const replacement=repairSpec.layers.find(layer=>layer.groupId==="g2");
assert.equal(replacement.x,200,"targeted regeneration must preserve the original placement");
assert.equal(replacement.y,300);

for(const [,script] of html.matchAll(new RegExp("<script[^>]*>([\\s\\S]*?)</script>","g")))if(script.trim())new vm.Script(script);

console.log("AI integrity regression checks passed");
