import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
const generator=html.match(/function backgroundGeneratorLayer\(generator\)\{[\s\S]*?\r?\nfunction renderBg/)?.[0].replace(/\r?\nfunction renderBg$/,'');
const roles=html.match(/function explicitBackgroundPlan\(request,pageId,parsedBackground=\{\}\)\{[\s\S]*?\r?\nfunction parseKolorsLayoutReply/)?.[0].replace(/\r?\nfunction parseKolorsLayoutReply$/,'');
const removal=html.match(/function materialBackgroundRemovalRequested\(text\)\{[\s\S]*?\r?\nfunction revisionBackgroundRequested/)?.[0].replace(/\r?\nfunction revisionBackgroundRequested$/,'');
assert.ok(generator&&roles&&removal,"background generator and role separation must exist");
const context=vm.createContext({structuredClone,encodeURIComponent});
vm.runInContext(generator+"\n"+removal+"\n"+roles,context);

const request="请为当前页设计背景。整页红金色渐变背景，点缀绿色植物，中央留白";
const decision={background:{kind:"full_page_color",colors:[]},groups:[
  {id:"g1",subject:"红金色背景"},{id:"g2",subject:"绿色植物枝叶"}
]};
const separated=vm.runInContext(`separateDesignRoles(${JSON.stringify(decision)},${JSON.stringify(request)},"page-1")`,context);
assert.deepEqual(Array.from(separated.groups,group=>group.subject),["绿色植物枝叶"]);
assert.equal(separated.backgroundPlan.background.type,"gradient");
assert.deepEqual(Array.from(separated.backgroundPlan.background.stops),["#a6483d","#c69a55","#f4e6cf"]);
assert.equal(separated.backgroundPlan.generator.family,"wash");
assert.equal(separated.backgroundPlan.generator.blankZone,"center");
const spec={background:{type:"solid",color:"#ffffff"},layers:[{type:"image",groupId:"g2",assetId:"plant"}]};
vm.runInContext(`applyBackgroundPlan(spec,separated.backgroundPlan)`,vm.createContext({...context,spec,separated}));
assert.equal(spec.background.stops[0],"#a6483d");
assert.equal(spec.layers.length,1,"background must stay outside movable image layers");

const first=context.backgroundGeneratorLayer(separated.backgroundPlan.generator);
const repeat=context.backgroundGeneratorLayer(separated.backgroundPlan.generator);
assert.equal(first.image,repeat.image,"fixed seed must reproduce the same background");
const denser=context.backgroundGeneratorLayer({...separated.backgroundPlan.generator,density:6});
assert.notEqual(first.image,denser.image,"density must be adjustable");
const geometric=context.backgroundGeneratorLayer({family:"geometry",motif:"gingham",density:4,seed:7,color:"#a6483d",accent:"#e5d3b4",blankZone:"left"});
assert.match(decodeURIComponent(geometric.image),/x="330" width="464"/);
assert.equal(context.separateDesignRoles({background:{kind:"full_page_color"},groups:[{id:"g1",subject:"红金色背景"}]},"整页红金色背景","p").groups.length,0);
const combined="请为当前页设计背景。\n我的描述：做一页红金色的植物手帐背景，使用线条图案\n画面主体或装饰：绿色植物枝叶\n呈现方式：清爽线条\n装饰组数：适中（3–5 组）\n补充要求：植物素材去掉背景";
const combinedPlan=context.separateDesignRoles({background:{kind:"full_page_color",colors:[]},groups:[{id:"g1",subject:"绿色植物枝叶"}]},combined,"page-2");
const dreamPlan=context.explicitBackgroundPlan("为绘画日常生成梦幻独角兽背景，梦核感，motif 丰富一点","dream-page");
assert.equal(dreamPlan.background.type,"gradient");
assert.equal(dreamPlan.generator.family,"waves","dream atmosphere belongs to the full canvas");
assert.equal(combinedPlan.backgroundPlan.background.stops[0],"#a6483d","red-gold belongs to the canvas even when material background is removed");
assert.equal(combinedPlan.materialPlan.colorName,"绿色","plant material color must be parsed separately");
assert.equal(combinedPlan.materialPlan.style,"clean_line_art");
assert.equal(combinedPlan.materialPlan.palette[0],"#3f7653");
console.log("background roles, reproducibility, controls, and full-page rendering plan passed");
