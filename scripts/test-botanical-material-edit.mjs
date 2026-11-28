import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
const source=html.match(/function materialPlanForRequest\(request,prior=null\)\{[\s\S]*?\r?\nfunction materialPlanForRevision/)?.[0].replace(/\r?\nfunction materialPlanForRevision$/,'');
assert.ok(source,"material edit parser missing");
const context=vm.createContext({});
vm.runInContext(source,context);
const plan=(request,prior=null)=>vm.runInContext(`materialPlanForRequest(${JSON.stringify(request)},${JSON.stringify(prior)})`,context);
const green=plan("绿色植物素材");
const revised=plan("修改植物素材，要求颜色为蓝色，画风为简约线条风",green);
assert.equal(revised.colorName,"蓝色");
assert.equal(revised.style,"clean_line_art");
assert.equal(revised.palette[0],"#416e91");
const separate=plan("背景改成蓝色，植物素材保持绿色",green);
assert.equal(separate.colorName,"绿色","canvas color must not override material color");
for(const [request,color] of [["植物素材改成紫色","紫色"],["叶片要黄色","黄色"],["橙色花卉素材","橙色"],["灰色的植物线性插画","灰色"]]){
  assert.equal(plan(request,green).colorName,color,request);
}
assert.equal(plan("植物用细线勾线",green).style,"clean_line_art");
const light=plan("背景保持不变，植物颜色浅一些",green);
assert.equal(light.colorName,"绿色");
assert.notEqual(light.palette[0],green.palette[0]);
assert.equal(plan("背景深一点，植物保持绿色",green).palette[0],green.palette[0]);
const extract=(start,end)=>{
  const block=html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
  assert.ok(block.startsWith(start)&&block.length>start.length,`missing ${start}`);
  return block;
};
const draw=vm.createContext({PAGE_W:794,materialPlanForRequest:context.materialPlanForRequest,
  kolorsScenePlacement:(_group,index)=>({x:index*100,y:index*150,w:180,h:200}),
  distributedBotanicalPlacement:index=>({x:index*100,y:index*150,w:180,h:200})});
vm.runInContext(extract("async function createDistributedBotanicalLayers(","async function reviseChatDesign(")+extract("function botanicalLineArtLayers(","function expandDistributedBotanicalGroups(")+extract("async function generateKolorsScene(","function limitedEditCandidates("),draw);
const distributed=await draw.createDistributedBotanicalLayers({id:"controlled-botanical",subject:"绿色植物枝叶",style:"清爽线条"},"增加植物素材形状的多样性",1123,"",{textContent:""},3,42,revised);
assert.equal(distributed.groups.length,3,"diversity must preserve requested decoration count");
const stems=distributed.groups.map(group=>distributed.layers.find(layer=>layer.groupId===group.id)?.pathData);
assert.equal(new Set(stems).size,3,"three decorations must have visibly distinct vector paths");
assert.ok(distributed.layers.every(layer=>layer.stroke===revised.palette[0]||layer.stroke===revised.palette[1]));
console.log("botanical color and line-style revisions passed");
