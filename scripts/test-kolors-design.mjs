import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
const source=html.match(/function kolorsScenePlacement\(group,index,height,writingZone\)\{[\s\S]*?\r?\nasync function designPreviewThumbnail/)?.[0].replace(/\r?\nasync function designPreviewThumbnail$/,'');
const layoutSource=html.match(/function parseCompactLayoutReply\(raw,base\)\{[\s\S]*?\r?\nfunction addFoodDetailLayers/)?.[0].replace(/\r?\nfunction addFoodDetailLayers$/,'');
const decisionSource=html.match(/function designSubject\(request\)\{[\s\S]*?\r?\nfunction anchorDesignGroups/)?.[0].replace(/\r?\nfunction anchorDesignGroups$/,'');
const requirementSource=html.match(/function mergeParsedDesignRequirements\(base,parsed,request\)\{[\s\S]*?\r?\nfunction anchorDesignGroups/)?.[0].replace(/\r?\nfunction anchorDesignGroups$/,'');
const reviewSource=html.match(/function applyDesignReviewFix\(spec,decision,review,height\)\{[\s\S]*?\r?\nfunction designReviewProblem/)?.[0].replace(/\r?\nfunction designReviewProblem$/,'');
const limitedSource=html.match(/function limitedEditCandidates\(decision,elements,assets\)\{[\s\S]*?\r?\nasync function buildLimitedEditSpec/)?.[0].replace(/\r?\nasync function buildLimitedEditSpec$/,'');
assert.ok(source&&layoutSource&&decisionSource&&requirementSource&&reviewSource&&limitedSource);
let next=0;
const calls=[];
const context=vm.createContext({PAGE_W:794,REMOTE:false,File,Blob,selectedId:"",
  aiAccount:()=>({}),
  fetch:async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:"image/png"}));},
  remoteAddAsset:async(_file,meta)=>{assert.ok(meta.aiTags?.length);return `generated-${++next}`;}
});
vm.runInContext(decisionSource+"\n"+requirementSource+"\n"+layoutSource+"\n"+source+"\n"+reviewSource+"\n"+limitedSource,context);
const parsedBrief=vm.runInContext(`fallbackDesignDecision("根据已有的素材生成简笔画风的灯泡和高脚杯，整个画面的画布都做成红色格子餐布的感觉",[])`,context);
assert.equal(parsedBrief.background.kind,"full_page_pattern");
assert.deepEqual(Array.from(parsedBrief.groups,group=>group.subject),["灯泡","高脚杯"]);
assert.ok(parsedBrief.groups.every(group=>group.scope==="independent_subject"&&group.style==="简笔画风"));
assert.equal(parsedBrief.modificationScope,"new_design");
const modelRequirements={background:{scope:"full_page",description:"红色格子餐布铺满整页"},localDecorations:[],subjects:[{name:"灯泡",style:"简笔画线稿",role:"primary"},{name:"高脚杯",style:"简笔画线稿",role:"support"}],requiredColors:["红色"],mustKeep:["灯泡和高脚杯保持简笔画风"],modificationScope:"new_design",writingZone:"left"};
const merged=vm.runInContext(`mergeParsedDesignRequirements(${JSON.stringify(parsedBrief)},${JSON.stringify(modelRequirements)},"原始需求")`,context);
assert.equal(merged.background.kind,"full_page_pattern");
assert.deepEqual(Array.from(merged.groups,group=>group.subject),["灯泡","高脚杯"]);
assert.equal(merged.groups[0].style,"简笔画线稿");
assert.deepEqual(Array.from(merged.requiredColors),["红色"]);
const limitedRequest="仅修改餐盘素材，现在花纹出现了对接不上的问题，并且要缩小些，放在左下角；灯泡素材比例适当，不需要景深氛围灯泡背景，仅保留灯泡即可，高脚杯保持不变，整个背景保持不变";
const limitedDecision=vm.runInContext(`fallbackDesignDecision(${JSON.stringify(limitedRequest)},[])`,context);
assert.equal(limitedDecision.modificationScope,"limited");
assert.equal(limitedDecision.preserveBackground,true);
assert.ok(limitedDecision.targetsToModify.includes("餐盘"));
assert.ok(limitedDecision.targetsToModify.includes("灯泡"));
assert.ok(limitedDecision.objectsToPreserve.includes("高脚杯"));
assert.ok(limitedDecision.objectsToPreserve.includes("背景"));
assert.ok(!limitedDecision.targetsToModify.includes("高脚杯"));
const pageImages=[{id:"plate-id",type:"image",assetId:"plate"},{id:"lamp-id",type:"image",assetId:"lamp"},{id:"glass-id",type:"image",assetId:"glass"}];
const pageAssets=[{id:"plate",name:"餐盘插画"},{id:"lamp",name:"灯泡插画"},{id:"glass",name:"高脚杯插画"}];
context.selectedId="";
const selectedTargets=vm.runInContext(`limitedEditCandidates(${JSON.stringify(limitedDecision)},${JSON.stringify(pageImages)},${JSON.stringify(pageAssets)})`,context);
assert.deepEqual(Array.from(selectedTargets.matches,item=>item.element.id),["plate-id"]);
const missingTarget=vm.runInContext(`limitedEditCandidates({...${JSON.stringify(limitedDecision)},targetsToModify:["花瓶"]},${JSON.stringify(pageImages)},${JSON.stringify(pageAssets)})`,context);
assert.ok(missingTarget.error.includes("没有在当前页找到"));
const reviewLayers=vm.runInContext(`limitedEditReviewLayers(${JSON.stringify(pageImages)},["plate-id"],[{id:"new-plate",type:"image",assetId:"plate-new"}])`,context);
assert.deepEqual(Array.from(reviewLayers,item=>item.id),["lamp-id","glass-id","new-plate"]);
const decision={intent:"美食日常",visualDirection:"清爽线描",palette:["#F9F4EA","#BB4C46","#D7AE67"],writingZone:"左侧书写",groups:[
  {id:"g1",subject:"温馨灯泡",x:54,y:8,w:34,h:30},
  {id:"g2",subject:"红色格子餐布",x:45,y:43,w:46,h:32},
  {id:"g3",subject:"高脚杯",x:65,y:58,w:25,h:26},
  {id:"g4",subject:"不应生成的额外装饰"}
]};
const base={...decision,groups:decision.groups.slice(0,3)};
const reply="L|#F9F4EA,#BB4C46,#D7AE67|54,8,34,30|45,43,46,32|65,58,25,26";
const layout=vm.runInContext(`parseCompactLayoutReply(${JSON.stringify(reply)},${JSON.stringify(base)})`,context);
assert.equal(layout.groups[0].x,54);
assert.equal(layout.groups[1].subject,"红色格子餐布");
assert.throws(()=>vm.runInContext(`parseCompactLayoutReply('L|#F9F4EA,#BB4C46,#D7AE67',${JSON.stringify(base)})`,context),/数量/);
const spec=await vm.runInContext(`generateKolorsScene(${JSON.stringify(decision)},1123,"",{textContent:""})`,context);
assert.equal(calls.length,2);
assert.equal(spec.layers.filter(layer=>layer.type==="image").length,2);
assert.ok(spec.layers.filter(layer=>layer.type==="image").every(layer=>layer.treatment==="cutout"&&layer.x>=290&&layer.x+layer.w<=794));
assert.ok(spec.layers.filter(layer=>layer.groupId==="g2").every(layer=>layer.type==="shape"),"regular gingham is editable");
assert.ok(calls[0].prompt.includes("温馨灯泡"));
assert.ok(calls[1].prompt.includes("高脚杯"));
assert.ok(!calls[1].prompt.includes("灯泡"),"each Kolors call should receive only its own subject");
assert.ok(!calls.some(call=>"image" in call),"text-to-image should not send a reference image");
assert.ok(spec.background.stops[1].toLowerCase()!=="#bb4c46","accent red must not become the page background");
const fullPage=await vm.runInContext(`generateKolorsScene(${JSON.stringify(parsedBrief)},1123,"",{textContent:""})`,context);
assert.equal(calls.length,4,"only the two independent subjects are sent to Kolors");
assert.equal(fullPage.background.color,"#bb4c46");
assert.equal(fullPage.pattern,"gingham");
assert.equal(fullPage.patternColor,"#f7e9dd");
assert.equal(fullPage.layers.filter(layer=>layer.type==="image").length,2);
const failedReview={issue:"palette_mismatch",fixes:["correct_palette"]};
assert.equal(vm.runInContext(`applyDesignReviewFix(${JSON.stringify(fullPage)},${JSON.stringify(parsedBrief)},${JSON.stringify(failedReview)},1123)`,context),true);
assert.equal(fullPage.pattern,"gingham","pattern survives the targeted palette correction");
const preserveDecision={...parsedBrief,modificationScope:"limited"};
const limitedSpec={...fullPage,background:{...fullPage.background},layers:[...fullPage.layers]};
assert.equal(vm.runInContext(`applyDesignReviewFix(${JSON.stringify(limitedSpec)},${JSON.stringify(preserveDecision)},${JSON.stringify(failedReview)},1123)`,context),false,"limited edits preserve explicitly protected background settings");
console.log("Kolors subject scene checks passed");
