const links=[['pxf','PXF 공방'],['bgm','BGM 공방'],['image','이미지 공방'],['item','아이템 공방'],['sd','SD 캐릭터 공방']];
const path=location.pathname,current=path==='/bgm.html'?'bgm':links.find(([key])=>path.startsWith('/'+key+'/'))?.[0];
const bar=document.createElement('div');bar.className='workshop-bar';
bar.innerHTML='<a class="workshop-logo" href="/"><span class="logo-emblem">D</span><span>DUSK CRAWLER<small>공방</small></span></a><nav aria-label="공방 선택">'+links.map(([key,label])=>`<a href="/${key}/" ${current===key?'aria-current="page"':''}>${label}</a>`).join('')+'</nav>';
document.body.prepend(bar);document.body.classList.add('with-workshop-bar');
if(current==='pxf')document.body.classList.add('pxf-page');
if(current==='bgm')document.body.classList.add('bgm-page');
if(path==='/'&&location.hash.startsWith('#graph='))location.replace('/pxf/'+location.hash);
