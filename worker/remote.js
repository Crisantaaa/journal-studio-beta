let remoteUser="", remotePass="", remoteRevision="", remoteReady=false;
let remoteDirty=false, remoteSaving=false, remoteBlocked=false, remoteTimer;
let remoteAiConfig=null;
let remoteSharedAi=false;
let libraryAssets=[];
const assetUrls=new Map();
async function remoteAssetRequest(action,extra={}){
  const res=await fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,user:remoteUser,pass:remotePass,...extra}),cache:"no-store"});
  if(action==="assets-get"){
    if(!res.ok)throw new Error("读取素材失败");
    return res.blob();
  }
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||"素材库请求失败");
  return data;
}
async function remoteLoadAssets(){libraryAssets=(await remoteAssetRequest("assets-list")).items;renderLibrary();}
async function assetUrl(id){
  if(assetUrls.has(id))return assetUrls.get(id);
  const blob=await remoteAssetRequest("assets-get",{id});
  const url=URL.createObjectURL(blob);assetUrls.set(id,url);return url;
}
async function remoteAddAsset(file,meta={}){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error("仅支持 JPG、PNG、WebP");
  if(file.size>8*1024*1024)throw new Error("单张图片不能超过 8 MB");
  let analysis={aiTags:meta.aiTags||[],description:meta.description||""};
  if(!meta.aiTags)try{analysis=await analyzeImageFile(file);}catch(e){toast("AI 标签暂不可用，将保存原图："+e.message);}
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(",")[1]);reader.onerror=reject;reader.readAsDataURL(file);});
  let color=meta.color||"#cccccc";
  if(!meta.color){
    const preview=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=preview;await img.decode();
      const canvas=document.createElement("canvas");canvas.width=24;canvas.height=24;
      const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,24,24);
      const pixels=ctx.getImageData(0,0,24,24).data;let count=0,r=0,g=0,b=0;
      for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<64)continue;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];count++;}
      if(count)color="#"+[r,g,b].map(v=>Math.round(v/count).toString(16).padStart(2,"0")).join("");
    }catch{}finally{URL.revokeObjectURL(preview);}
  }
  const id=crypto.randomUUID();
  const name=meta.name||file.name.replace(/\.[^.]+$/g,"");
  const result=await remoteAssetRequest("assets-add",{asset:{id,mime:file.type,data,name,tags:meta.tags||name.split(/[\s_\-]+/).filter(x=>x.length>1).slice(0,8),...analysis,color,sourceUrl:meta.sourceUrl||"",license:meta.license||"",author:meta.author||""}});
  libraryAssets=result.items;renderLibrary();return id;
}
async function remoteUpdateAsset(id,patch){const result=await remoteAssetRequest("assets-update",{id,patch});libraryAssets=result.items;renderLibrary();}
async function remoteDeleteAsset(id){const result=await remoteAssetRequest("assets-delete",{id});libraryAssets=result.items;const url=assetUrls.get(id);if(url){URL.revokeObjectURL(url);assetUrls.delete(id);}renderLibrary();}

function remoteRequest(action,state){return fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,user:remoteUser,pass:remotePass,revision:remoteRevision,state}),cache:"no-store"});}
async function remoteLoadAiConfig(){
  try{remoteSharedAi=!!(await (await fetch("/api/ai-status",{cache:"no-store"})).json()).shared;}catch{remoteSharedAi=false;}
  if(remoteSharedAi){remoteAiConfig={};localStorage.removeItem(CSS_KEY);return;}
  const res=await remoteRequest("read-config");
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||"读取 AI 配置失败");
  remoteAiConfig=data.config;
  if(!remoteAiConfig?.key){
    let oldKey="";
    try{oldKey=JSON.parse(localStorage.getItem(CSS_KEY)||"null")?.key||"";}catch{}
    if(oldKey){await remoteSaveAiConfig(oldKey);return;}
  }
  localStorage.removeItem(CSS_KEY);
}
async function remoteSaveAiConfig(key){
  const res=await fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"write-config",user:remoteUser,pass:remotePass,config:{key}}),cache:"no-store"});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||"保存 AI 配置失败");
  remoteAiConfig={key};
  localStorage.removeItem(CSS_KEY);
}
async function remoteConnect(){
  const user=document.getElementById("davUser").value.trim();
  const pass=document.getElementById("davPass").value;
  const error=document.getElementById("syncGateError");
  if(!user||!pass){ error.textContent="请填写账号和应用密码"; return; }
  remoteUser=user; remotePass=pass; error.textContent="连接中…";
  try{
    const res=await remoteRequest("read");
    if(res.status===401||res.status===403) throw new Error("账号或应用密码不正确");
    if(!res.ok){const detail=await res.json().catch(()=>({}));throw new Error(detail.error||"连接失败：HTTP "+res.status);}
    const result=await res.json(); const data=result.state;
    if(!data||(!Array.isArray(data.pages)&&!Array.isArray(data.projects))) throw new Error("手帐文件格式错误");
    remoteRevision=result.revision;
    try{await remoteLoadAiConfig();}catch(e){remoteAiConfig=null;toast("AI 配置读取失败："+e.message);}
    try{await remoteLoadAssets();}catch(e){toast("素材库读取失败："+e.message);}
    library=normalizeLibrary(data); state=activeProject(); resetUndoBaseline();
    remoteReady=true;
    document.getElementById("syncGate").style.display="none";
    document.getElementById("davPass").value="";
    selectedId=null; renderPage(); renderChat(); fitScale(); markSaveEvent("读取"); setSaveStatus("已同步");
  }catch(e){ error.textContent=e.message; remotePass=""; }
}
document.getElementById("davConnect").onclick=remoteConnect;
document.getElementById("davPass").addEventListener("keydown",e=>{if(e.key==="Enter")remoteConnect();});

function remotePersist(){
  remoteDirty=true;
  setSaveStatus(remoteBlocked?"冲突":"未保存",remoteBlocked);
}
async function remoteSave(){
  if(!remoteReady||remoteSaving||remoteBlocked||!remoteDirty)return;
  remoteSaving=true; remoteDirty=false; setSaveStatus("保存中");
  const snapshot=serializeLibrary();
  try{
    const res=await remoteRequest("write",JSON.parse(snapshot));
    if(res.status===409||res.status===412){ remoteBlocked=true;remoteDirty=true;setSaveStatus("冲突",true);alert("另一设备已修改手帐。请先下载备份，再刷新页面查看最新版本。");return; }
    if(res.status===401||res.status===403) throw new Error("坚果云认证失败");
    if(!res.ok){const detail=await res.json().catch(()=>({}));throw new Error(detail.error||"HTTP "+res.status);}
    remoteRevision=(await res.json()).revision; markSaveEvent("保存"); setSaveStatus("已同步");
  }catch(e){remoteDirty=true;setSaveStatus("保存失败",true);toast("同步失败："+e.message);}
  finally{remoteSaving=false;if(remoteDirty&&!remoteBlocked)setSaveStatus("未保存");}
}
window.addEventListener("beforeunload",e=>{if(remoteDirty||remoteSaving){e.preventDefault();e.returnValue="";}});
