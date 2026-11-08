// Synthetic regression graphs; no catalog or personal artwork is included.
import {DEFS} from '../pxf/engine.mjs';
function graph(type,params,tag=type){
 const nodes=[{id:'image',type:'Shape',params:{shape:'circle',size:9}},{id:'field',type:'Gradient',params:{type:'radial',radius:18}},{id:'check',type,params},{id:'out',type:'Output',params:{alpha:'soft'}}];
 const links=Array.from({length:DEFS[type].inputs},(_,p)=>({f:p?'field':'image',t:'check',p}));
 if(type==='Output'){nodes.pop();nodes[2].id='out';for(const edge of links)edge.t='out';}else links.push({f:'check',t:'out',p:0});
 return {name:tag,renderer:'pxf@1',settings:{size:32,frames:8,fps:24,loop:false},nodes,links};
}
export const fixtures=Object.keys(DEFS).map(type=>graph(type,{}));
for(const shape of ['circle','ring','square','diamond','polygon','star','shard','crescent','cross'])fixtures.push(graph('Shape',{shape,rot:37,aspect:.7,size:12,size2:.3,falloff:.4},'shape-'+shape));
for(const pshape of ['square','diamond','plus','circle','dot','streak'])for(const dirMode of ['fixed','outward','inward'])fixtures.push(graph('Particles',{seed:41,count:15,pshape,dirMode,area:'ring',aw:5,ah:3,life:1,gravity:.13,ground:25,bounce:.4,turb:.3,emit:'stream',loop:true},'particles-'+pshape+'-'+dirMode));
fixtures.push(graph('Arc',{head:{a:.1,b:1.5,e:'out'},tail:.8,rot:25},'arc-overshoot'));
fixtures.push(graph('Repeat',{seed:14,jitter:.4,rotMin:-30,rotMax:30,delay:1},'repeat-seed'));
