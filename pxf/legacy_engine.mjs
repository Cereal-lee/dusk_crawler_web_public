// Independent, deterministic pixel renderer. PXF graph envelope interoperability.
export const DEFS = {
 Shape:{label:'도형',inputs:0,params:{shape:'circle',x:.5,y:.5,size:16,size2:.45,points:5,rot:0,aspect:1,stroke:0,falloff:.6,intensity:1}},
 Arc:{label:'호 / 참격',inputs:0,params:{x:.5,y:.5,radius:25,thick:9,start:-140,sweep:250,head:1,tail:.8,taper:1.2,aspect:.8,rot:0,intensity:1}},
 Particles:{label:'파티클',inputs:0,params:{count:24,seed:12345,x:.5,y:.5,start:0,life:1,speed:1,spread:360,angle:-90,gravity:0,sizeA:2,sizeB:0,bright:1}},
 Noise:{label:'노이즈',inputs:0,params:{seed:12345,scale:4,intensity:1}},
 Gradient:{label:'그라디언트',inputs:0,params:{x:.5,y:.5,radius:25,intensity:1}},
 Lightning:{label:'번개',inputs:0,params:{seed:12345,x:.5,y:.1,endX:.5,endY:.9,width:2,jitter:8,intensity:1}},
 Transform:{label:'변형',inputs:1,params:{x:0,y:0,scale:1,rot:0,opacity:1}},
 Blend:{label:'합성',inputs:2,params:{mode:'over',opacity:1}},
 Mask:{label:'마스크',inputs:2,params:{mode:'multiply',strength:1}},
 Palette:{label:'팔레트 맵',inputs:1,params:{colors:['#291d49','#7441b8','#bd8eff','#f5e7ff'],cutoff:.05,shift:0,opacity:1}},
 Tint:{label:'틴트',inputs:1,params:{color:'#c9f58a',amount:1,bright:1,opacity:1}},
 Pixelate:{label:'픽셀화',inputs:1,params:{block:2}},
 Glow:{label:'글로우',inputs:1,params:{radius:2,strength:.5}},
 Output:{label:'출력',inputs:1,params:{alpha:'soft',threshold:.1}}
};
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function value(v,t,f){
 if(typeof v==='number')return v;
 if(v&&Array.isArray(v.k)){let k=v.k;if(f<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++)if(f<k[i][0])return value({a:k[i-1][1],b:k[i][1],e:k[i-1][2]},(f-k[i-1][0])/(k[i][0]-k[i-1][0]),f);return k.at(-1)[1];}
 if(v&&typeof v==='object'&&'a'in v){let u=clamp((t-(v.t0??0))/Math.max(.0001,(v.t1??1)-(v.t0??0)));if(v.e==='out')u=1-(1-u)**2;if(v.e==='in')u=u*u;if(v.e==='pulse')u=Math.sin(u*Math.PI);if(v.e==='inout')u=u*u*(3-2*u);return v.a+(v.b-v.a)*u;}return v;
}
export function validate(raw){
 if(JSON.stringify(raw).length>262144)throw Error('JSON은 256KB 이하여야 합니다.');
 const g=structuredClone(raw),s=g?.settings;
 if(!s||![32,48,64,96,128].includes(s.size)||!Number.isInteger(s.frames)||s.frames<1||s.frames>32||!Number.isFinite(s.fps)||s.fps<1||s.fps>60)throw Error('크기 32/48/64/96/128, 프레임 1~32, FPS 1~60을 지정하세요.');
 if(typeof g.name!=='string'||!g.name.trim()||g.name.length>60)throw Error('이름은 1~60자여야 합니다.');
 if(!Array.isArray(g.nodes)||g.nodes.length<1||g.nodes.length>32||!Array.isArray(g.links)||g.links.length>64)throw Error('노드 1~32개, 연결 64개까지 지원합니다.');
 const ids=new Map();let outputs=0;
 function inspect(v,depth=0){if(depth>12)throw Error('파라미터 구조가 너무 깊습니다.');if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>100000))throw Error('숫자 범위를 확인하세요.');if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('허용되지 않는 키입니다.');inspect(x,depth+1);}}
 inspect(g);
 for(const n of g.nodes){if(!Object.hasOwn(DEFS,n.type))throw Error(`지원하지 않는 노드: ${n.type}. 이 공방의 규격 안내를 확인하세요.`);if(typeof n.id!=='string'||!/^[-\w]{1,64}$/.test(n.id)||ids.has(n.id))throw Error('노드 ID가 잘못되었거나 중복되었습니다.');ids.set(n.id,n);if(n.type==='Output')outputs++;
 n.params={...DEFS[n.type].params,...n.params};for(const [key,base]of Object.entries(DEFS[n.type].params)){let v=n.params[key];if(typeof base==='number'){if(typeof v==='number')continue;if(v?.k&&Array.isArray(v.k)&&v.k.length&&v.k.length<=64&&v.k.every((a,i)=>Array.isArray(a)&&a.length>=2&&typeof a[0]==='number'&&typeof a[1]==='number'&&a[0]>=0&&a[0]<s.frames&&(!i||a[0]>v.k[i-1][0])))continue;if(v&&typeof v.a==='number'&&typeof v.b==='number')continue;throw Error(`${n.id}.${key}: 숫자 또는 키프레임이 필요합니다.`);}if(typeof base==='string'&&typeof v!=='string')throw Error(`${key}: 문자열이 필요합니다.`);}
 if(n.type==='Palette'&&(!Array.isArray(n.params.colors)||!n.params.colors.length||n.params.colors.length>32||n.params.colors.some(c=>!/^#[\da-f]{6}$/i.test(c))))throw Error('팔레트는 #RRGGBB 색상 1~32개입니다.');if(n.type==='Tint'&&!/^#[\da-f]{6}$/i.test(n.params.color))throw Error('틴트 색상은 #RRGGBB입니다.');
 }
 if(outputs!==1)throw Error('Output 노드가 정확히 하나 필요합니다.');const ports=new Set();
 for(const l of g.links){if(!ids.has(l.f)||!ids.has(l.t)||ids.get(l.f).type==='Output'||!Number.isInteger(l.p)||l.p<0||l.p>=DEFS[ids.get(l.t).type].inputs)throw Error('노드 연결을 확인하세요.');let key=l.t+':'+l.p;if(ports.has(key))throw Error('입력 하나에 연결은 하나만 가능합니다.');ports.add(key);}
 const done=new Set(),active=new Set();function visit(id){if(active.has(id))throw Error('순환 연결은 지원하지 않습니다.');if(done.has(id))return;active.add(id);for(const l of g.links.filter(l=>l.t===id))visit(l.f);active.delete(id);done.add(id);}for(const id of ids.keys())visit(id);
 const out=g.nodes.find(n=>n.type==='Output');if(!g.links.some(l=>l.t===out.id))throw Error('출력에 노드를 연결하세요.');s.loop=Boolean(s.loop);g.format='pxf.graph@1';return g;
}
function hash(seed,i){let x=Math.imul((seed|0)^(i+1),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;}
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
export function renderFrame(graph,frame=0,alreadyValidated=false){
 const g=alreadyValidated?graph:validate(graph),n=g.settings.size,f=clamp(Math.floor(frame),0,g.settings.frames-1),t=f/Math.max(1,g.settings.frames-1),cache=new Map();
 function run(id){if(cache.has(id))return cache.get(id);const node=g.nodes.find(v=>v.id===id),p=Object.fromEntries(Object.entries(node.params).map(([k,v])=>[k,value(v,t,f)])),data=new Float32Array(n*n*4);
 const input=port=>{const l=g.links.find(l=>l.t===id&&l.p===port);return l?run(l.f):new Float32Array(data.length);};
 const put=(x,y,a,c=[1,1,1])=>{x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=n||y>=n)return;const k=(y*n+x)*4;if(a>data[k+3]){data[k]=c[0];data[k+1]=c[1];data[k+2]=c[2];data[k+3]=clamp(a);}};
 if(['Shape','Arc','Gradient','Noise'].includes(node.type))for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 let dx=x+.5-(p.x??.5)*n,dy=(y+.5-(p.y??.5)*n)/Math.max(.05,p.aspect??1),ang=(p.rot??0)*Math.PI/180,xx=dx*Math.cos(ang)+dy*Math.sin(ang),yy=-dx*Math.sin(ang)+dy*Math.cos(ang),r=Math.hypot(xx,yy),a=0;
 if(node.type==='Noise')a=hash(p.seed,Math.floor(x/Math.max(1,p.scale))+Math.floor(y/Math.max(1,p.scale))*n+f*17)*p.intensity;
 if(node.type==='Gradient')a=clamp(1-r/Math.max(.1,p.radius))*p.intensity;
 if(node.type==='Shape'){let rho=r/Math.max(.01,p.size);if(p.shape==='square')rho=Math.max(Math.abs(xx),Math.abs(yy))/p.size;if(p.shape==='diamond')rho=(Math.abs(xx)+Math.abs(yy))/p.size;if(p.shape==='cross')rho=Math.min(Math.max(Math.abs(xx)/p.size,Math.abs(yy)/(p.size*.25)),Math.max(Math.abs(yy)/p.size,Math.abs(xx)/(p.size*.25)));if(p.shape==='star')rho=r/(p.size*(.65+.35*Math.cos(Math.atan2(yy,xx)*Math.round(p.points))));if(rho<=1&&(p.shape!=='ring'||rho>p.size2)&&(p.stroke<=0||rho>=1-p.stroke/p.size))a=(1-p.falloff*rho)*p.intensity;}
 if(node.type==='Arc'){let deg=(Math.atan2(yy,xx)*180/Math.PI-p.start)*Math.sign(p.sweep||1);deg=(deg%360+360)%360;let pos=deg/Math.max(1,Math.abs(p.sweep)),u=(pos-(p.head-p.tail))/Math.max(.01,p.tail),thick=p.thick*Math.pow(clamp(u),Math.max(0,p.taper));if(u>=0&&u<=1&&pos<=1&&r<=p.radius&&r>p.radius-thick)a=(.4+.6*clamp(u))*p.intensity;}
 put(x,y,a);
 }
 if(node.type==='Particles'){for(let i=0;i<clamp(p.count,1,200);i++){let age=(t-p.start)/Math.max(.02,p.life);if(age<0||age>1)continue;let ang=(p.angle+(hash(p.seed,i*3)-.5)*p.spread)*Math.PI/180,dist=age*g.settings.frames*p.speed*(.5+hash(p.seed,i*3+1)),cx=p.x*n+Math.cos(ang)*dist,cy=p.y*n+Math.sin(ang)*dist+p.gravity*(age*g.settings.frames)**2,sz=clamp(p.sizeA+(p.sizeB-p.sizeA)*age,0,16);for(let y=-sz;y<=sz;y++)for(let x=-sz;x<=sz;x++)if(Math.abs(x)+Math.abs(y)<=sz)put(cx+x,cy+y,(1-age)*p.bright);}}
 if(node.type==='Lightning'){for(let y=0;y<n;y++){let u=(y-p.y*n)/Math.max(1,(p.endY-p.y)*n);if(u<0||u>1)continue;let x=(p.x+(p.endX-p.x)*u)*n+(hash(p.seed,Math.floor(y/4)+Math.floor(f/2)*31)-.5)*p.jitter;for(let j=-clamp(p.width,1,8);j<=clamp(p.width,1,8);j++)put(x+j,y,p.intensity*(1-Math.abs(j)/(p.width+1)));}}
 if(DEFS[node.type].inputs){const a=input(0),b=DEFS[node.type].inputs>1?input(1):null;data.set(a);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=(y*n+x)*4;
 if(node.type==='Palette'){let v=a[k+3];if(v<=p.cutoff){data[k+3]=0;continue;}let c=rgb(p.colors[Math.floor(clamp((v-p.cutoff)/(1-p.cutoff)+p.shift,0,.99999)*p.colors.length)]);data.set([...c,clamp(p.opacity)],k);}
 if(node.type==='Tint'){let c=rgb(p.color);for(let z=0;z<3;z++)data[k+z]=clamp((a[k+z]*(1-p.amount)+c[z]*p.amount)*p.bright);data[k+3]*=clamp(p.opacity);}
 if(node.type==='Mask')data[k+3]*=p.mode==='cutout'?1-b[k+3]*p.strength:b[k+3]*p.strength;
 if(node.type==='Blend'){let alpha=clamp(b[k+3]*p.opacity),aa=a[k+3],sum=alpha+aa*(1-alpha);for(let z=0;z<3;z++)data[k+z]=p.mode==='add'?clamp(a[k+z]*aa+b[k+z]*alpha):(b[k+z]*alpha+a[k+z]*aa*(1-alpha))/Math.max(.0001,sum);data[k+3]=p.mode==='add'?clamp(aa+alpha):sum;}
 if(node.type==='Output'&&p.alpha==='hard')data[k+3]=a[k+3]>=p.threshold?1:0;
 if(node.type==='Pixelate'){let block=Math.round(clamp(p.block,1,8)),j=(Math.floor(y/block)*block*n+Math.floor(x/block)*block)*4;data.set(a.subarray(j,j+4),k);}
 if(node.type==='Transform'){let rad=-p.rot*Math.PI/180,dx=x-n/2-p.x,dy=y-n/2-p.y,xx=Math.round((dx*Math.cos(rad)-dy*Math.sin(rad))/Math.max(.05,p.scale)+n/2),yy=Math.round((dx*Math.sin(rad)+dy*Math.cos(rad))/Math.max(.05,p.scale)+n/2);data.fill(0,k,k+4);if(xx>=0&&xx<n&&yy>=0&&yy<n){let j=(yy*n+xx)*4;data.set(a.subarray(j,j+4),k);data[k+3]*=clamp(p.opacity);}}
 if(node.type==='Glow'){let sum=0,count=0,r=Math.round(clamp(p.radius,1,4));for(let yy=Math.max(0,y-r);yy<=Math.min(n-1,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(n-1,x+r);xx++){sum+=a[(yy*n+xx)*4+3];count++;}if(!a[k+3]){data[k]=data[k+1]=data[k+2]=1;}data[k+3]=clamp(a[k+3]+sum/count*p.strength);}
 }
 }
 cache.set(id,data);return data;}
 const result=run(g.nodes.find(n=>n.type==='Output').id);return Uint8ClampedArray.from(result,v=>Math.round(clamp(v)*255));
}
export function sheet(graph){const g=validate(graph),size=g.settings.size,columns=Math.min(8,g.settings.frames),width=size*columns,height=size*Math.ceil(g.settings.frames/columns),pixels=new Uint8ClampedArray(width*height*4);for(let f=0;f<g.settings.frames;f++){const data=renderFrame(g,f,true);for(let y=0;y<size;y++)pixels.set(data.subarray(y*size*4,(y+1)*size*4),((Math.floor(f/columns)*size+y)*width+(f%columns)*size)*4);}return {width,height,pixels,columns};}
export function godotResource(graph,stem='efx_custom'){const g=validate(graph),s=g.settings,size=s.size,cols=Math.min(8,s.frames);let str=`[gd_resource type="SpriteFrames" load_steps=${s.frames+2} format=3]\n\n[ext_resource type="Texture2D" path="res://art/combat_vfx/${stem}.png" id="1"]\n`;for(let i=0;i<s.frames;i++)str+=`\n[sub_resource type="AtlasTexture" id="Atlas_${i}"]\natlas = ExtResource("1")\nregion = Rect2(${i%cols*size}, ${Math.floor(i/cols)*size}, ${size}, ${size})\n`;return str+`\n[resource]\nanimations = [{\n"frames": [${Array.from({length:s.frames},(_,i)=>`{"duration": 1.0, "texture": SubResource("Atlas_${i}")}`).join(',')}],\n"loop": ${s.loop},\n"name": &"default",\n"speed": ${s.fps}.0\n}]\n`.replace(`${s.fps}.0`,String(s.fps));}
