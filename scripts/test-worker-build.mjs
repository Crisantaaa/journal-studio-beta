import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const {default: worker}=await import("../dist/worker.js");
for(const [path,source] of [["/","../worker/index.html"],["/remote.js","../worker/remote.js"]]){
  const response=await worker.fetch(new Request(`https://example.test${path}`),{});
  assert.equal(response.status,200);
  assert.equal(await response.text(),readFileSync(new URL(source,import.meta.url),"utf8"),`${path} differs from its source`);
}
console.log("Worker serves exact HTML and remote.js source bytes");
