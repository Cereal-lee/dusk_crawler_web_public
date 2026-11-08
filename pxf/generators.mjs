// SPDX-License-Identifier: MIT
// Pixel-centre rasterization for saved Dusk graphs. Parameter units, temporal
// envelopes and seeded sequences are part of the graph playback contract.
const TAU=2*Math.PI, deg=a=>a*Math.PI/180, sat=a=>Math.max(0,Math.min(1,a));
const fraction=a=>a-Math.floor(a), interpolate=(a,b,t)=>a+(b-a)*t;
const surface=n=>new Float32Array(4*n*n);
function put(a,n,x,y,value,add=false){
 if(x<0||y<0||x>=n||y>=n)return;
 const k=(y*n+x)*4,v=sat(add?a[k+3]+value:Math.max(a[k+3],value));a.fill(v,k,k+4);
}
function disk(a,n,cx,cy,r,v){
 for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(n,Math.ceil(cy+r+1));y++)
  for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(n,Math.ceil(cx+r+1));x++)
   if((x+.5-cx)**2+(y+.5-cy)**2<=r*r)put(a,n,x,y,v);
}
// Mulberry32: keep seeded playback stable when opening older authored graphs.
export function seededSequence(seed){
 let state=seed>>>0;
 return ()=>{state=(state+0x6d2b79f5)>>>0;let v=Math.imul(state^(state>>>15),state|1);v^=v+Math.imul(v^(v>>>7),v|61);return ((v^(v>>>14))>>>0)/4294967296;};
}
function cellSample(x,y,seed){
 let hash=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(seed|0,1442695041))|0;
 hash=Math.imul(hash^(hash>>>13),1274126177);return ((hash^(hash>>>16))>>>0)/4294967296;
}
export function shapeRaster(n,p){
 const result=surface(n);if(p.size<=.25||p.intensity<=0)return result;
 const c=Math.cos(deg(p.rot)),s=Math.sin(deg(p.rot)),radius=Math.max(.0001,p.size);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const dx=x+.5-p.x*n,dy=(y+.5-p.y*n)/p.aspect;
  const u=dx*c+dy*s,v=-dx*s+dy*c,radial=Math.hypot(u,v),a=Math.atan2(v,u);
  let edge=radius,distance=radial;
  switch(p.shape){
   case 'square':distance=Math.max(Math.abs(u),Math.abs(v));break;
   case 'diamond':distance=Math.abs(u)+Math.abs(v);break;
   case 'polygon':{const sides=Math.max(3,Math.round(p.points)),sector=TAU/sides;edge=radius*Math.cos(Math.PI/sides)/Math.cos(fraction((a+Math.PI/2)/sector)*sector-sector/2);break;}
   case 'star':{const phase=fraction((a+Math.PI/2)*Math.round(p.points)/TAU);edge=radius*interpolate(1,p.size2,2*Math.min(phase,1-phase));break;}
   case 'shard':distance=(v<0?-v:v/.35)+Math.abs(u)/Math.max(.04,p.size2);break;
   case 'cross':{const arm=Math.max(.05,p.size2);distance=Math.min(Math.max(Math.abs(u),Math.abs(v)/arm),Math.max(Math.abs(v),Math.abs(u)/arm));break;}
   case 'ring':{const band=Math.max(.5,p.size2*radius);distance=Math.abs(radial-radius+band/2)/(band/2)*radius;break;}
  }
  if(distance>edge)continue;
  if(p.shape==='crescent'&&Math.hypot(u,v+radius*Math.max(.05,p.size2))<=radius)continue;
  if(p.stroke>0&&distance<edge*(1-p.stroke/radius))continue;
  put(result,n,x,y,p.intensity*(1-p.falloff*sat(distance/edge)));
 }
 return result;
}
export function arcRaster(n,p){
 const result=surface(n),c=Math.cos(deg(p.rot)),s=Math.sin(deg(p.rot));
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const dx=x+.5-p.x*n,dy=y+.5-p.y*n,u=dx*c+dy*s,v=(-dx*s+dy*c)/p.aspect;
  const phase=fraction((Math.atan2(v,u)-deg(p.start))*Math.sign(p.sweep||1)/TAU)*TAU/Math.max(1e-8,Math.abs(deg(p.sweep)));
  const along=(phase-p.head+p.tail)/p.tail;if(phase>1||along<0||along>1)continue;
  const width=p.thick*Math.pow(along,p.taper)*Math.min(1,(p.head-phase)*Math.abs(p.sweep)/12+.15),radius=Math.hypot(u,v);
  if(radius>p.radius||radius<p.radius-width)continue;
  const edgeLight=width>0?(radius-p.radius+width)/width:1;
  put(result,n,x,y,p.intensity*(.35+.65*along)*(.55+.45*edgeLight));
 }
 return result;
}
function bezierPoint(p,t){
 const u=1-t;return ['x','y'].map(a=>u*u*u*p[a+'0']+3*u*u*t*p[a+'1']+3*u*t*t*p[a+'2']+t*t*t*p[a+'3']);
}
export function strokeRaster(n,p){
 const result=surface(n);if(p.to<=p.from||p.width<=0)return result;
 let length=0,last=bezierPoint(p,0);
 for(let k=1;k<=32;k++){const point=bezierPoint(p,k/32);length+=Math.hypot(point[0]-last[0],point[1]-last[1])*n;last=point;}
 const steps=Math.max(8,Math.ceil(length*(p.to-p.from)*3));
 for(let k=0;k<=steps;k++){
  const t=interpolate(p.from,p.to,k/steps),phase=p.span?k/steps:t,point=bezierPoint(p,t);
  const width=p.width*interpolate(1,Math.sqrt(Math.max(0,Math.sin(Math.PI*phase))),p.taper);
  const light=(phase<.5?interpolate(p.vA,p.vM,phase*2):interpolate(p.vM,p.vB,(phase-.5)*2))*p.intensity;
  if(width<1)put(result,n,Math.floor(point[0]*n),Math.floor(point[1]*n),light);
  else disk(result,n,point[0]*n,point[1]*n,width/2,light);
 }
 return result;
}
export function spikeRaster(n,p){
 const result=surface(n),ax=p.x0*n,ay=p.y0*n,dx=(p.x1-p.x0)*n*p.grow,dy=(p.y1-p.y0)*n*p.grow,len=Math.hypot(dx,dy);
 if(p.grow<=0||len<.5*p.grow||p.width<=0||p.intensity<=0)return result;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const ox=x+.5-ax,oy=y+.5-ay,t=(ox*dx+oy*dy)/(len*len),cross=(ox*(-dy)+oy*dx)/len;
  const width=p.width/2*interpolate(1,Math.pow(Math.max(0,1-t),p.taperPow),p.taper);
  if(t<0||t>1||Math.abs(cross)>width)continue;
  let light=interpolate(p.base,p.tip,t);
  if((cross<0)===(p.facet>=0))light+=Math.abs(p.facet);
  if(Math.abs(cross)<.75)light+=p.ridge;
  if(p.shine>=0)light+=p.shineAmp*Math.max(0,1-Math.abs(t-p.shine)/p.shineW);
  put(result,n,x,y,sat(light)*p.intensity);
 }
 return result;
}
function stampParticle(result,n,x,y,size,light,p,vx,vy){
 const cx=Math.floor(x),cy=Math.floor(y),side=Math.round(size),r=Math.floor(side/2);
 if(p.pshape==='dot'||size<1.5){if(size>=.5||p.pshape==='dot')put(result,n,cx,cy,light,true);return;}
 if(p.pshape==='streak'){
  const speed=Math.hypot(vx,vy)||1,length=size+speed*p.stretch,steps=Math.max(1,Math.ceil(length*2)),visited=new Set();
  for(let k=0;k<=steps;k++){const t=k/steps,px=Math.floor(x-vx/speed*length*t),py=Math.floor(y-vy/speed*length*t),key=px+':'+py;if(visited.has(key))continue;visited.add(key);put(result,n,px,py,light*(1-.85*t),true);}return;
 }
 const first=p.pshape==='square'?-Math.floor((side-1)/2):-r,last=p.pshape==='square'?first+side-1:r;
 for(let j=first;j<=last;j++)for(let i=first;i<=last;i++){
  const manhattan=Math.abs(i)+Math.abs(j);
  const included=p.pshape==='square'||(p.pshape==='diamond'?manhattan<=r:p.pshape==='plus'?i===0||j===0:i*i+j*j<=side*side/4);
  if(included)put(result,n,cx+i,cy+j,light*(p.pshape==='plus'&&manhattan>0?1-(manhattan-1)/(r+1)*.5:1),true);
 }
}
export function particlesRaster(n,frames,frame,p){
 const result=surface(n);
 for(let index=0;index<Math.round(p.count);index++){
  const sequence=seededSequence((p.seed*9973+index*131)|0),samples=Array.from({length:8},sequence);
  const birth=p.start*frames+(p.emit==='burst'?samples[0]*1.5:(index+samples[0])/p.count*p.span*frames);
  const duration=Math.max(1,p.life*frames*(1-p.lifeVar*samples[1]));
  let age=frame-birth;if(p.loop)age=fraction(age/frames)*frames;if(age<0||age>=duration)continue;
  let x0=p.x*n,y0=p.y*n;
  if(p.area==='circle'||p.area==='ring'){const a=samples[2]*TAU,r=p.area==='circle'?Math.sqrt(samples[3]):1;x0+=Math.cos(a)*r*p.aw;y0+=Math.sin(a)*r*p.ah;}
  else if(p.area==='box'||p.area==='line'){x0+=(samples[2]-.5)*p.aw;if(p.area==='box')y0+=(samples[3]-.5)*p.ah;}
  const ox=x0-p.x*n,oy=y0-p.y*n;
  const direction=p.dirMode==='outward'?(Math.hypot(ox,oy)>.1?Math.atan2(oy,ox):samples[4]*TAU)+deg((samples[4]-.5)*p.spread*.25):deg(p.angle+(samples[4]-.5)*p.spread);
  const speed=p.speed*(1-p.speedVar*samples[5]),ix=p.dirMode==='inward'?-ox/duration*p.speed:Math.cos(direction)*speed,iy=p.dirMode==='inward'?-oy/duration*p.speed:Math.sin(direction)*speed;
  const retain=1-p.drag,decay=retain**age,distance=p.drag?(1-decay)/p.drag:age;
  let vx=ix*decay,vy=iy*decay+p.gravity*age,x=x0+ix*distance,y=y0+iy*distance+p.gravity*age*age/2;
  if(p.ground>0){x=x0;y=y0;vx=ix;vy=iy;for(let k=0;k<Math.floor(age);k++){vx*=retain;vy=vy*retain+p.gravity;x+=vx;y+=vy;if(y>p.ground){y=p.ground;vx*=.7;vy=-vy*p.bounce;}}}
  x+=Math.sin(age*.35+samples[6]*TAU)*p.turb;y+=Math.cos(age*.27+samples[7]*TAU)*p.turb*.5;
  const t=age/duration,fade=p.fade==='flat'?1:p.fade==='inout'?Math.sin(Math.PI*t):p.fade==='flicker'?(1-t)*(cellSample(index,frame,p.seed)>.4?1:.35):1-t;
  const light=fade*p.bright*(1-p.brightVar*cellSample(index,7,p.seed));
  if(light>0)stampParticle(result,n,x,y,interpolate(p.sizeA,p.sizeB,t),light,p,vx,vy);
 }
 return result;
}
export function lightningRaster(n,frame,p){
 const result=surface(n),random=seededSequence(p.seed+(p.rate?Math.floor(frame/p.rate):0)*7919);
 function branch(a,b,depth,width,light){
  if(depth<=0){const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2));for(let k=0;k<=steps;k++)disk(result,n,interpolate(a[0],b[0],k/steps),interpolate(a[1],b[1],k/steps),width/2,light);return;}
  const dx=b[0]-a[0],dy=b[1]-a[1],offset=(random()-.5)*p.jag,m=[(a[0]+b[0])/2-dy*offset,(a[1]+b[1])/2+dx*offset];
  branch(a,m,depth-1,width,light);branch(m,b,depth-1,width,light);
  if(depth>1&&random()<p.branch)branch(m,[m[0]+(dx-dy)*p.branchLen,m[1]+(dy+dx)*p.branchLen],depth-2,Math.max(.5,width*.7),light*.65);
 }
 branch([p.x0*n,p.y0*n],[interpolate(p.x0,p.x1,p.grow)*n,interpolate(p.y0,p.y1,p.grow)*n],Math.round(p.detail),p.thick,p.intensity);
 return result;
}
