import test from 'node:test';import assert from 'node:assert/strict';import {inflateSync} from 'node:zlib';
import {validate,renderFrame,sheet,godotResource} from '../pxf/engine.mjs';import {PRESETS} from '../pxf/presets.mjs';import {png} from '../pxf/png.mjs';import {handleMcp,makeWorker} from '../worker.mjs';
test('all presets render deterministically, contain visible pixels and have correctly packed sheets',()=>{for(const preset of PRESETS){const original=JSON.stringify(preset),g=validate(preset);const a=renderFrame(g,5),b=renderFrame(g,5);assert.deepEqual(a,b);assert.ok(a.some((v,i)=>i%4===3&&v>0),g.name);const s=sheet(g);assert.equal(s.pixels.length,s.width*s.height*4);for(let y=0;y<g.settings.size;y++)assert.deepEqual(s.pixels.subarray((y*s.width+5*g.settings.size)*4,(y*s.width+6*g.settings.size)*4),a.subarray(y*g.settings.size*4,(y+1)*g.settings.size*4));assert.equal(JSON.stringify(preset),original);}});
test('reject invalid graphs: cycle, unknown node, duplicate input, limits and malformed animation',()=>{let g=structuredClone(PRESETS[0]);g.nodes[0].type='Unknown';assert.throws(()=>validate(g),/지원하지/);g=structuredClone(PRESETS[0]);g.links.push({f:'palette',t:'palette',p:0});assert.throws(()=>validate(g));g=structuredClone(PRESETS[0]);g.nodes[0].params.radius={k:[]};assert.throws(()=>validate(g));g=structuredClone(PRESETS[0]);g.settings.frames=1000;assert.throws(()=>validate(g));g=structuredClone(PRESETS[0]);g.links=[];assert.throws(()=>validate(g));});
test('PNG round trip produces matching RGBA scanlines',()=>{const s=sheet(PRESETS[1]),bytes=png(s.width,s.height,s.pixels);assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);let pos=8,idat=[];while(pos<bytes.length){let len=new DataView(bytes.buffer,bytes.byteOffset+pos,4).getUint32(0),type=new TextDecoder().decode(bytes.slice(pos+4,pos+8));if(type==='IDAT')idat.push(bytes.slice(pos+8,pos+8+len));pos+=len+12;}const raw=inflateSync(Buffer.concat(idat));for(let y=0;y<s.height;y++){assert.equal(raw[y*(s.width*4+1)],0);assert.deepEqual([...raw.subarray(y*(s.width*4+1)+1,(y+1)*(s.width*4+1))],[...s.pixels.subarray(y*s.width*4,(y+1)*s.width*4)]);}});
test('Godot export has matching frame count, regions, texture filename and fractional FPS',()=>{let g=structuredClone(PRESETS[0]);g.settings.fps=12.5;const r=godotResource(g,'efx_test');assert.equal((r.match(/type="AtlasTexture"/g)||[]).length,g.settings.frames);assert.match(r,/res:\/\/art\/combat_vfx\/efx_test.png/);assert.match(r,/region = Rect2\(448, 128, 64, 64\)/);assert.match(r,/"speed": 12.5/);});
async function rpc(method,params){return (await handleMcp(new Request('https://workshop.example/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}))).json();}
test('MCP discovery, tools, validation, image and import URL round trip',async()=>{assert.ok((await rpc('server/discover')).result.supportedVersions.includes('2026-07-28'));assert.equal((await rpc('tools/list')).result.tools.length,3);assert.ok((await rpc('tools/call',{name:'pxf_validate',arguments:{graph:{}}})).result.isError);const result=(await rpc('tools/call',{name:'pxf_render',arguments:{graph:PRESETS[0],frame:5}})).result;assert.equal(result.content[0].mimeType,'image/png');const info=JSON.parse(result.content[1].text);assert.equal(JSON.parse(Buffer.from(info.importUrl.split('#graph=')[1],'base64').toString()).name,PRESETS[0].name);});
test('static server denies arbitrary paths and provides script MIME',async()=>{const worker=makeWorker({'/app.mjs':{type:'text/javascript',body:'export {}'}});assert.equal((await worker.fetch(new Request('https://x/.env'))).status,404);assert.equal((await worker.fetch(new Request('https://x/app.mjs'))).headers.get('Content-Type'),'text/javascript');});
import {DEFS} from '../pxf/engine.mjs';
import {makeGraph} from '../pxf/presets.mjs';
import {loadAssets} from '../site_assets.mjs';
test('independent engine edits and renders advanced graphs without catalog fixtures',async()=>{
 const raw={...makeGraph('Dusk 테스트 · 파편','Particles',{seed:42,count:12},['#332244','#bb88dd','#ffffff']),renderer:'pxf@1',id:'user_roundtrip'};
 const g=validate(raw);assert.equal(Object.keys(DEFS).length,29);
 assert.deepEqual(validate(JSON.parse(JSON.stringify(g))),g);
 const before=sheet(g).pixels;assert.ok(before.some((v,i)=>i%4===3&&v>0));
 g.nodes[0].params.count=23;assert.notDeepEqual(sheet(g).pixels,before);
 const result=(await rpc('tools/call',{name:'pxf_render',arguments:{graph:g,frame:4}})).result;
 assert.ok(!result.isError);assert.equal(result.content[0].mimeType,'image/png');
});
test('Git asset allowlist excludes the original catalog even when private files exist locally',async()=>{
 const assets=await loadAssets(),worker=makeWorker(assets);
 assert.equal(assets['/pxf/pxf_engine.mjs'],undefined);
 assert.ok(assets['/pxf/dusk_engine.mjs']);
 assert.ok(assets['/pxf/node_contract.mjs']);
 assert.ok(assets['/pxf/pxf_schema.mjs']);
 assert.equal(PRESETS.length,12);
 assert.ok(!Object.keys(assets).some(path=>path.startsWith('/original/')||path.startsWith('/pxf/original/')));
 assert.doesNotMatch(assets['/pxf/app.mjs'].body,/loadOriginals|original\/catalog/);
 assert.doesNotMatch(assets['/pxf/index.html'].body,/원본 165개/);
 for(const path of ['/original/catalog.json','/pxf/original/catalog.json','/pxf/import_original.py','/pxf/render_original.mjs'])assert.equal((await worker.fetch(new Request('https://workshop.test'+path))).status,404);
 const list=(await rpc('tools/list')).result.tools.map(t=>t.name);
 assert.deepEqual(list,['pxf_guide','pxf_validate','pxf_render']);
 assert.ok((await rpc('tools/call',{name:'pxf_original_list'})).result.isError);
});
