import test from 'node:test';
import assert from 'node:assert/strict';
import Dusk from '../pxf/dusk_engine.mjs';
import {validate,renderFrame,renderFrames,DEFS} from '../pxf/engine.mjs';
import {loadAssets} from '../site_assets.mjs';

function fixture(type,params={}){
 const source={id:'source',type:'Shape',params:{shape:'circle',size:12}},mask={id:'mask',type:'Gradient',params:{type:'radial',radius:24}};
 const nodes=[source,mask,{id:'test',type,params},{id:'out',type:'Output',params:{alpha:'soft'}}],links=[];
 for(let p=0;p<DEFS[type].inputs;p++)links.push({f:p?'mask':'source',t:'test',p});
 if(type==='Output'){nodes.pop();nodes[2].id='out';for(const l of links)l.t='out';}
 else links.push({f:'test',t:'out',p:0});
 return {renderer:'dusk-public@1',name:'엔진 검증 '+type,settings:{size:32,frames:8,fps:24,loop:false},nodes,links};
}

test('all 29 node types evaluate on their own, with finite premultiplied pixels and repeatable output',()=>{
 assert.equal(Object.keys(DEFS).length,29);
 for(const type of Object.keys(DEFS)){
  const g=validate(fixture(type)),ev=new Dusk.Evaluator(g),raw=ev.run('out',3);
  assert.ok(raw.every(Number.isFinite),type);assert.equal(raw.length,32*32*4);
  const a=renderFrame(g,3),b=renderFrame(g,3);assert.deepEqual(a,b,type);
  assert.ok(a.some((v,i)=>i%4===3&&v>0),type+' must render visible output');
 }
});
test('animation, backward import and saved IDs survive migration without mutating the source',()=>{
 const g=fixture('Shape',{size:{k:[[0,2],[7,12]]}});g.renderer='pxf@1';g.id='user_migration';
 const source=structuredClone(g),next=validate(g);assert.equal(next.renderer,'dusk-public@1');assert.equal(next.id,g.id);assert.deepEqual(g,source);
 assert.deepEqual(validate(JSON.parse(JSON.stringify(next))),next);
 assert.notDeepEqual(renderFrame(next,0),renderFrame(next,7));
});
test('temporal nodes use preceding frames and respect loop boundaries',()=>{
 const g=fixture('Echo',{copies:1,step:1,decay:1});
 g.nodes[0].params={shape:'circle',size:2,x:{k:[[0,.2],[7,.8]]}};
 const a=renderFrame(g,0);g.settings.loop=true;const b=renderFrame(g,0);assert.notDeepEqual(a,b);
 assert.deepEqual(renderFrames(g)[0],renderFrame(g,0));
});
test('particle history is stable and changes in seed, masks, transforms and palette affect the raster',()=>{
 for(const [type,key,a,b] of [['Particles','seed',42,43],['Transform','tx',0,5],['Mask','mode','multiply','cutout'],['Palette','colors',['#ff0000'],['#0000ff']]]){
  const g=fixture(type,{[key]:a}),before=renderFrame(g,3);g.nodes.find(n=>n.id==='test').params[key]=b;assert.notDeepEqual(before,renderFrame(g,3),type);
 }
 const g=validate(fixture('Particles',{seed:14,emit:'stream',loop:true})),ev=new Dusk.Evaluator(g);
 const before=Dusk.renderFrame(ev,g,2);Dusk.renderFrame(ev,g,6);assert.deepEqual(before,Dusk.renderFrame(ev,g,2));
});
test('the runtime no longer serves or imports the retired renderer',async()=>{
 const assets=await loadAssets();assert.equal(assets['/pxf/pxf_engine.mjs'],undefined);assert.equal(assets['/pxf_engine.mjs'],undefined);
 for(const path of ['/pxf/engine.mjs','/pxf/pxf_schema.mjs','/pxf/dusk_engine.mjs'])assert.doesNotMatch(assets[path].body,/from ['"].*pxf_engine\.mjs/);
});
