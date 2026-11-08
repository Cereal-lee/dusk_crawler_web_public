export function makeGraph(name,type,params,colors,index=0){return {format:'pxf.graph@1',name,settings:{size:64,frames:24,fps:24,loop:false},nodes:[{id:'source',type,x:40,y:100,params},{id:'palette',type:'Palette',x:270,y:100,params:{colors}},{id:'out',type:'Output',x:500,y:100,params:{alpha:'soft',threshold:.1}}],links:[{f:'source',t:'palette',p:0},{f:'palette',t:'out',p:0}],game:{style:'dusk-crawler-pixel-v1',pivot:[.5,.5],blend:'add',logicalSize:64,impactFrame:4},id:'preset_'+index};}
const purple=['#291847','#6433a0','#ae72ed','#eac8ff','#fff2ff'],fire=['#4a182e','#b5323d','#f87437','#ffcf75','#fff4d4'],ice=['#152c54','#266ea5','#60d6e8','#c0f9ff','#ffffff'],green=['#143a36','#237b5a','#78cc82','#c5f499','#f3ffdb'];
export const PRESETS=[
 makeGraph('황혼 · 보랏빛 참격','Arc',{head:{a:.1,b:1.5,e:'out'},thick:{a:12,b:1},intensity:{a:1,b:.15},rot:-25},purple,0),
 makeGraph('잿불 · 폭발','Particles',{seed:12345,count:65,speed:1.3,sizeA:4,sizeB:0,spread:360,angle:0,life:1},fire,1),
 makeGraph('서리 · 결정 파편','Particles',{seed:883,count:24,speed:.9,sizeA:3,sizeB:0,spread:250,gravity:.018,angle:-90,life:1},ice,2),
 makeGraph('회복 · 생명의 빛','Particles',{seed:64,count:36,speed:.7,sizeA:2,sizeB:0,spread:110,angle:-90,life:1},green,3),
 makeGraph('집중 · 마법진','Shape',{shape:'ring',size:{a:4,b:27,e:'out'},size2:.82,aspect:.5,falloff:.6,intensity:{a:1,b:.2}},purple,4),
 makeGraph('뇌전 · 심판','Lightning',{seed:90,width:2,jitter:14,intensity:{a:1,b:.15},x:.5,y:.08,endX:.5,endY:.9},ice,5),
 makeGraph('비색 · 충격파','Shape',{shape:'ring',size:{a:1,b:29,e:'out'},size2:.7,falloff:.4,intensity:{a:1,b:.1}},fire,6),
 makeGraph('수호 · 별빛','Shape',{shape:'star',points:6,rot:{a:0,b:90},size:{a:3,b:24,e:'pulse'},falloff:.8},green,7),
 makeGraph('영혼 · 흩어진 기억','Particles',{seed:424,count:18,speed:.5,sizeA:3,sizeB:0,spread:360,life:1},purple,8),
 makeGraph('지시 · 집중의 고리','Arc',{head:{a:.1,b:1.4},tail:.9,radius:25,thick:3,aspect:1,rot:{a:0,b:180}},green,9),
 makeGraph('서고 · 봉인 해제','Shape',{shape:'diamond',size:{a:1,b:26,e:'pulse'},stroke:3,rot:{a:0,b:180},falloff:.5},ice,10),
 makeGraph('극장 · 피날레','Particles',{seed:616,count:80,speed:1.2,sizeA:2,sizeB:0,spread:360,gravity:.015,life:1},fire,11)
];
