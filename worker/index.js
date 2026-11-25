const HTML=__HTML_PAYLOAD__;
const REMOTE=__REMOTE_PAYLOAD__;
const DAV="https://dav.jianguoyun.com/dav/";
const FOLDER=DAV+"JournalStudio/";
const FILE=FOLDER+"journal.json";
const CONFIG=FOLDER+"ai-config.json";
const ASSETS=FOLDER+"assets/";
const ASSET_INDEX=ASSETS+"index.json";
const MAX_ASSET=8*1024*1024;

function basic(user,pass){
  if(!user||!pass||user.length>320||pass.length>320)return null;
  const bytes=new TextEncoder().encode(user+":"+pass);
  let raw="";for(const byte of bytes)raw+=String.fromCharCode(byte);
  return "Basic "+btoa(raw);
}
async function aiAccess(input,env){
  const shared=typeof env?.SILICONFLOW_API_KEY==="string"?env.SILICONFLOW_API_KEY.trim():"";
  if(!shared)return {key:typeof input.key==="string"?input.key.trim():""};
  const auth=basic(input.user||"",input.pass||"");
  if(!auth)return {error:json({error:"请先连接坚果云账号"},401)};
  const check=await dav(DAV,"PROPFIND",auth,null,{Depth:"0"});
  if(!check.ok&&check.status!==207)return {error:json({error:"坚果云账号验证失败"},401)};
  if(!env.AI_USER_LIMITER||!env.AI_GLOBAL_LIMITER)return {error:json({error:"管理员尚未配置 AI 用量保护"},503)};
  const userKey=await hash(new TextEncoder().encode(String(input.user).trim().toLowerCase()));
  const [userLimit,globalLimit]=await Promise.all([env.AI_USER_LIMITER.limit({key:userKey}),env.AI_GLOBAL_LIMITER.limit({key:"all-users"})]);
  if(!userLimit.success||!globalLimit.success)return {error:json({error:"AI 用量达到本分钟上限，请稍后重试"},429)};
  return {key:shared};
}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...headers}});}
async function collectAiStream(body){
  if(!body)throw new Error("模型没有返回流式正文");
  const reader=body.getReader(),decoder=new TextDecoder();
  let pending="",content="",finishReason=null;
  const consume=line=>{
    if(!line.startsWith("data:"))return;
    const value=line.slice(5).trim();
    if(!value||value==="[DONE]")return;
    let event;try{event=JSON.parse(value);}catch{return;}
    if(event.error)throw new Error(String(event.error.message||event.error).slice(0,180));
    const choice=event.choices?.[0],part=choice?.delta?.content;
    if(typeof part==="string")content+=part;
    if(choice?.finish_reason)finishReason=choice.finish_reason;
  };
  for(;;){
    const {value,done}=await reader.read();
    pending+=done?decoder.decode():decoder.decode(value,{stream:true});
    let end;while((end=pending.indexOf("\n"))>=0){consume(pending.slice(0,end).trim());pending=pending.slice(end+1);}
    if(done)break;
  }
  if(pending.trim())consume(pending.trim());
  if(!content.trim()||finishReason==="length")throw new Error("模型未返回完整设计正文");
  return {choices:[{message:{role:"assistant",content},finish_reason:finishReason}]};
}
function allowedCatalogImageUrl(value){
  try{
    const target=new URL(value),host=target.hostname.toLowerCase();
    return target.protocol==="https:"&&!target.username&&!target.password&&!target.port&&["wikimedia.org","artic.edu","metmuseum.org","clevelandart.org","micr.io","loc.gov","si.edu","openverse.org"].some(domain=>host===domain||host.endsWith("."+domain));
  }catch{return false;}
}
function imageMime(bytes){
  const h=new Uint8Array(bytes.slice(0,12));
  return h[0]===0x89&&h[1]===0x50&&h[2]===0x4e&&h[3]===0x47?"image/png":h[0]===0xff&&h[1]===0xd8?"image/jpeg":String.fromCharCode(...h.slice(0,4))==="RIFF"&&String.fromCharCode(...h.slice(8,12))==="WEBP"?"image/webp":"";
}
async function hash(bytes){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return '"'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("")+'"';
}
async function dav(url,method,auth,body=null,headers={}){
  return fetch(url,{method,headers:{Authorization:auth,...headers},body,redirect:"manual"});
}
async function current(auth){
  const response=await dav(FILE,"GET",auth);
  if(response.status===404)return {raw:new TextEncoder().encode('{"pages":[],"cur":0}'),exists:false,remoteETag:null};
  if(!response.ok)return {error:response.status};
  return {raw:await response.arrayBuffer(),exists:true,remoteETag:response.headers.get("ETag")};
}
async function assetApi(input,auth){
  const action=input.action;
  const indexRes=await dav(ASSET_INDEX,"GET",auth);
  if(indexRes.status!==404&&!indexRes.ok)return json({error:"读取素材索引失败"},502);
  let items=[];
  if(indexRes.ok){try{items=JSON.parse(await indexRes.text()).items;if(!Array.isArray(items))throw 0;}catch{return json({error:"素材索引格式错误"},502);}}
  if(action==="assets-list")return json({items});
  if(action==="assets-get"){
    const item=items.find(x=>x.id===input.id);
    if(!item)return json({error:"素材不存在"},404);
    const file=await dav(ASSETS+item.id+"."+item.ext,"GET",auth);
    if(!file.ok)return json({error:"读取素材文件失败"},502);
    return new Response(file.body,{headers:{"Content-Type":item.mime,"Cache-Control":"no-store"}});
  }
  if(action!=="assets-add"&&action!=="assets-update"&&action!=="assets-delete")return json({error:"不支持此请求"},400);
  if(action==="assets-add"){
    const a=input.asset||{};
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(a.id||"")||!/^image\/(jpeg|png|webp)$/.test(a.mime||"")||typeof a.data!=="string"||a.data.length>MAX_ASSET*1.38)return json({error:"素材格式或大小不符合要求"},400);
    let bytes;try{bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0));}catch{return json({error:"图片编码错误"},400);}
    if(bytes.byteLength>MAX_ASSET)return json({error:"单个素材不能超过 8 MB"},413);
    const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[a.mime];
    const base={id:a.id,ext,mime:a.mime,name:String(a.name||"未命名素材").slice(0,120),tags:Array.isArray(a.tags)?a.tags.slice(0,20).map(t=>String(t).slice(0,32)):[],aiTags:Array.isArray(a.aiTags)?a.aiTags.slice(0,16).map(t=>String(t).slice(0,32)):[],description:String(a.description||"").slice(0,240),color:/^#[0-9a-fA-F]{6}$/.test(a.color||"")?a.color:"#cccccc",sourceUrl:String(a.sourceUrl||"").slice(0,500),license:String(a.license||"").slice(0,120),author:String(a.author||"").slice(0,120),createdAt:new Date().toISOString()};
    if(items.some(x=>x.id===base.id))return json({error:"素材 ID 已存在"},409);
    for(const folder of [FOLDER,ASSETS]){const made=await dav(folder,"MKCOL",auth);if(!made.ok&&made.status!==405)return json({error:"建立素材目录失败"},502);}
    const uploaded=await dav(ASSETS+base.id+"."+ext,"PUT",auth,bytes,{"Content-Type":a.mime,"If-None-Match":"*"});
    if(!uploaded.ok)return json({error:"上传素材失败"},502);
    items.push(base);
  }else if(action==="assets-update"){
    const item=items.find(x=>x.id===input.id);
    if(!item)return json({error:"素材不存在"},404);
    const patch=input.patch||{};
    if(patch.name!==undefined)item.name=String(patch.name).slice(0,120);
    if(Array.isArray(patch.tags))item.tags=patch.tags.slice(0,20).map(t=>String(t).slice(0,32));
    if(Array.isArray(patch.aiTags))item.aiTags=patch.aiTags.slice(0,16).map(t=>String(t).slice(0,32));
    if(patch.description!==undefined)item.description=String(patch.description).slice(0,240);
    if(/^#[0-9a-fA-F]{6}$/.test(patch.color||""))item.color=patch.color;
  }else{
    const position=items.findIndex(x=>x.id===input.id);
    if(position<0)return json({error:"素材不存在"},404);
    const [deleted]=items.splice(position,1);
    input.deletedFile=ASSETS+deleted.id+"."+deleted.ext;
  }
  const headers={"Content-Type":"application/json"};
  if(indexRes.ok&&indexRes.headers.get("ETag"))headers["If-Match"]=indexRes.headers.get("ETag");
  else if(indexRes.status===404)headers["If-None-Match"]="*";
  const saved=await dav(ASSET_INDEX,"PUT",auth,JSON.stringify({version:1,items}),headers);
  if(saved.status===409||saved.status===412)return json({error:"素材库被另一设备修改，请刷新后重试"},409);
  if(!saved.ok)return json({error:"保存素材索引失败"},502);
  if(action==="assets-delete"){
    const removed=await dav(input.deletedFile,"DELETE",auth);
    if(!removed.ok&&removed.status!==404)return json({error:"素材索引已删除，但图片文件删除失败，请稍后清理坚果云文件"},502);
  }
  return json({ok:true,items});
}
async function api(request){
  if(request.method!=="POST")return json({error:"不支持此请求"},405);
  let input;try{input=await request.json();}catch{return json({error:"请求格式错误"},400);}
  const auth=basic(input.user||"",input.pass||"");
  if(!auth)return json({error:"请输入坚果云账号和应用密码"},401);
  const check=await dav(DAV,"PROPFIND",auth,null,{Depth:"0"});
  if(check.status===401||check.status===403)return json({error:"坚果云认证失败"},401);
  if(!check.ok&&check.status!==207)return json({error:"坚果云 WebDAV 检查返回 HTTP "+check.status},502);
  if(typeof input.action==="string"&&input.action.startsWith("assets-"))return assetApi(input,auth);
  if(input.action==="read-config"){
    const found=await dav(CONFIG,"GET",auth);
    if(found.status===404)return json({config:null});
    if(!found.ok)return json({error:"读取 AI 配置失败"},502);
    try{return json({config:JSON.parse(await found.text())});}
    catch{return json({error:"AI 配置文件格式错误"},502);}
  }
  if(input.action==="write-config"){
    const key=input.config?.key;
    if(typeof key!=="string"||!key.trim()||key.length>512)return json({error:"请填写有效的 API Key"},400);
    const folder=await dav(FOLDER,"MKCOL",auth);
    if(!folder.ok&&folder.status!==405)return json({error:"无法建立手帐文件夹"},502);
    const saved=await dav(CONFIG,"PUT",auth,JSON.stringify({key:key.trim()}),{"Content-Type":"application/json"});
    if(!saved.ok)return json({error:"保存 AI 配置失败"},502);
    return json({ok:true});
  }
  const previous=await current(auth);
  if(previous.error)return json({error:"读取手帐文件返回 HTTP "+previous.error},previous.error===401?401:502);
  const revision=await hash(previous.raw);
  if(input.action==="read")return json({state:JSON.parse(new TextDecoder().decode(previous.raw)),revision});
  if(input.action!=="write")return json({error:"不支持此请求"},400);
  if(input.revision!==revision)return json({error:"同步冲突"},409);
  const raw=new TextEncoder().encode(JSON.stringify(input.state));
  if(raw.byteLength>20*1024*1024)return json({error:"手帐文件超过 20 MB"},413);
  const state=input.state;
  const valid=state&&(Array.isArray(state.pages)||Array.isArray(state.projects)&&state.projects.length>0&&state.projects.every(p=>Array.isArray(p.pages)&&Array.isArray(p.aiChats)));
  if(!valid)return json({error:"手帐格式错误"},400);
  const folder=await dav(FOLDER,"MKCOL",auth);
  if(!folder.ok&&folder.status!==405)return json({error:"无法建立手帐文件夹"},502);
  if(previous.exists){
    const backupFolder=await dav(FOLDER+"backups/","MKCOL",auth);
    if(!backupFolder.ok&&backupFolder.status!==405)return json({error:"无法建立备份文件夹"},502);
    const name="journal-"+new Date().toISOString().replace(/[:.]/g,"-")+"-"+crypto.randomUUID().slice(0,8)+".json";
    const backup=await dav(FOLDER+"backups/"+name,"PUT",auth,previous.raw,{"Content-Type":"application/json"});
    if(!backup.ok)return json({error:"备份失败，未覆盖原文件"},502);
  }
  const headers={"Content-Type":"application/json"};
  if(previous.remoteETag)headers["If-Match"]=previous.remoteETag;
  else headers["If-None-Match"]="*";
  const saved=await dav(FILE,"PUT",auth,raw,headers);
  if(saved.status===409||saved.status===412)return json({error:"同步冲突"},409);
  if(!saved.ok)return json({error:"写入坚果云失败"},502);
  return json({ok:true,revision:await hash(raw)});
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/"||url.pathname==="/index.html")return new Response(HTML,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
  if(url.pathname==="/remote.js")return new Response(REMOTE,{headers:{"Content-Type":"text/javascript; charset=utf-8"}});
  if(url.pathname==="/api/ai-status"&&request.method==="GET")return json({shared:!!(env?.SILICONFLOW_API_KEY&&env?.AI_USER_LIMITER&&env?.AI_GLOBAL_LIMITER)});
  if(url.pathname==="/api/catalog-smith"&&request.method==="POST"){
    try{
      const input=await request.json();
      if(typeof input.q!=="string"||!input.q.trim()||input.q.length>120||!Number.isInteger(input.start)||input.start<0||input.start>1200)return json({error:"素材搜索参数无效"},400);
      if(!env?.SMITHSONIAN_API_KEY)return json({error:"史密森学会素材服务尚未配置"},503);
      const cacheKey=new Request(new URL("/api/catalog-smith?"+new URLSearchParams({q:input.q,start:String(input.start)}),url).href);
      const cached=await caches.default.match(cacheKey);
      if(cached)return cached;
      const params=new URLSearchParams({q:input.q+" AND online_media_type:Images AND media_usage:CC0",start:String(input.start),rows:"20",api_key:env.SMITHSONIAN_API_KEY});
      const upstream=await fetch("https://api.si.edu/openaccess/api/v1.0/search?"+params);
      const response=new Response(await upstream.text(),{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":upstream.ok?"public, max-age=3600":"no-store"}});
      if(upstream.ok)await caches.default.put(cacheKey,response.clone());
      return response;
    }catch(error){return json({error:"史密森学会连接失败："+(error?.name||"网络错误")},502);}
  }
  if(url.pathname==="/api/catalog-image"&&request.method==="POST"){
    try{
      const input=await request.json();let target=input.url;
      if(typeof target!=="string"||target.length>2000||!allowedCatalogImageUrl(target))return json({error:"此图片来源暂不支持下载"},400);
      let upstream;
      for(let n=0;n<3;n++){
        upstream=await fetch(target,{redirect:"manual",headers:{"User-Agent":"JournalStudio/1.0 (public art image download)"}});
        if(![301,302,303,307,308].includes(upstream.status))break;
        target=new URL(upstream.headers.get("Location")||"",target).href;
        if(!allowedCatalogImageUrl(target))return json({error:"图片下载跳转到了不支持的来源"},400);
      }
      if(!upstream?.ok)return json({error:"图片来源无法下载（HTTP "+(upstream?.status||0)+"）"},502);
      if(Number(upstream.headers.get("Content-Length"))>MAX_ASSET)return json({error:"图片超过 8 MB"},413);
      const bytes=await upstream.arrayBuffer();if(bytes.byteLength>MAX_ASSET)return json({error:"图片超过 8 MB"},413);
      const mime=imageMime(bytes);if(!mime)return json({error:"下载结果不是 JPG、PNG 或 WebP 图片"},502);
      return new Response(bytes,{headers:{"Content-Type":mime,"Cache-Control":"no-store"}});
    }catch(error){return json({error:"图片下载失败："+(error?.name||"网络错误")},502);}
  }
  if(url.pathname==="/api/ai"&&request.method==="POST"){
    try{
      const input=await request.json();
      const access=await aiAccess(input,env);if(access.error)return access.error;const aiKey=access.key;
      if(!aiKey||!Array.isArray(input.messages))return json({error:"AI 服务尚未配置，请联系管理员设置统一 API Key"},503);
      const vision=input.purpose==="vision";
      const planning=input.purpose==="design-plan";
      if(vision){
        const images=input.messages.flatMap(m=>Array.isArray(m.content)?m.content.filter(p=>p.type==="image_url"):[]);
        if(images.length<1||images.length>6||input.messages.length>2||JSON.stringify(input.messages).length>1800000||images.some(p=>p.image_url?.detail!=="low"||!(/^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]{1,300000}|https:\/\/upload\.wikimedia\.org\/[^\s]+)$/.test(p.image_url?.url||""))))return json({error:"视觉筛选最多接收 6 张低清缩略图"},400);
      }
      const settings=vision?{max_tokens:350,temperature:0,enable_thinking:false}:input.purpose==="design-layout"?{max_tokens:180,temperature:0,enable_thinking:false,stop:["\n"]}:planning?{max_tokens:650,enable_thinking:false,response_format:{type:"json_object"}}:input.purpose==="design-render"?{max_tokens:1300,enable_thinking:false,response_format:{type:"json_object"}}:{max_tokens:3000,enable_thinking:false};
      const upstream=await fetch("https://api.siliconflow.cn/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+aiKey,"Content-Type":"application/json"},body:JSON.stringify({model:vision?"Qwen/Qwen3.5-35B-A3B":"XingChenAGI/Xing4.0-29B",messages:input.messages,stream:!vision,...settings})});
      if(!upstream.ok||vision)return new Response(await upstream.text(),{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
      return json(await collectAiStream(upstream.body));
    }catch(error){return json({error:"AI 接口连接失败："+String(error?.message||error?.name||"网络错误").slice(0,180)},502);}
  }
  if(url.pathname==="/api/kolors"&&request.method==="POST"){
    try{
      const input=await request.json();
      const access=await aiAccess(input,env);if(access.error)return access.error;const aiKey=access.key;
      if(!aiKey)return json({error:"AI 服务尚未配置，请联系管理员设置统一 API Key"},503);
      const hasImage=input.image!==undefined;
      if(typeof input.prompt!=="string"||!input.prompt.trim()||input.prompt.length>1500||(hasImage&&(typeof input.image!=="string"||input.image.length>1500000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.image))))return json({error:"图片生成请求格式无效"},400);
      const upstream=await fetch("https://api.siliconflow.cn/v1/images/generations",{method:"POST",headers:{"Authorization":"Bearer "+aiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"Kwai-Kolors/Kolors",prompt:input.prompt,...(hasImage?{image:input.image}:{}),image_size:"1024x1024",num_inference_steps:20,guidance_scale:7.5})});
      const result=await upstream.json();
      if(!upstream.ok)return json({error:result.message||result.error||"Kolors 生成失败"},upstream.status);
      const imageUrl=result.images?.[0]?.url;
      if(typeof imageUrl!=="string"||!imageUrl.startsWith("https://"))return json({error:"Kolors 未返回可下载图片"},502);
      const image=await fetch(imageUrl);
      if(!image.ok||Number(image.headers.get("Content-Length"))>MAX_ASSET)return json({error:"生成图片下载失败或超过 8 MB"},502);
      const bytes=await image.arrayBuffer();
      if(bytes.byteLength>MAX_ASSET)return json({error:"生成图片超过 8 MB"},413);
      const mime=imageMime(bytes);
      if(!mime)return json({error:"生成结果不是受支持的图片"},502);
      return new Response(bytes,{headers:{"Content-Type":mime,"Cache-Control":"no-store"}});
    }catch(error){return json({error:"Kolors 请求失败："+(error?.name||"网络错误")},502);}
  }
  if(url.pathname==="/api/state"){
    try{return await api(request);}catch(error){return json({error:"坚果云请求失败："+(error?.name||"网络错误")},502);}
  }
  return new Response("Not found",{status:404});
}};
