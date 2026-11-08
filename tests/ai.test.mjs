import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAi,generateAi,aiUsageCost} from '../pxf/ai.mjs';
import {validate} from '../pxf/engine.mjs';
import {PRESETS} from '../pxf/presets.mjs';
const env={OPENAI_API_KEY:'test-secret',OPENAI_MODEL:'gpt-5.4'};
const reference=validate(PRESETS[0]);
function request({user='unit-test',origin='https://workshop.test',body={},path='/api/ai/remix',method='POST'}={}){return new Request('https://workshop.test'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({request:'색상을 바꿔줘',graph:reference,requestId:crypto.randomUUID(),...body})}:{})});}
const success=()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({graph_json:JSON.stringify({...reference,name:'GPT 결과'}),summary:'색상을 수정했습니다.'})}]}]});
test('model menu intersects API access with compatible priced models',async()=>{
 const r=await handleAi(request({path:'/api/ai/models',method:'GET'}),env,async()=>Response.json({data:[{id:'gpt-6-luna'},{id:'image-only'},{id:'gpt-5.4'}]}));
 const data=await r.json();assert.deepEqual(data.models.map(m=>m.id),['gpt-5.4','gpt-6-luna']);assert.equal(data.models[1].output,0.5);
 assert.equal((await handleAi(request({path:'/api/ai/models',method:'GET',user:null}),env)).status,401);
});
test('selected model reaches Responses and unavailable models never generate',async()=>{
 let calls=0;const fetcher=async(url,options)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'gpt-6-luna'}]});calls++;const body=JSON.parse(options.body);assert.equal(body.model,'gpt-6-luna');assert.equal(body.service_tier,'default');return success();};
 const r=await handleAi(request({user:'selector',body:{model:'gpt-6-luna'}}),env,fetcher);assert.equal(r.status,200);assert.equal((await r.json()).model,'gpt-6-luna');
 assert.equal((await handleAi(request({user:'no-access',body:{model:'gpt-5.4'}}),env,fetcher)).status,502);
 assert.equal((await handleAi(request({body:{model:'injected-model'}}),env,fetcher)).status,400);assert.equal(calls,1);
 assert.equal(aiUsageCost({input_tokens:1000,input_tokens_details:{cached_tokens:500},output_tokens:200},'gpt-5.4').estimatedUsd,0.004375);
});
test('AI API enforces identity, same-origin and input bounds before billing',async()=>{let calls=0;const fetcher=()=>{calls++;return success();};assert.equal((await handleAi(request({user:null}),env,fetcher)).status,401);assert.equal((await handleAi(request({origin:'https://evil.test'}),env,fetcher)).status,403);assert.equal((await handleAi(request({body:{request:'x'.repeat(4001)}}),env,fetcher)).status,400);assert.equal((await handleAi(request({body:{graph:{}}}),env,fetcher)).status,400);assert.equal(calls,0);const status=await (await handleAi(request({path:'/api/ai/status',method:'GET'}),env)).json();assert.deepEqual(status,{ready:true,model:'gpt-5.4'});assert.ok(!JSON.stringify(status).includes('test-secret'));});
test('duplicate requests share one API call and mismatched reuse is rejected',async()=>{let calls=0;const fetcher=async(url,options)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'gpt-5.4'}]});calls++;assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);return success();};const requestId=crypto.randomUUID();const results=await Promise.all([handleAi(request({body:{requestId}}),env,fetcher),handleAi(request({body:{requestId}}),env,fetcher)]);for(const r of results){const body=await r.json();assert.equal(body.graph.name,'GPT 결과');assert.equal(body.graph.renderer,reference.renderer);}assert.equal(calls,1);assert.equal((await handleAi(request({body:{requestId,request:'다른 요청'}}),env,fetcher)).status,409);});
test('AI incomplete, invalid and quota results never return a replacement graph',async()=>{await assert.rejects(generateAi(reference,'edit',env,async()=>Response.json({status:'incomplete',output:[]})),/끝까지/);await assert.rejects(generateAi(reference,'edit',env,async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"graph_json":"{}","summary":"x"}'}]}]})),/규격/);await assert.rejects(generateAi(reference,'edit',env,async()=>Response.json({error:{code:'credit_balance_exhausted',type:'insufficient_quota',message:'test-secret'}},{status:429})),e=>/크레딧/.test(e.message)&&!e.message.includes('test-secret'));});
