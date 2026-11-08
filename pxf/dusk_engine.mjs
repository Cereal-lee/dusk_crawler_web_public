// SPDX-License-Identifier: MIT
import {shapeRaster,arcRaster,strokeRaster,spikeRaster,particlesRaster,lightningRaster} from './generators.mjs';
import {NODE_CONTRACT} from './node_contract.mjs';

// Dusk raster engine. No upstream evaluator or rendering code is loaded.
// Internally RGBA is premultiplied channel data, sampled at pixel centres.
const unit=x=>Math.max(0,Math.min(1,x));
const radians=x=>x*Math.PI/180;
const wrap=x=>x-Math.floor(x);
const mix=(a,b,t)=>a+(b-a)*t;
const color=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);
const easing={linear:t=>t,in:t=>t*t,out:t=>t*(2-t),inout:t=>t<.5?2*t*t:1-2*(1-t)**2,in3:t=>t*t*t,out3:t=>1-(1-t)**3,pulse:t=>Math.sin(Math.PI*t),wave:t=>(1-Math.cos(2*Math.PI*t))/2,step:t=>+(t>=1)};
function animated(v,time,frame){
 if(!v||typeof v!=='object')return v;
 if(Array.isArray(v.k)){
  if(!v.k.length)return 0;
  if(frame<=v.k[0][0])return v.k[0][1];
  for(let j=1;j<v.k.length;j++)if(frame<v.k[j][0]){const a=v.k[j-1],b=v.k[j];return mix(a[1],b[1],(easing[a[2]]||easing.linear)((frame-a[0])/(b[0]-a[0])));}
  return v.k.at(-1)[1];
 }
 if('a'in v){const begin=v.t0??0,end=v.t1??1,u=end>begin?unit((time-begin)/(end-begin)):+(time>=end);return mix(v.a,v.b,(easing[v.e]||easing.linear)(u));}
 return v;
}
function random(seed){let state=(seed>>>0)||1;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
function cellRandom(x,y,seed){let v=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(seed|0,1442695041))|0;v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967296;}
function noise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),sx=wrap(x),sy=wrap(y),u=sx*sx*(3-2*sx),v=sy*sy*(3-2*sy);return mix(mix(cellRandom(ix,iy,seed),cellRandom(ix+1,iy,seed),u),mix(cellRandom(ix,iy+1,seed),cellRandom(ix+1,iy+1,seed),u),v);}
function fresh(size){return new Float32Array(size*size*4);}
function mono(out,k,v){v=unit(v);out[k]=out[k+1]=out[k+2]=out[k+3]=v;}
function combine(dst,k,src,j,mode='over',opacity=1){
 const b=src[j+3]*opacity,a=dst[k+3];
 if(mode==='over'){for(let c=0;c<3;c++)dst[k+c]=src[j+c]*opacity+dst[k+c]*(1-b);dst[k+3]=b+a*(1-b);}
 else for(let c=0;c<4;c++){const av=dst[k+c],bv=src[j+c]*opacity;dst[k+c]=mode==='add'?unit(av+bv):mode==='max'?Math.max(av,bv):mode==='screen'?av+bv-av*bv:mode==='multiply'?av*bv:Math.max(0,av-bv);}
}
function resample(source,size,x,y,target,k){const ix=Math.floor(x),iy=Math.floor(y);if(ix>=0&&iy>=0&&ix<size&&iy<size){const j=(iy*size+ix)*4;for(let c=0;c<4;c++)target[k+c]=source[j+c];}}
function transformed(source,size,{tx=0,ty=0,sx=1,sy=1,rot=0,px=.5,py=.5}){
 const result=fresh(size);if(Math.abs(sx)<1e-8||Math.abs(sy)<1e-8)return result;
 const cs=Math.cos(radians(rot)),sn=Math.sin(radians(rot)),cx=px*size,cy=py*size;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const dx=x+.5-cx-tx,dy=y+.5-cy-ty;resample(source,size,(dx*cs+dy*sn)/sx+cx,(-dx*sn+dy*cs)/sy+cy,result,(y*size+x)*4);}
 return result;
}
function boxBlur(source,size,radius,passes){
 let current=source.slice();const r=Math.max(0,Math.round(radius));if(!r)return current;
 for(let p=0;p<passes;p++)for(const horizontal of [true,false]){
  const dest=fresh(size),diameter=r*2+1;
  for(let line=0;line<size;line++)for(let channel=0;channel<4;channel++){
   let sum=0;const read=at=>{if(at<0||at>=size)return 0;return current[((horizontal?line:at)*size+(horizontal?at:line))*4+channel];};
   for(let at=-r;at<=r;at++)sum+=read(at);
   for(let at=0;at<size;at++){dest[((horizontal?line:at)*size+(horizontal?at:line))*4+channel]=sum/diameter;sum+=read(at+r+1)-read(at-r);}
  }current=dest;
 }return current;
}
function bezier(p,t,prefix=''){const u=1-t;return ['x','y'].map(axis=>u*u*u*p[prefix+axis+'0']+3*u*u*t*p[prefix+axis+'1']+3*u*t*t*p[prefix+axis+'2']+t*t*t*p[prefix+axis+'3']);}
class Evaluator {
 constructor(graph){this.graph=graph;this.size=graph.settings.size;this.nodes=new Map(graph.nodes.map(n=>[n.id,n]));this.edges=new Map(graph.links.map(l=>[l.t+':'+l.p,l.f]));this.memo=new Map();this.active=new Set();}
 run(id,frame){
  if(!id)return fresh(this.size);const frameCount=this.graph.settings.frames;if(frame<0||frame>=frameCount){if(!this.graph.settings.loop)return fresh(this.size);frame=wrap(frame/frameCount)*frameCount;}const key=id+':'+frame;if(this.memo.has(key))return this.memo.get(key);if(this.active.has(key))throw Error('순환 연결입니다.');
  const node=this.nodes.get(id);if(!node)throw Error('없는 노드입니다.');this.active.add(key);
  const total=this.graph.settings.frames,t=frame/(this.graph.settings.loop?total:Math.max(1,total-1)),n=this.size;
  const p=Object.fromEntries(NODE_CONTRACT[node.type].params.map(q=>{const v=animated(node.params?.[q.n]??q.d,t,frame);return [q.n,['int','seed'].includes(q.t)?Math.round(v):v];}));
  const input=(port=0,at=frame)=>this.run(this.edges.get(id+':'+port),at),has=port=>this.edges.has(id+':'+port);
  let out=fresh(n);
  if(node.type==='Shape')out=shapeRaster(n,p);
  else if(node.type==='Arc')out=arcRaster(n,p);
  else if(node.type==='Stroke')out=strokeRaster(n,p);
  else if(node.type==='Spike')out=spikeRaster(n,p);
  else if(node.type==='Particles')out=particlesRaster(n,total,frame,p);
  else if(node.type==='Lightning')out=lightningRaster(n,frame,p);
  else if(['Gradient','Noise','Checker','Grid'].includes(node.type)){
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let v=0;const dx=x+.5-(p.x??.5)*n,dy=(y+.5-(p.y??.5)*n)/(p.aspect??1);
    if(node.type==='Gradient'){v=p.type==='radial'?1-Math.hypot(dx,dy)/p.radius:p.type==='diamond'?1-(Math.abs(dx)+Math.abs(dy))/p.radius:p.type==='angular'?wrap((Math.atan2(dy,dx)-radians(p.angle))/(2*Math.PI)):.5+(dx*Math.cos(radians(p.angle))+dy*Math.sin(radians(p.angle)))/n;v+=p.offset;v=p.repeat?wrap(v):unit(v);if(p.invert)v=1-v;}
    if(node.type==='Noise'){let weight=1,sum=0;for(let o=0;o<p.octaves;o++){const nx=(x/n*p.scaleX+t*p.scrollX)*2**o,ny=(y/n*p.scaleY+t*p.scrollY)*2**o;let z=p.type==='cells'?cellRandom(Math.floor(nx),Math.floor(ny),p.seed+o):noise(nx,ny,p.seed+o);if(p.type==='ridged')z=1-Math.abs(2*z-1);v+=z*weight;sum+=weight;weight*=.5;}v=(v/sum-.5)*p.contrast+.5+p.bias;}
    if(node.type==='Checker'){const xx=(p.iso?x+y:x)+p.ox,yy=(p.iso?y-x:y)+p.oy,cx=xx/p.size,cy=yy/p.size;const on=p.pattern==='dots'?Math.hypot(wrap(cx)-.5,wrap(cy)-.5)<=p.dot:(Math.floor(cx)+Math.floor(cy))%2===0;v=on?p.a:p.b;}
    if(node.type==='Grid'){const cx=(x+p.ox)/p.cellW,cy=(y+p.oy)/p.cellH;v=wrap(cx)*p.cellW<p.gap||wrap(cy)*p.cellH<p.gap?p.gapV:mix(p.lo,p.hi,cellRandom(Math.floor(cx),Math.floor(cy),p.seed));}
    mono(out,(y*n+x)*4,v);
   }
  }else if(node.type==='Transform')out=transformed(input(),n,p);
  else if(node.type==='Repeat'){
   const rng=random(p.seed),count=Math.round(p.count);
   for(let i=0;i<count;i++){
    const j=p.centered?i-(count-1)/2:i,u=count===1?0:i/(count-1),scale=p.layout==='bezier'?mix(p.scale0,p.scale1,u**p.scalePow):p.scale0*(1-p.scaleStep)**i;
    const xy=p.layout==='bezier'?bezier(p,u**p.dist,'b'):[p.posX<0?p.px:p.posX,p.posY<0?p.py:p.posY];
    const jitter=1+(rng()*2-1)*p.jitter,layer=transformed(input(0,frame-i*p.delay),n,{tx:(xy[0]-p.px)*n+j*p.dx,ty:(xy[1]-p.py)*n+j*p.dy,sx:scale*p.sx*jitter,sy:scale*p.sy*jitter,rot:p.angle0+j*p.angleStep+mix(p.rotMin,p.rotMax,rng()),px:p.px,py:p.py});
    for(let k=0;k<out.length;k+=4)combine(out,k,layer,k,p.mode,Math.max(0,1-i*p.fadeStep));
   }
  }else if(node.type==='Echo'){for(let i=Math.round(p.copies);i>=0;i--){const layer=input(0,frame-i*p.step);for(let k=0;k<out.length;k+=4)combine(out,k,layer,k,'add',p.decay**i);}}
  else if(node.type==='Blur')out=boxBlur(input(),n,p.radius,p.passes);
  else if(node.type==='Glow'){const a=input(),b=boxBlur(a,n,p.radius,2);out=a.slice();for(let k=0;k<out.length;k++)out[k]=unit(a[k]+b[k]*p.strength);}
  else if(['Displace','Polar','Pixelate'].includes(node.type)){
   const a=input(),b=node.type==='Displace'?input(1):null;
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const k=(y*n+x)*4;let xx=x+.5,yy=y+.5;
    if(node.type==='Pixelate'){xx=Math.floor(x/p.block)*p.block+p.block/2;yy=Math.floor(y/p.block)*p.block+p.block/2;}
    if(node.type==='Polar'){const dx=xx-p.cx*n,dy=yy-p.cy*n,r=Math.hypot(dx,dy),v=(r-p.rIn)/(p.rOut-p.rIn);if(v<0||v>1)continue;xx=wrap((Math.atan2(dy,dx)-radians(p.spin))/(2*Math.PI))*n;yy=(p.invert?1-v:v)*(n-1);}
    if(node.type==='Displace'){let direction=p.mode==='dir'?radians(p.angle):Math.atan2(yy-p.cy*n,xx-p.cx*n)+(p.mode==='swirl'?Math.PI/2:0);const offset=(b[k+3]-p.center)*p.amount;xx-=Math.cos(direction)*offset;yy-=Math.sin(direction)*offset;}
    resample(a,n,xx,yy,out,k);
   }
  }else if(node.type==='AuraShell'||node.type==='Revolve'){
   const side=input(),cap=input(1);
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const k=(y*n+x)*4,dx=x+.5-p.cx*n;let u,v,radius,alpha=1,shade=1;
    if(node.type==='Revolve'){
     v=(y+.5-p.yTop*n)/Math.max(.001,(p.yBot-p.yTop)*n);if(v<0||v>1)continue;
     radius=(p.rEnd+(p.rMid-p.rEnd)*Math.sin(Math.PI*v)**p.bulgePow)*p.scale;if(Math.abs(dx)>radius)continue;
     const sideAngle=Math.asin(dx/Math.max(.001,radius));u=sideAngle/(2*Math.PI)+.5;shade=1-p.shade*(1-Math.max(0,Math.cos(sideAngle-radians(p.light*90)))**p.shadePow);
     const projectedV=unit(v-p.ratio*radius*Math.cos(sideAngle)/Math.max(1,(p.yBot-p.yTop)*n));
     if(p.range==='full'){const rear=fresh(1);resample(side,n,wrap((1-u)*p.uvX+p.spin)*n,unit(v+p.ratio*radius*Math.cos(sideAngle)/Math.max(1,(p.yBot-p.yTop)*n))*(n-1),rear,0);combine(out,k,rear,0);}
     const front=fresh(1);resample(side,n,wrap(u*p.uvX+p.spin)*n,projectedV*(n-1),front,0);combine(out,k,front,0);
     if(p.cap!=='none'&&has(1)){const capY=(p.cap==='top'?p.yTop:p.yBot)*n,dy=(y+.5-capY)/Math.max(.001,p.ratio);if(dx*dx+dy*dy<(p.rEnd*p.scale)**2)resample(cap,n,(dx/(2*p.rEnd*p.scale)+.5)*n,(dy/(2*p.rEnd*p.scale)+.5)*n,out,k);}
    }else{
     const lip=p.lipY*n+(p.range==='rear'?-1:1)*p.radius*p.tilt*Math.sqrt(Math.max(0,1-(dx/p.radius)**2));
     const rising=y+.5<lip;v=rising?(lip-y-.5)/Math.max(.001,lip-p.tipY*n):(y+.5-lip)/Math.max(.001,p.baseY*n-lip);if(v<0||v>1)continue;
     radius=p.radius*(rising?1+p.flare*v:Math.sqrt(Math.max(0,1-v*v)));if(Math.abs(dx)>radius)continue;
     const angle=Math.asin(dx/Math.max(.001,radius));u=angle/(2*Math.PI)+.5+p.twist*v;
     resample(rising?cap:side,n,wrap(u*p.uvX+p.spin)*n,wrap(rising?v*p.riseUV*p.stretch:v)*(n-1),out,k);
     alpha=rising?p.riseAlpha*Math.max(0,1-v/Math.max(.01,p.riseCutoff)):1;if(p.range==='rear')alpha*=p.rearAlpha;else if(p.range==='full')alpha=1-(1-alpha)*(1-alpha*p.rearAlpha);shade=1-p.shade*Math.abs(dx)/radius;
    }
    for(let c=0;c<3;c++)out[k+c]*=shade*alpha;out[k+3]*=alpha;
   }
  }else{
   const a=input(),b=has(1)||node.type==='Blend'?input(1):null;out=a.slice();
   const palette=p.colors?.map(color),tint=p.color?color(p.color):null;
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const k=(y*n+x)*4,alpha=a[k+3];
    if(node.type==='Blend')combine(out,k,b,k,p.mode,p.opacity);
    else if(node.type==='Mask'){const factor=p.mode==='cutout'?1-(b?.[k+3]||0)*p.strength:mix(1,b?.[k+3]||0,p.strength);for(let c=0;c<4;c++)out[k+c]*=factor;}
    else if(node.type==='Tint'){const amount=p.amount*(b?b[k+3]:1);for(let c=0;c<3;c++)out[k+c]=unit(mix(a[k+c],tint[c]*alpha,amount)*p.bright)*p.opacity;out[k+3]=alpha*p.opacity;}
    else if(node.type==='Palette'){
     const key=p.key==='luma'?(a[k]*.2126+a[k+1]*.7152+a[k+2]*.0722)/Math.max(alpha,1e-8):alpha;
     if(key<=p.cutoff||alpha<=0){out.fill(0,k,k+4);continue;}
     const v=unit((key-p.cutoff)/(1-p.cutoff)+p.shift),at=p.mode==='smooth'?v*(palette.length-1):Math.min(palette.length-1,Math.floor(v*palette.length)),low=Math.floor(at),high=Math.min(palette.length-1,low+1);
     out[k+3]=p.opacity;for(let c=0;c<3;c++)out[k+c]=mix(palette[low][c],palette[high][c],at-low)*p.opacity;
    }else if(node.type==='Quantize'){
     let best=palette[0],distance=Infinity;for(const c of palette){let d=0;for(let z=0;z<3;z++)d+=(a[k+z]/Math.max(alpha,1e-8)-c[z])**2;if(d<distance){distance=d;best=c;}}
     const v=p.alpha==='hard'?+(alpha>=p.threshold):alpha;for(let z=0;z<3;z++)out[k+z]=best[z]*v;out[k+3]=v;
    }else if(node.type==='Output'){
     const v=p.alpha==='hard'?+(alpha>=p.threshold):alpha;for(let c=0;c<3;c++)out[k+c]=alpha>0?a[k+c]/alpha*v:0;out[k+3]=v;
    }else if(node.type==='Levels'||node.type==='Dither'){
     let v;
     if(node.type==='Levels'){v=unit((alpha-p.lo)/Math.max(1e-8,p.hi-p.lo))**(1/p.gamma);if(p.steps>1)v=Math.round(v*(p.steps-1))/(p.steps-1);}
     else{const matrix=p.pattern==='bayer2'?[0,2,3,1]:[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],side=Math.sqrt(matrix.length),offset=((matrix[(y%side)*side+x%side]+.5)/matrix.length-.5)*p.strength;v=unit(Math.round(alpha*(p.levels-1)+offset)/(p.levels-1));}
     for(let c=0;c<3;c++)out[k+c]=alpha>1e-8?a[k+c]*v/alpha:v;out[k+3]=v;
    }else if(node.type==='Outline'){
     let edge=false;const solid=alpha>=p.threshold;
     for(let dy=-p.width;dy<=p.width&&!edge;dy++)for(let dx=-p.width;dx<=p.width;dx++){
      if(!p.corners&&Math.abs(dx)+Math.abs(dy)>p.width)continue;const nx=x+dx,ny=y+dy,neighbor=nx>=0&&ny>=0&&nx<n&&ny<n?a[(ny*n+nx)*4+3]>=p.threshold:false;
      if(p.mode==='outer'?!solid&&neighbor:solid&&!neighbor){edge=true;break;}
     }
     if(edge){const v=b?b[k+3]:1;for(let c=0;c<3;c++)out[k+c]=tint[c]*v;out[k+3]=v;}
    }else throw Error('구현되지 않은 노드: '+node.type);
   }
  }
  this.active.delete(key);this.memo.set(key,out);
  const budget=Math.max(16,Math.floor(32*1024*1024/out.byteLength));while(this.memo.size>budget)this.memo.delete(this.memo.keys().next().value);return out;
 }
}
function renderFrame(evaluator,graph,frame){
 evaluator.memo.clear();const target=graph.nodes.find(n=>n.type==='Output');if(!target)throw Error('Output 노드가 필요합니다.');
 const pixels=evaluator.run(target.id,frame),rgba=new Uint8ClampedArray(pixels.length);
 for(let i=0;i<pixels.length;i+=4){const a=unit(pixels[i+3]);for(let c=0;c<3;c++)rgba[i+c]=a>0?Math.round(unit(pixels[i+c]/a)*255):0;rgba[i+3]=Math.round(a*255);}
 return rgba;
}
const DuskEngine={DEFS:NODE_CONTRACT,EASE:easing,pv:animated,defaults:type=>Object.fromEntries(NODE_CONTRACT[type].params.map(q=>[q.n,structuredClone(q.d)])),Evaluator,renderFrame};
export default DuskEngine;
