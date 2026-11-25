import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
const pathSource=html.match(/const SAFE_VECTOR_PATH=[\s\S]*?\r?\nfunction renderBg/)?.[0].replace(/\r?\nfunction renderBg$/,'');
const parserSource=html.match(/function cleanAiBody\(text\)[\s\S]*?\r?\nfunction pushMsg\(/)?.[0].replace(/\r?\nfunction pushMsg\($/,'');
const sceneSource=html.match(/function validateComposedSpec\(spec,allowedIds,height\)[\s\S]*?\r?\nasync function designPreviewThumbnail/)?.[0].replace(/\r?\nasync function designPreviewThumbnail$/,'');
assert.ok(pathSource&&parserSource&&sceneSource);
const context=vm.createContext({PAGE_W:794,MOTIF_PATHS:{},libraryAssets:[],page:()=>({}),pageHeight:()=>1123,cleanAiBody:undefined});
vm.runInContext(pathSource+"\n"+parserSource+"\n"+sceneSource,context);
const plan={groups:[{id:"g1",subject:"灯泡"},{id:"g2",subject:"餐布"},{id:"g3",subject:"高脚杯"}],writingZone:"左侧",mustHave:["红色格子餐布"]};
const layers=[
  {type:"shape",shape:"path",groupId:"g1",pathData:"M20 20 C30 10 70 10 80 20 L80 70 Z",stroke:"#9a6748",strokeWidth:3,fill:"none",x:500,y:100,w:170,h:170},
  {type:"shape",shape:"rect",groupId:"g2",fill:"#bb4c46",x:350,y:700,w:340,h:180},
  {type:"shape",shape:"path",groupId:"g3",pathData:"M20 10 H80 Q75 50 50 60 L50 90",stroke:"#8b5954",strokeWidth:3,fill:"none",x:540,y:480,w:140,h:210}
];
const scene={background:{type:"gradient",angle:135,stops:["#fff9ef","#f2e4d3"]},texture:"paper",pattern:"none",decorations:[],layers,suggestion:"左侧书写"};
const parse=value=>vm.runInContext(`parseDesignScene(${JSON.stringify(JSON.stringify(value))},${JSON.stringify(plan)},new Set(),1123,"装饰组数：适中")`,context);
const valid=parse(scene);
assert.equal(valid.groups.length,3);
assert.equal(valid.layers[0].pathData,layers[0].pathData);
assert.equal(valid.layers[0].groupId,"g1");
assert.throws(()=>parse({...scene,layers:layers.slice(0,2)}),/视觉组合/);
assert.throws(()=>parse({...scene,layers:[{...layers[0],pathData:'M0 0" onload="alert(1)'},...layers.slice(1)]}),/图层无效/);
assert.throws(()=>parse({...scene,layers:[{...layers[0],assetId:"fabricated",type:"image"},...layers.slice(1)]}),/图层无效/);
assert.throws(()=>vm.runInContext(`parseDesignScene(${JSON.stringify(JSON.stringify(scene))},${JSON.stringify(plan)},new Set(),1123,"装饰组数：适中；每组细节程度：有层次的细节")`,context),/每组至少需要两层细节/);
const normalized=vm.runInContext(`parseDesignGroup(${JSON.stringify(JSON.stringify({layers:[{type:"shape",shape:"ellipse",fill:"#d7ae67",cx:500,cy:180,rx:40,ry:30},{type:"shape",shape:"path",pathData:"M400 100 L500 180",stroke:"#bb4c46",strokeWidth:3}]}))},{id:"g1",subject:"灯泡"},new Set(),1123,{x:400,y:80,w:200,h:240})`,context);
assert.equal(normalized[0].x,460);
assert.equal(normalized[1].pathSpace,"page");
assert.equal(normalized[1].w,794);
const localPath=vm.runInContext(`parseDesignGroup(${JSON.stringify(JSON.stringify({layers:[{type:"shape",shape:"path",pathData:"M60 200 L140 120",stroke:"#bb4c46",strokeWidth:3,x:440,y:65,w:200,h:200},{type:"shape",shape:"rect",fill:"#f9f4ea",x:0,y:0,w:794,h:1123}]}))},{id:"g1",subject:"灯泡"},new Set(),1123,{x:400,y:60,w:300,h:300})`,context);
assert.equal(localPath[0].pathSpace,"local");
assert.equal(localPath[1].x,400);
assert.equal(localPath[1].w,300);
const commonShapes=vm.runInContext(`parseDesignGroup(${JSON.stringify(JSON.stringify({layers:[{type:"shape",shape:"ellipse",fill:"none",stroke:"#bb4c46",strokeWidth:3,cx:500,cy:180,rx:40,ry:30},{type:"shape",path:"M10 10 L90 90",stroke:"#bb4c46",strokeWidth:3,fill:"none"}]}))},{id:"g1",subject:"灯泡"},new Set(),1123,{x:400,y:60,w:300,h:300})`,context);
assert.equal(commonShapes[0].shape,"path");
assert.equal(commonShapes[1].shape,"path");
const sendSource=html.slice(html.indexOf('async function send('),html.indexOf('async function send(')+24000);
assert.ok(sendSource.includes('generateKolorsScene(designDecision,targetHeight,c.key,waiting)'));
assert.ok(!sendSource.includes('generateDesignScene('),"text model must not draw SVG layers during normal design");
assert.ok(!sendSource.includes('spec=composeDesignSpec('),"invalid model scenes must not become old icon collages");
console.log("design scene v2 schema checks passed");
