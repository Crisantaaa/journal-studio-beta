import assert from "node:assert/strict";
import worker from "../dist/worker.js";

globalThis.fetch=async (url,options={})=>{
  assert.equal(new URL(url).pathname,"/v1/chat/completions");
  const request=JSON.parse(options.body);
  assert.equal(request.stream,true);
  assert.equal(request.model,"XingChenAGI/Xing4.0-29B");
  if(request.messages[0].content==="plan"){
    assert.equal(request.max_tokens,650);
    assert.equal(request.enable_thinking,false);
    assert.deepEqual(request.response_format,{type:"json_object"});
  }else if(request.messages[0].content==="layout"){
    assert.equal(request.max_tokens,180);
    assert.equal(request.enable_thinking,false);
    assert.deepEqual(request.stop,["\n"]);
  }else if(request.messages[0].content==="scene"){
    assert.equal(request.max_tokens,1300);
    assert.equal(request.enable_thinking,false);
    assert.deepEqual(request.response_format,{type:"json_object"});
  }else{
    assert.equal(request.max_tokens,3000);
    assert.equal(request.enable_thinking,false);
  }
  return new Response('data: {"choices":[{"delta":{"content":"设计"}}]}\n\ndata: {"choices":[{"delta":{"content":"完成"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{"Content-Type":"text/event-stream"}});
};
const response=await worker.fetch(new Request("https://test.invalid/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"test-key",messages:[{role:"user",content:"设计"}]})}));
assert.equal(response.status,200);
const result=await response.json();
assert.equal(result.choices[0].message.content,"设计完成");
assert.equal(result.choices[0].finish_reason,"stop");
const planned=await worker.fetch(new Request("https://test.invalid/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"test-key",purpose:"design-plan",messages:[{role:"user",content:"plan"}]})}));
assert.equal(planned.status,200);
const scene=await worker.fetch(new Request("https://test.invalid/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"test-key",purpose:"design-render",messages:[{role:"user",content:"scene"}]})}));
assert.equal(scene.status,200);
const layout=await worker.fetch(new Request("https://test.invalid/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"test-key",purpose:"design-layout",messages:[{role:"user",content:"layout"}]})}));
assert.equal(layout.status,200);
console.log("Worker AI stream checks passed");
