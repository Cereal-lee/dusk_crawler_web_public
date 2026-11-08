import PXF from './dusk_engine.mjs';
import * as Schema from './pxf_schema.mjs';
import * as Legacy from './legacy_engine.mjs';
export const DEFS=Object.fromEntries(Object.entries(PXF.DEFS).map(([type,d])=>[type,{label:d.label,inputs:d.in.length,inputLabels:d.in,params:PXF.defaults(type),fields:d.params,category:d.cat}]));
export const EASINGS=Object.keys(PXF.EASE);
export const clamp=Legacy.clamp;
export const value=PXF.pv;
export function isLegacy(graph){return graph?.renderer==='dusk-legacy@1'||(!graph?.renderer&&graph?.game?.style==='dusk-crawler-pixel-v1');}
export function getDefs(graph){return isLegacy(graph)?Legacy.DEFS:DEFS;}
export function validate(raw){
 if(isLegacy(raw)){const g=Legacy.validate(raw);g.renderer='dusk-legacy@1';return g;}
 const g=Schema.normalizeGraph(raw);g.renderer='dusk-public@1';
 if(typeof raw.id==='string'&&/^user_[a-zA-Z0-9_-]{1,80}$/.test(raw.id))g.id=raw.id;
 return g;
}
export function renderFrame(graph,frame=0,alreadyValidated=false){const g=alreadyValidated?graph:validate(graph);if(isLegacy(g))return Legacy.renderFrame(g,frame,true);const ev=new PXF.Evaluator(g,{strict:true});return PXF.renderFrame(ev,g,clamp(Math.floor(frame),0,g.settings.frames-1));}
export function renderFrames(graph){const g=validate(graph);if(isLegacy(g))return Array.from({length:g.settings.frames},(_,f)=>Legacy.renderFrame(g,f,true));const ev=new PXF.Evaluator(g,{strict:true});return Array.from({length:g.settings.frames},(_,f)=>PXF.renderFrame(ev,g,f));}
export function sheet(graph){const g=validate(graph),size=g.settings.size,columns=Math.min(8,g.settings.frames),width=size*columns,height=size*Math.ceil(g.settings.frames/columns),pixels=new Uint8ClampedArray(width*height*4),frames=renderFrames(g);for(let f=0;f<frames.length;f++)for(let y=0;y<size;y++)pixels.set(frames[f].subarray(y*size*4,(y+1)*size*4),((Math.floor(f/columns)*size+y)*width+(f%columns)*size)*4);return {width,height,pixels,columns};}
export function godotResource(graph,stem='efx_custom'){const g=validate(graph),s=g.settings,size=s.size,cols=Math.min(8,s.frames);let str=`[gd_resource type="SpriteFrames" load_steps=${s.frames+2} format=3]\n\n[ext_resource type="Texture2D" path="res://art/combat_vfx/${stem}.png" id="1"]\n`;for(let i=0;i<s.frames;i++)str+=`\n[sub_resource type="AtlasTexture" id="Atlas_${i}"]\natlas = ExtResource("1")\nregion = Rect2(${i%cols*size}, ${Math.floor(i/cols)*size}, ${size}, ${size})\n`;return str+`\n[resource]\nanimations = [{\n"frames": [${Array.from({length:s.frames},(_,i)=>`{"duration": 1.0, "texture": SubResource("Atlas_${i}")}`).join(',')}],\n"loop": ${s.loop},\n"name": &"default",\n"speed": ${s.fps}.0\n}]\n`.replace(`${s.fps}.0`,String(s.fps));}
