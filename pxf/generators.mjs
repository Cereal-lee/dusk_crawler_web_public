// SPDX-License-Identifier: MIT
// Dusk public-edition geometry. This module uses geometric coverage tests,
// cubic curves, analytic trajectories and seeded subdivision, not a reference
// renderer. It intentionally does not reproduce another engine pixel-for-pixel.
const tau=Math.PI*2;
const limit=v=>Math.max(0,Math.min(1,v));
const angle=v=>v*Math.PI/180;
const lerp=(a,b,t)=>a+(b-a)*t;
const buffer=n=>new Float32Array(n*n*4);
function sample(seed,index,channel=0){
 let state=2166136261;
 for(const letter of `${seed}:${index}:${channel}`)state=Math.imul(state^letter.charCodeAt(0),16777619);
 for(let round=0;round<3;round++){state^=state<<13;state^=state>>>17;state^=state<<5;}
 return (state>>>0)/4294967296;
}
function ink(out,n,x,y,value,add=false){
 x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=n||y>=n)return;
 const at=4*(y*n+x),v=limit(add?out[at+3]+value:Math.max(out[at+3],value));
 out.fill(v,at,at+4);
}
function disk(out,n,cx,cy,radius,value,add=false){
 if(radius<=0||value<=0)return;
 if(radius<.65){ink(out,n,cx,cy,value,add);return;}
 for(let y=Math.max(0,Math.floor(cy-radius));y<Math.min(n,cy+radius);y++)
  for(let x=Math.max(0,Math.floor(cx-radius));x<Math.min(n,cx+radius);x++)
   if((x+.5-cx)**2+(y+.5-cy)**2<=radius*radius)ink(out,n,x,y,value,add);
}
function line(out,n,a,b,width,value){
 const dx=b[0]-a[0],dy=b[1]-a[1],steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*1.5));
 for(let j=0;j<=steps;j++)disk(out,n,a[0]+dx*j/steps,a[1]+dy*j/steps,width/2,value);
}
function polygonContains(x,y,vertices){
 let inside=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
  const a=vertices[i],b=vertices[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function shapeRaster(n,p){
 const out=buffer(n),r=p.size;if(r<=0)return out;
 const cosine=Math.cos(angle(p.rot)),sine=Math.sin(angle(p.rot));
 const vertices=Array.from({length:p.shape==='star'?p.points*2:p.points},(_,i)=>{
  const count=p.shape==='star'?p.points*2:p.points,a=i*tau/count-Math.PI/2;
  const radius=p.shape==='star'&&i%2?p.size2:1;return [Math.cos(a)*radius,Math.sin(a)*radius];
 });
 const covered=(x,y)=>{
  const radius=Math.hypot(x,y);
  switch(p.shape){
   case 'square':return Math.max(Math.abs(x),Math.abs(y))<=1;
   case 'diamond':return Math.abs(x)+Math.abs(y)<=1;
   case 'polygon':case 'star':return polygonContains(x,y,vertices);
   case 'shard':return polygonContains(x,y,[[0,-1],[Math.max(.08,p.size2),.65],[0,.35],[-Math.max(.08,p.size2),.65]]);
   case 'cross':return Math.max(Math.abs(x),Math.abs(y))<=1&&Math.min(Math.abs(x),Math.abs(y))<=Math.max(.05,p.size2);
   case 'crescent':return radius<=1&&Math.hypot(x-.4,y)>.8;
   case 'ring':return radius<=1&&radius>=1-p.size2;
   default:return radius<=1;
  }
 };
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const dx=(x+.5)/r-p.x*n/r,dy=(y+.5)/r-p.y*n/r;
  const u=dx*cosine+dy*sine,v=(-dx*sine+dy*cosine)/p.aspect;
  if(!covered(u,v))continue;
  const inset=1-p.stroke/r;if(p.stroke>0&&inset>0&&covered(u/inset,v/inset))continue;
  ink(out,n,x,y,p.intensity*(1-p.falloff*limit(Math.hypot(u,v))));
 }
 return out;
}
export function arcRaster(n,p){
 const out=buffer(n),start=Math.max(0,p.head-p.tail),end=p.head;
 if(end<=start||p.thick<=0)return out;
 const steps=Math.max(16,Math.ceil(Math.abs(p.sweep)*Math.max(1,p.radius)/45));
 const c=Math.cos(angle(p.rot)),s=Math.sin(angle(p.rot));
 for(let i=0;i<=steps;i++){
  const t=lerp(start,end,i/steps),a=angle(p.start+p.sweep*t),width=p.thick*Math.pow(Math.max(.02,i/steps),p.taper);
  const radius=p.radius-width/2,u=radius*Math.cos(a),v=radius*Math.sin(a)*p.aspect;
  disk(out,n,p.x*n+u*c-v*s,p.y*n+u*s+v*c,width/2,p.intensity*lerp(.2,1,i/steps));
 }
 return out;
}
function cubic(p,t){
 const a=[p.x0,p.y0],b=[p.x1,p.y1],c=[p.x2,p.y2],d=[p.x3,p.y3];
 // De Casteljau interpolation avoids special cases at either endpoint.
 const ab=a.map((v,i)=>lerp(v,b[i],t)),bc=b.map((v,i)=>lerp(v,c[i],t)),cd=c.map((v,i)=>lerp(v,d[i],t));
 const left=ab.map((v,i)=>lerp(v,bc[i],t)),right=bc.map((v,i)=>lerp(v,cd[i],t));
 return left.map((v,i)=>lerp(v,right[i],t));
}
export function strokeRaster(n,p){
 const out=buffer(n);if(p.to<=p.from||p.width<=0)return out;
 const steps=n*4;
 for(let i=0;i<=steps;i++){
  const t=lerp(p.from,p.to,i/steps),u=p.span?i/steps:t;
  const [x,y]=cubic(p,t),envelope=4*u*(1-u),width=p.width*lerp(1,envelope,p.taper);
  const value=u<.5?lerp(p.vA,p.vM,u*2):lerp(p.vM,p.vB,u*2-1);
  disk(out,n,x*n,y*n,width/2,value*p.intensity);
 }
 return out;
}
export function spikeRaster(n,p){
 const out=buffer(n),a=[p.x0*n,p.y0*n],b=[lerp(p.x0,p.x1,p.grow)*n,lerp(p.y0,p.y1,p.grow)*n];
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length||p.width<=0)return out;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const ox=x+.5-a[0],oy=y+.5-a[1],t=(ox*dx+oy*dy)/(length*length),d=(oy*dx-ox*dy)/length;
  if(t<0||t>1)continue;
  const width=p.width/2*lerp(1,(1-t)**p.taperPow,p.taper);if(Math.abs(d)>width)continue;
  let value=lerp(p.base,p.tip,t)+p.facet*d/Math.max(width,1)+p.ridge*Math.exp(-d*d);
  if(p.shine>=0)value+=p.shineAmp*Math.exp(-(((t-p.shine)/Math.max(.001,p.shineW))**2));
  ink(out,n,x,y,value*p.intensity);
 }
 return out;
}
export function particlesRaster(n,frames,frame,p){
 const out=buffer(n);
 for(let i=0;i<p.count;i++){
  const rand=channel=>sample(p.seed,i,channel),duration=Math.max(1,p.life*frames*(1-p.lifeVar*rand(1)));
  const birth=p.start*frames+(p.emit==='stream'?i/p.count*p.span*frames:0);
  let age=frame-birth;if(p.loop)age=((age%frames)+frames)%frames;if(age<0||age>=duration)continue;
  const radial=rand(2)*tau,reach=p.area==='ring'?1:Math.sqrt(rand(3));
  let dx=0,dy=0;
  if(p.area==='circle'||p.area==='ring'){dx=Math.cos(radial)*reach*p.aw;dy=Math.sin(radial)*reach*p.ah;}
  if(p.area==='box'||p.area==='line'){dx=(rand(2)-.5)*p.aw;dy=p.area==='box'?(rand(3)-.5)*p.ah:0;}
  let a=angle(p.angle+(rand(4)-.5)*p.spread);
  if(p.dirMode==='outward'||p.dirMode==='inward')a=(dx||dy?Math.atan2(dy,dx):radial)+(p.dirMode==='inward'?Math.PI:0);
  const speed=p.speed*lerp(1-p.speedVar,1,rand(5)),vx=Math.cos(a)*speed,vy=Math.sin(a)*speed;
  const drag=-Math.log(Math.max(.001,1-p.drag)),travel=drag?(1-Math.exp(-drag*age))/drag:age;
  let x=p.x*n+dx+vx*travel,y=p.y*n+dy+vy*travel+p.gravity*age*age/2;
  if(p.ground>0&&y>p.ground)y=p.ground-(y-p.ground)*p.bounce;
  x+=Math.sin(age*.2+rand(6)*tau)*p.turb;y+=Math.sin(age*.3+rand(7)*tau)*p.turb;
  const t=age/duration,size=lerp(p.sizeA,p.sizeB,t),fade=p.fade==='flat'?1:p.fade==='inout'?4*t*(1-t):1-t;
  const blink=p.fade==='flicker'?(sample(p.seed,i,Math.floor(age)+10)>.3?1:.2):1;
  const value=p.bright*(1-p.brightVar*rand(8))*fade*blink,r=size/2;if(r<=0)continue;
  if(p.pshape==='streak'){line(out,n,[x,y],[x-vx*p.stretch*size,y-vy*p.stretch*size],Math.max(1,size*.3),value);continue;}
  if(p.pshape==='dot'){ink(out,n,x,y,value,true);continue;}
  if(p.pshape==='circle'){disk(out,n,x,y,r,value,true);continue;}
  for(let sy=-Math.ceil(r);sy<=Math.ceil(r);sy++)for(let sx=-Math.ceil(r);sx<=Math.ceil(r);sx++){
   const valid=p.pshape==='square'?Math.max(Math.abs(sx),Math.abs(sy))<=r:p.pshape==='plus'?(sx===0||sy===0)&&Math.max(Math.abs(sx),Math.abs(sy))<=r:Math.abs(sx)+Math.abs(sy)<=r;
   if(valid)ink(out,n,x+sx,y+sy,value,true);
  }
 }
 return out;
}
export function lightningRaster(n,frame,p){
 const out=buffer(n),phase=p.rate?Math.floor(frame/p.rate):0;
 let points=[[p.x0*n,p.y0*n],[lerp(p.x0,p.x1,p.grow)*n,lerp(p.y0,p.y1,p.grow)*n]];
 for(let level=0;level<p.detail;level++){
  const refined=[points[0]];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],jitter=(sample(p.seed+phase,level*128+i)-.5)*p.jag;
   refined.push([(a[0]+b[0])/2-dy*jitter,(a[1]+b[1])/2+dx*jitter],b);
  }
  points=refined;
 }
 for(let i=1;i<points.length;i++){
  line(out,n,points[i-1],points[i],p.thick,p.intensity);
  if(sample(p.seed+phase,i,1)<p.branch){const a=points[i],direction=sample(p.seed+phase,i,2)*tau;line(out,n,a,[a[0]+Math.cos(direction)*n*p.branchLen*.2,a[1]+Math.sin(direction)*n*p.branchLen*.2],p.thick*.6,p.intensity*.5);}
 }
 return out;
}
