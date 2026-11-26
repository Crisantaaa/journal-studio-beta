import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
const source=html.match(/function controlledLayerRequest\(text\)\{[\s\S]*?\r?\nfunction controlledBotanicalLayers/)?.[0].replace(/\r?\nfunction controlledBotanicalLayers$/,'');
const lexicon=html.match(/const DESIGN_INSTRUCTION_WORDS=\{[\s\S]*?\r?\nfunction parseDesignInstruction/)?.[0].replace(/\r?\nfunction parseDesignInstruction$/,'');
assert.ok(source&&lexicon,"controlled design router or text lexicon missing");
const context=vm.createContext({materialBackgroundRemovalRequested:request=>/素材.{0,12}去掉.{0,8}背景|去掉.{0,12}素材.{0,12}背景/.test(request),wantsSeparateDecorations:request=>/分开|分散|多处/.test(request)});
vm.runInContext(lexicon+"\n"+source,context);
const route=request=>vm.runInContext(`controlledLayerRequest(${JSON.stringify(request)})`,context);
const note="请保留明确指定的主体、颜色和范围；修改当前方案时只改本次点名的部分，其他内容尽量保持。";

assert.equal(route(`请为当前页设计背景。\n我的描述：做一页绿色植物手帐背景，使用线条图案\n${note}`),false,"new guided design must reach AI generation");
assert.equal(route("请为当前页设计背景。\n我的描述：红金色植物手帐背景\n补充要求：植物素材去掉背景，分散在多处"),false,"material cutout and distribution must not override a new canvas design");
assert.equal(route(`【快速补充要求｜设计新背景】\n我的描述：绿色植物\n${note}`),false,"new guided supplement must reach AI generation");
assert.equal(route(`请修改当前页已有的背景设计。\n补充要求：增加绿色植物素材\n${note}`),true);
assert.equal(route("修改画布底色为红金色，增加绿色植物素材数量"),true);
assert.equal(route("为我的手帐设计一页绿色植物背景"),false);
assert.equal(route("去掉植物素材的白色背景，把植物分开摆在页面多处"),true);
for(const phrase of ["背景色浅一些","底色淡一点","把画布提亮","纸张颜色更柔和","整体色调降低饱和度","背景深一点"]){assert.equal(route(phrase),true,phrase);}
console.log("new design versus controlled edit routing passed");
