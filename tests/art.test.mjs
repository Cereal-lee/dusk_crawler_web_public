import test from 'node:test';
import assert from 'node:assert/strict';
import {handleArt,artPng} from '../shared/art_api.mjs';
import {artConfig,artRecipe} from '../shared/art_config.mjs';
import {chromaKey,alphaBounds,godotArtFrames} from '../shared/art_process.mjs';
import {localDatabase} from './local_database.mjs';
import {png} from '../pxf/png.mjs';
import {loadAssets} from '../site_assets.mjs';
import {makeWorker} from '../worker.mjs';
const id='12345678-1234-1234-1234-123456789abc',origin='https://workshop.test';
const pngData=Buffer.from(png(2,2,new Uint8Array(16).fill(255))).toString('base64');
function fixture(){const db=localDatabase(),objects=new Map();let generations=0;const env={DB:db,BUCKET:{async put(k,v){objects.set(k,new Uint8Array(v));},async get(k){const b=objects.get(k);return b?{body:b,arrayBuffer:async()=>b.buffer}:null;},async delete(k){objects.delete(k);}},OPENAI_API_KEY:'test'};
 const fetcher=async(url,opts)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'gpt-image-2.5-flare'}]});if(opts.method==='POST'){generations++;const request=JSON.parse(opts.body);assert.equal(request.background,true);assert.equal(request.tools[0].model,'gpt-image-2.5-flare');return Response.json({id:'resp_test',status:'queued'});}return Response.json({status:'completed',output:[{type:'image_generation_call',result:pngData}]});};
 const call=(path,method='GET',body,user='owner',from=origin)=>handleArt(new Request(origin+'/api/art'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Origin:from,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,fetcher,{});
 return {db,call,objects,generations:()=>generations};}
const input={id,kind:'image',prompt:'A sword',model:'gpt-image-2.5-flare'};
test('completed artwork import preserves recipe, stays account-scoped and never generates',async()=>{
 const f=fixture();try {
  const body={id,config:input,originalPng:pngData,processedPng:pngData,provenance:{source:'workshop',requestPrompt:'test',generationPrompt:'expanded test',engine:'Blender',parameters:{width:2,height:2,paletteLimit:16},script:{name:'finish.py',text:'print("recipe")'}}};
  assert.equal((await f.call('/import','POST',body,null)).status,401);
  assert.equal((await f.call('/import','POST',body,'owner','https://other.test')).status,403);
  const first=await f.call('/import','POST',body);assert.equal(first.status,201);
  const item=(await first.json()).item;assert.equal(item.processed,true);assert.equal(item.status,'completed');assert.equal(item.export.provenance.script.text,'print("recipe")');
  assert.equal((await f.call('/import','POST',body)).status,201);assert.equal((await (await f.call('')).json()).items.length,1);assert.equal(f.generations(),0);
  assert.equal((await f.call('/'+id+'/original','GET',undefined,'other')).status,404);
  assert.equal((await f.call('/import','POST',{...body,config:{...input,prompt:'changed'}})).status,400);
  assert.equal((await f.call('/import','POST',{...body,id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',provenance:{...body.provenance,parameters:{width:3,height:2}}})).status,400);
  assert.equal((await (await f.call('')).json()).items[0].config.prompt,'A sword');
 }finally{f.db.close();}
});
test('art generation persists, deduplicates and finalizes exactly one request',async()=>{const f=fixture();try{
 assert.equal((await f.call('','POST',input,null)).status,401);
 assert.equal((await f.call('','POST',input,'owner','https://other.test')).status,403);
 assert.equal((await f.call('','POST',{...input,model:'invalid'})).status,400);assert.equal(f.generations(),0);
 const [first,second]=await Promise.all([f.call('','POST',input),f.call('','POST',input)]);assert.ok([200,202].includes(first.status));assert.ok([200,202].includes(second.status));assert.equal(f.generations(),1);
 assert.equal((await f.call('','POST',{...input,prompt:'different'})).status,409);
 assert.equal((await f.call('/'+id+'/poll','POST',{},'other')).status,404);
 const done=await (await f.call('/'+id+'/poll','POST',{})).json();assert.equal(done.item.status,'completed');assert.equal(f.objects.size,1);
 assert.equal((await f.call('/'+id+'/original','GET',undefined,'other')).status,404);
 assert.equal((await f.call('/'+id+'/original')).headers.get('Content-Type'),'image/png');
 const saved=await (await f.call('/'+id+'/processed','POST',{png:pngData,width:2,height:2})).json();assert.equal(saved.item.processed,true);assert.equal(f.objects.size,2);
 await f.call('/'+id,'PATCH',{title:'new title'});assert.equal((await (await f.call('')).json()).items[0].title,'new title');
 await f.call('/'+id,'DELETE');assert.equal(f.objects.size,0);
}finally{f.db.close();}});
test('references are account-scoped and invalid PNG bytes never reach storage',async()=>{const f=fixture();try{assert.equal((await f.call('/upload','POST',{png:'not-png'})).status,400);assert.equal(f.objects.size,0);const uploaded=await (await f.call('/upload','POST',{png:pngData,title:'ref'})).json();assert.equal(uploaded.item.status,'uploaded');assert.equal((await f.call('','POST',{...input,refs:[uploaded.item.id]},'other')).status,400);assert.equal(f.generations(),0);}finally{f.db.close();}});
test('SD recipe preserves upstream grid, guides and animation size; item alpha and Godot exports',()=>{assert.throws(()=>artConfig({...input,kind:'sd'}),/기준 캐릭터/);const cfg=artConfig({...input,kind:'sd',refs:[id],stage:'animation',anim:'walk_basic',proportion:'mini'}),recipe=artRecipe(cfg);assert.equal(recipe.grid.frames,8);assert.equal(recipe.grid.cols,4);assert.ok(recipe.guide.startsWith('/sd/guides/'));assert.match(recipe.prompt,/MOTION LAW/);assert.equal(artRecipe({...cfg,stage:'base'}).grid.frames,5);const keyed=chromaKey(new Uint8ClampedArray([0,255,0,255,100,70,20,255]),'green');assert.equal(keyed[3],0);assert.equal(keyed[7],255);assert.deepEqual(alphaBounds(keyed,2,1),{x:1,y:0,w:1,h:1});assert.match(godotArtFrames({export:{grid:recipe.grid}},'walk'),/region = Rect2\(768, 256, 256, 256\)/);assert.equal(artPng(pngData).length>0,true);});
test('all five workshops and legacy asset URLs are served; private code is not',async()=>{const assets=await loadAssets(),worker=makeWorker(assets);for(const path of ['/','/pxf/','/bgm/','/image/','/item/','/sd/','/bgm.html','/app.mjs'])assert.equal((await worker.fetch(new Request(origin+path))).status,200,path);for(const path of ['/original/catalog.json','/pxf/original/catalog.json','/.env.local','/shared/art_api.mjs','/bgm/runtime/.bridge_key'])assert.equal((await worker.fetch(new Request(origin+path))).status,404,path);});
