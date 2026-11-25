import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const template=readFileSync(resolve(root,"worker/index.js"),"utf8");
const html=readFileSync(resolve(root,"worker/index.html"),"utf8");
const remote=readFileSync(resolve(root,"worker/remote.js"),"utf8");
const output=template.replace("__HTML_PAYLOAD__",JSON.stringify(html)).replace("__REMOTE_PAYLOAD__",JSON.stringify(remote));
const destination=resolve(root,"dist/worker.js");
mkdirSync(dirname(destination),{recursive:true});
writeFileSync(destination,output);
console.log(`Built ${destination}`);
