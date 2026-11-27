import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {homedir} from "node:os";

const localPath=process.env.JOURNAL_STUDIO_LOCAL_HTML||join(homedir(),"Documents","Codex","2026-11-16","ni","journal-studio-server","index.html");
const source=readFileSync(new URL("../worker/index.html",import.meta.url),"utf8");
let local=readFileSync(localPath,"utf8");
const swaps=[
  ['<small title="本地测试版本" style="font-size:10px;color:#356448;white-space:nowrap">本地测试 · 11月26日 局部保留与表达扩展版</small>',""],
  ["电脑文件 · data/journal.json","坚果云 · JournalStudio/journal.json"],
  ["手动保存到电脑文件","手动保存到坚果云"],
  ["保存到电脑","保存到坚果云"],
  ['<script src="/asset-local.js"></script>\r\n',""],
  ['const REMOTE = false;\r\nconst SERVER = location.protocol === "http:" || location.protocol === "https:";',"const REMOTE = true;\r\nconst SERVER = false;"],
  ['remoteLoadAssets().catch(e=>toast("素材库读取失败："+e.message));\r\n    ',""],
  ["if(REMOTE||SERVER){const assetId=await remoteAddAsset(f);","if(REMOTE){const assetId=await remoteAddAsset(f);"],
  ['if(!REMOTE&&!SERVER){toast("请通过本地服务打开素材库");','if(!REMOTE){toast("素材库目前用于坚果云版");']
];
for(const [from,to] of swaps){
  assert.equal(local.split(from).length,2,`expected exactly one local-only adaptation: ${from.slice(0,60)}`);
  local=local.replace(from,to);
}
// The online page adds remote.js after the application script.
local=local.replace('</body>\r\n</html>\r\n','<script src="/remote.js"></script>\r\n</body>\r\n</html>\r\n');
assert.equal(local,source,"local test page and online source differ outside explicit environment adaptations");
const {default:worker}=await import("../dist/worker.js");
const served=await (await worker.fetch(new Request("https://example.test/"),{})).text();
assert.equal(served,source,"built online page differs from source");
console.log("Local test and deployable page have identical shared frontend code");
