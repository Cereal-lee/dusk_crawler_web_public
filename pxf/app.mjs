import {LibrarySync} from './library_sync.mjs';
import {DEFS,getDefs,isLegacy,EASINGS,validate,renderFrame,sheet,godotResource} from './engine.mjs';
import {PRESETS,makeGraph} from './presets.mjs';
const $=s=>document.querySelector(s),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let editorVersion=0,saveBusy=false;
let library=[],view='grid',current=null,selected=null,playing=true,frame=0,epoch=0,cached=[],cards=[],toastTimer,dirty=false,promptReference=null,catalogFilter="all",visibleLimit=24,renderJob=null,renderTimer=null,aiBusy=false,aiPrevious=null,aiSummary="";
const cloud=new LibrarySync({storage:localStorage,onChange:graphs=>{library=graphs;renderFeed();},onStatus:(state,message)=>{$('#sync-state').textContent=message;$('#sync-state').dataset.state=state;$('#sync-login').hidden=state!=='login';$('#account-label').textContent=cloud.user?.email|| (cloud.user?'로그인한 계정의 작업실':'계정 연결 대기');},onConflict:()=>toast('다른 기기의 수정본과 충돌해 두 작품을 모두 보관했습니다.')});
let cloudReady=cloud.sync();
async function saveWork(graph,version){await cloudReady;const result=await cloud.save(graph,version);return result;}
window.addEventListener('online',()=>cloud.sync());window.addEventListener('focus',()=>cloud.sync());
window.addEventListener('storage',event=>{if(event.key?.startsWith('dusk-pxf-account:'))cloud.sync();});
setInterval(()=>{if(!document.hidden)cloud.sync();},30000);
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4000);}
function modal(title,html){$('#modal-title').textContent=title;$('#modal-body').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
function download(name,data,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('복사했습니다.');}catch{modal('복사할 내용',`<textarea readonly>${escape(text)}</textarea><p>전체 선택 후 복사하세요.</p>`);}}
const stem=g=>'efx_'+(g.name.replace(/[^a-zA-Z0-9_가-힣]+/g,'_').replace(/^_+|_+$/g,'')||'custom');
function renderFeed(){
 const search=$('#search').value.toLowerCase(),all=[...library,...PRESETS],matched=all.filter(g=>(catalogFilter==='all'||(catalogFilter==='presets'&&g.id?.startsWith('preset_'))||(catalogFilter==='mine'&&!g.id?.startsWith('preset_')))&&g.name.toLowerCase().includes(search)),items=matched.slice(0,visibleLimit);
 cards=[];$('#feed').className=view==='grid'?'grid':'';
 $('#library-count').textContent=`${matched.length}개 이펙트 · Dusk Crawler`;
 $('#feed').innerHTML=items.length?items.map((g,i)=>`<article class="card"><div class="card-head"><span class="avatar">D</span><div><div class="author">Dusk Crawler <small>· ${g.id?.startsWith('preset')?'시작 템플릿':'내 작업'}</small></div><h3>${escape(g.name)}</h3></div><button data-card="${i}" data-op="edit" aria-label="${escape(g.name)} 상세 보기">···</button></div><button class="stage checker" data-card="${i}" data-op="edit" aria-label="${escape(g.name)} 미리보기 및 편집"><canvas width="${g.settings.size}" height="${g.settings.size}"></canvas><small>${g.settings.size} × ${g.settings.size} · ${g.settings.frames}프레임 · ${g.settings.fps} FPS</small></button><div class="card-actions"><button data-card="${i}" data-op="remix">AI로 변형</button><button data-card="${i}" data-op="json">▤ JSON</button><button data-card="${i}" data-op="png">PNG ↓</button><button data-card="${i}" data-op="link" aria-label="${escape(g.name)} 링크 복사">▢</button></div></article>`).join(''):'<p class="empty">검색 결과가 없습니다. 새 이펙트를 만들어 보세요.</p>';
 $('#feed').querySelectorAll('canvas').forEach((canvas,i)=>cards.push({canvas,g:validate(items[i]),cache:new Map()}));
 $('#feed').querySelectorAll('[data-card]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const g=items[Number(button.dataset.card)],op=button.dataset.op;
 if(op==='edit')openEditor(g);if(op==='remix')openPrompt(g);if(op==='json')download(stem(g)+'.pxf.json',JSON.stringify(g,null,2));if(op==='png')exportPng(g);if(op==='link')copy(location.origin+location.pathname+'#graph='+encodeGraph(g));
 }catch(e){toast(e.message);}finally{button.disabled=false;}});
 $('#load-more').hidden=matched.length<=items.length;
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.action===view));
}
function encodeGraph(g){return btoa(unescape(encodeURIComponent(JSON.stringify(g))));}
function draw(canvas,data,size){if(canvas.width!==size)canvas.width=canvas.height=size;canvas.getContext('2d').putImageData(new ImageData(data,size,size),0,0);}
function updateFrames(){
 current=validate(current);cached=[];frame=Math.min(frame,current.settings.frames-1);$('#scrub').max=current.settings.frames-1;dirty=true;
 renderJob?.terminate();clearTimeout(renderTimer);$('#editor-status').textContent='미리보기 렌더링 중…';
 const job=new Worker('/render_worker.mjs',{type:'module'});renderJob=job;
 const fail=message=>{if(renderJob!==job)return;job.terminate();renderJob=null;clearTimeout(renderTimer);$('#editor-status').textContent=message;toast(message);};
 job.onmessage=({data})=>{if(renderJob!==job)return;if(data.error){fail(data.error);return;}cached=data.frames;epoch=performance.now()-frame/current.settings.fps*1000;$('#editor-status').textContent=`${current.nodes.length}개 노드 · ${cached.length}프레임 · Dusk public 엔진 렌더링 완료`;clearTimeout(renderTimer);job.terminate();renderJob=null;};
 job.onerror=()=>fail('렌더링에 실패했습니다. 노드 속성을 확인해 주세요.');renderTimer=setTimeout(()=>fail('렌더링 시간이 초과되었습니다. 반복 수나 해상도를 줄여 주세요.'),30000);job.postMessage({graph:current});
}
function openEditor(g,fromAi=false){if(!fromAi){aiPrevious=null;aiSummary='';}$('#undo-ai').hidden=!aiPrevious;$('#ai-summary').hidden=!aiSummary;$('#ai-summary').textContent=aiSummary;current=validate(g);editorVersion=cloud.version(current.id);$('#modal').close();selected=null;frame=0;playing=true;epoch=performance.now();$('#name').value=current.name;for(const k of ['size','frames','fps'])$('#'+k).value=current.settings[k];$('#loop').checked=current.settings.loop;$('#editor-title').textContent=current.name;$('#properties').innerHTML='<p>노드를 선택하면 속성이 표시됩니다.</p>';showNodes();updateFrames();dirty=false;if(!$('#editor').open)$('#editor').showModal();}
function showNodes(){$('#graph').hidden=false;$('#graph-json').hidden=true;$('#apply-json').hidden=true;renderGraph();}
function renderGraph(){const defs=getDefs(current);const coords=current.nodes.map((n,i)=>({n,x:Number.isFinite(n.x)?Math.max(10,n.x):40+i*220,y:Number.isFinite(n.y)?Math.max(10,n.y):120}));$('#nodes').innerHTML=coords.map(({n,x,y})=>`<div class="node ${n.id===selected?'selected':''}" data-id="${escape(n.id)}" data-type="${n.type}" style="left:${x}px;top:${y}px"><h4>${escape(n.type)} <small>${getDefs(current)[n.type].label}</small></h4><p>${escape(n.id)}</p><div class="ports"><span>${getDefs(current)[n.type].inputs?'● 입력':'생성'}</span><span>${n.type==='Output'?'최종 출력':'출력 ●'}</span></div></div>`).join('');$('#wires').innerHTML=current.links.map(l=>{let a=coords.find(p=>p.n.id===l.f),b=coords.find(p=>p.n.id===l.t);return `<path d="M ${a.x+174} ${a.y+75} C ${a.x+220} ${a.y+75},${b.x-45} ${b.y+75},${b.x} ${b.y+75}" fill="none" stroke="#7aafb0" stroke-width="2"/>`;}).join('');$('#graph').style.minWidth=Math.max(800,...coords.map(p=>p.x+220))+'px';$('#graph').style.minHeight=Math.max(500,...coords.map(p=>p.y+140))+'px';$('#nodes').querySelectorAll('.node').forEach(el=>{el.onclick=()=>selectNode(el.dataset.id);el.querySelector('h4').onpointerdown=e=>{e.preventDefault();const node=current.nodes.find(n=>n.id===el.dataset.id),startX=e.clientX,startY=e.clientY,x=parseFloat(el.style.left),y=parseFloat(el.style.top);const move=ev=>{node.x=Math.max(10,x+ev.clientX-startX);node.y=Math.max(10,y+ev.clientY-startY);renderGraph();dirty=true;};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);};});}
function parameterFields(node){
 const def=getDefs(current)[node.type];return def.fields||Object.entries(def.params).map(([n,d])=>({n,d,label:n,t:Array.isArray(d)?'palette':typeof d==='number'?'num':'text'}));
}
function propertyControls(node){return parameterFields(node).map(q=>{
 const v=node.params[q.n]??q.d,label=escape(q.label||q.n),key=escape(q.n),animated=v&&typeof v==='object'&&!Array.isArray(v),attrs=`data-param="${key}"`;
 let input;if(animated||q.t==='palette')input=`<textarea ${attrs} data-kind="json" aria-label="${label}" rows="3">${escape(JSON.stringify(v))}</textarea>`;
 else if(q.t==='sel')input=`<select ${attrs} data-kind="text" aria-label="${label}">${q.opt.map(option=>`<option ${option===v?'selected':''}>${escape(option)}</option>`).join('')}</select>`;
 else if(q.t==='bool')input=`<input ${attrs} data-kind="bool" type="checkbox" aria-label="${label}" ${v?'checked':''}>`;
 else if(['num','int','seed'].includes(q.t))input=`<input ${attrs} data-kind="number" type="number" aria-label="${label}" value="${v}" step="${q.step||'any'}" ${q.min!==undefined?`min="${q.min}" max="${q.max}"`:''}>`;
 else input=`<input ${attrs} data-kind="text" type="${q.t==='color'?'color':'text'}" aria-label="${label}" value="${escape(v)}">`;
 return `<div class="param-row"><div><label>${label}</label><small>${key}</small>${['num','int'].includes(q.t)?`<button data-animate="${key}" type="button">${animated?'고정값':'애니메이션'}</button>`:''}</div>${input}</div>`;
 }).join('');}
function readControls(){const params={...current.nodes.find(n=>n.id===selected).params};$('#property-controls').querySelectorAll('[data-param]').forEach(el=>{params[el.dataset.param]=el.dataset.kind==='json'?JSON.parse(el.value):el.dataset.kind==='number'?Number(el.value):el.dataset.kind==='bool'?el.checked:el.value;if(el.dataset.kind==='number'&&el.value.trim()==='')throw Error('숫자를 입력하세요.');});return params;}
function selectNode(id){
 selected=id;renderGraph();const n=current.nodes.find(n=>n.id===id),def=getDefs(current)[n.type];
 $('#properties').innerHTML=`<h3>${n.type} · ${def.label}</h3>${Array.from({length:def.inputs},(_,p)=>`<label>${escape(def.inputLabels?.[p]||'입력 '+(p+1))}<select data-port="${p}"><option value="">연결 없음</option>${current.nodes.filter(v=>v.id!==id&&v.type!=='Output').map(v=>`<option value="${escape(v.id)}" ${current.links.some(l=>l.t===id&&l.p===p&&l.f===v.id)?'selected':''}>${escape(v.id)} · ${v.type}</option>`).join('')}</select></label>`).join('')}<div id="property-controls">${propertyControls(n)}</div><p>애니메이션 값: {"a":0,"b":1,"e":"out"}<br>키프레임: {"k":[[0,0],[12,1]]}</p><button class="primary" data-action="apply-controls">변경 적용</button><details class="raw-params"><summary>속성 JSON 직접 편집</summary><textarea id="params" aria-label="속성 JSON" spellcheck="false">${escape(JSON.stringify(n.params,null,2))}</textarea><button data-action="apply-params">JSON 적용</button></details><div class="actions">${n.type!=='Output'?'<button class="danger" data-action="remove-node">노드 삭제</button>':''}</div>`;
 $('#properties').querySelectorAll('[data-port]').forEach(el=>el.onchange=()=>{const backup=structuredClone(current);current.links=current.links.filter(l=>!(l.t===id&&l.p===Number(el.dataset.port)));if(el.value)current.links.push({f:el.value,t:id,p:Number(el.dataset.port)});try{updateFrames();renderGraph();}catch(e){current=backup;selectNode(id);toast(e.message);}});
 $('#properties').querySelectorAll('[data-animate]').forEach(button=>button.onclick=()=>{try{const next=structuredClone(current),params=readControls(),key=button.dataset.animate,v=params[key];params[key]=typeof v==='number'?{a:v,b:v,e:'linear'}:(v.k?.[0]?.[1]??v.a);next.nodes.find(n=>n.id===id).params=params;current=validate(next);updateFrames();selectNode(id);}catch(e){toast(e.message);}});
}
function exportPng(g){const s=sheet(g),c=document.createElement('canvas');c.width=s.width;c.height=s.height;c.getContext('2d').putImageData(new ImageData(s.pixels,s.width,s.height),0,0);c.toBlob(blob=>{if(blob)download(stem(g)+'.png',blob,'image/png');else toast('PNG를 만들지 못했습니다.');});}
async function importText(text){let raw=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');const parsed=JSON.parse(raw);if(Array.isArray(parsed)){const graphs=parsed.map(validate);await cloudReady;if(!cloud.user)await cloud.connect();const now=Date.now();for(let i=0;i<graphs.length;i++){const graph=graphs[i];if(!graph.id?.startsWith('user_'))graph.id='user_'+crypto.randomUUID();cloud.enqueue(graph,0,now-i);}cloud.emit();await cloud.sync();$('#modal').close();toast(`${graphs.length}개 이펙트를 가져왔습니다. 서버 동기화 상태를 확인해 주세요.`);}else{openEditor(validate(parsed));dirty=true;$('#modal').close();}}

const guide=`Dusk Crawler PXF 공방용 픽셀 VFX를 만들어 주세요. 게임은 Godot 4 .NET 실시간 오토배틀러이며 이 도구는 시각 연출만 만듭니다. 전투 판정/난수/시간 로직은 바꾸지 마세요.\n연결된 Dusk Crawler 공방 MCP의 pxf_guide를 먼저 읽고 pxf_render로 실제 PNG를 확인하며 개선하세요. 마지막에는 pxf.graph@1 JSON 코드 블록과 공방에서 여는 URL을 주세요. MCP가 없으면 아래 규격으로 JSON만 주세요.\n설정: size 32/48/64/96/128, frames 1~32, fps 1~60, loop boolean. nodes는 id/type/x/y/params, links는 f/t/p(0-based input). Output 정확히 하나, 순환 금지. 숫자는 {a,b,e:'linear'|'in'|'out'|'inout'|'in3'|'out3'|'pulse'|'wave'|'step',t0:0,t1:1} 또는 {k:[[frame,value,ease],...]}로 애니메이션. 고급 노드까지 29종 모두 지원합니다. renderer는 dusk-public@1로 지정하세요. 아래 노드/파라미터 규격을 사용하세요. 팔레트는 #RRGGBB.\n${JSON.stringify(DEFS)}\n예시:\n${JSON.stringify({...PRESETS[0],renderer:"dusk-public@1"})}`;
function openPrompt(reference=null,request=''){
 promptReference=reference?validate(reference):null;
 const g=promptReference;
 modal(g?'GPT로 작품 바꿔 만들기':'GPT로 이펙트 만들기',`${g?`<section class="prompt-reference" aria-label="기준 작품"><div class="checker"><canvas id="reference-preview" width="${g.settings.size}" height="${g.settings.size}" aria-label="기준 작품 미리보기"></canvas></div><div><small>기준 작품</small><strong>${escape(g.name)}</strong><small>${g.settings.size} × ${g.settings.size} · ${g.settings.frames}프레임 · ${g.settings.fps} FPS</small></div><button data-action="clear-reference" aria-label="기준 작품 해제">×</button></section><p>기준 작품을 GPT에 전달하고, 수정 결과를 공방에서 바로 엽니다. 바꾸고 싶은 부분을 적어 주세요.</p>`:''}<label for="request">${g?'바꾸고 싶은 내용':'만들 이펙트'}</label><textarea id="request" placeholder="${g?'예: 궤적과 타이밍은 유지하고 색상을 붉은색으로 바꿔줘.':'예: 황혼빛 낫을 휘두르는 보라색 참격. 짧은 잔상과 별빛 파편, 24프레임.'}">${escape(request)}</textarea><p class="note">기준 작품과 요청 내용이 OpenAI API로 전송됩니다. API 사용량에 따라 요금이 발생하며, 결과는 새 작업으로 저장됩니다. <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noreferrer">API 크레딧 관리 ↗</a></p><p id="ai-state" role="status">GPT 연결 확인 중…</p><div class="actions"><button class="primary" data-action="ai-remix" id="ai-submit" disabled>✧ GPT로 수정하고 적용</button></div><details class="manual-prompt"><summary>수동 프롬프트 도구</summary><div class="actions"><button data-action="copy-prompt">프롬프트 복사</button><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기 ↗</a><button data-action="prompt-txt">일반 AI용 TXT</button><button data-action="import">받은 JSON 붙여넣기 →</button></div></details>`);
 checkAiStatus();
 if(g){const canvas=$('#reference-preview'),f=Math.min(g.settings.frames-1,Math.floor(g.settings.frames/3));draw(canvas,renderFrame(g,f,true),g.settings.size);}
}
async function checkAiStatus(){
 const target=$('#ai-state'),button=$('#ai-submit');
 let select;
 if(button){target.insertAdjacentHTML('beforebegin','<label for="ai-model">GPT 모델</label><select id="ai-model" disabled aria-describedby="ai-price"><option>모델 확인 중…</option></select><p id="ai-price" class="note"></p><p class="note">공방 호환 모델 중 API 계정에 공개된 모델만 표시합니다. USD / 100만 토큰 단가이며 1회 고정 비용이 아닙니다. 추론 토큰은 출력 비용에 포함되며 캐시 쓰기·장문 할증은 별도 적용될 수 있습니다. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">공식 가격표 ↗</a> · 2026-11-07 확인</p>');select=$('#ai-model');}
 try{const r=await fetch(select?'/api/ai/models':'/api/ai/status',{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error||'GPT 연결 상태를 확인할 수 없습니다.');if(!target?.isConnected)return;
  if(!select){target.textContent=data.ready?`GPT 연결됨 · 기본 모델 ${data.model}`:'서버의 OpenAI API 연결이 필요합니다.';return;}
  if(!data.models?.length)throw Error('사용 가능한 공방 호환 모델이 없습니다.');
  select.innerHTML=data.models.map(m=>`<option value="${escape(m.id)}">${escape(m.id)} · 입력 $${m.input} / 출력 $${m.output}</option>`).join('');
  let saved;try{saved=localStorage.getItem('dusk-pxf-ai-model');}catch{}
  select.value=data.models.some(m=>m.id===saved)?saved:data.models.some(m=>m.id===data.defaultModel)?data.defaultModel:data.models[0].id;
  const update=()=>{const m=data.models.find(m=>m.id===select.value);$('#ai-price').textContent=`100만 토큰당 입력 $${m.input} · 캐시 입력 $${m.cached} · 출력 $${m.output}`;target.textContent=`GPT 연결됨 · ${m.id}`;try{localStorage.setItem('dusk-pxf-ai-model',m.id);}catch{}};
  select.addEventListener('change',update);select.disabled=false;button.disabled=false;update();
 }catch(e){if(target?.isConnected)target.textContent=e.message;}
}
async function applyAiRemix(){
 if(aiBusy)return;
 const instruction=$('#request').value.trim();if(!instruction||instruction.length>4000){toast('수정할 내용을 1~4,000자로 입력해 주세요.');return;}
 const reference=promptReference?structuredClone(promptReference):null,button=$('#ai-submit'),status=$('#ai-state');
 const model=$('#ai-model')?.value;if(!model)return;
 aiBusy=true;$('#ai-model').disabled=true;button.disabled=true;button.textContent='GPT가 수정 중…';$('#request').disabled=true;
 status.textContent='GPT가 노드와 속성을 수정하고 있습니다. 완료되면 자동으로 적용됩니다.';
 try{
  const response=await fetch('/api/ai/remix',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,request:instruction,graph:reference,requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(170000)});
  let result;try{result=await response.json();}catch{throw Error('서버 응답을 확인하지 못했습니다. 원본은 유지됩니다.');}
  if(!response.ok||result.error)throw Error(result.error||'GPT 수정 요청에 실패했습니다.');
  let graph=validate(result.graph);graph.id='user_'+crypto.randomUUID();
  let saved=false,synced=false;try{const stored=await saveWork(graph,0);graph=stored.graph;saved=true;synced=stored.synced;}catch{}
  aiPrevious=reference;aiSummary=`${result.model} · ${result.summary||'GPT 수정 결과를 적용했습니다.'}`;if(result.usage)aiSummary+=` · 입력 ${result.usage.inputTokens.toLocaleString()} / 출력 ${result.usage.outputTokens.toLocaleString()} 토큰 · 단가 기준 약 $${result.usage.estimatedUsd.toFixed(5)} (최종 차감액은 API 사용량 페이지 확인)`;aiBusy=false;
  openEditor(graph,true);dirty=!saved;toast(synced?'GPT 결과를 적용하고 계정 서버에 저장했습니다.':saved?'GPT 결과를 이 기기에 보관했습니다. 연결되면 서버에 동기화합니다.':'결과를 열었습니다. 저장하지 못했으니 JSON으로 내보내 주세요.');
 }catch(e){status.textContent=e.name==='TimeoutError'?'응답 대기 시간이 초과되었습니다. 원본은 유지됩니다. 잠시 후 다시 요청해 주세요.':e.message;}
 finally{aiBusy=false;if($('#ai-model'))$('#ai-model').disabled=false;if(button.isConnected){button.disabled=false;button.textContent='✧ GPT로 수정하고 적용';}if($('#request'))$('#request').disabled=false;}
}

function buildPrompt(){
 const reference=promptReference?'\n\n기준 작품: '+promptReference.name+'\n아래 JSON을 기준으로 요청한 부분을 수정하세요. 위 예시는 형식 안내이며 수정 대상은 아래 기준 작품입니다. 요청하지 않은 구조와 설정은 최대한 유지하고, 수정 후 전체 PXF JSON을 반환하세요.\n기준 작품 JSON:\n'+JSON.stringify(promptReference,null,2):'';
 return guide+reference+'\n\n요청: '+$('#request').value;
}
const actions={
 'load-more':()=>{visibleLimit+=24;renderFeed();},
 feed:()=>{view='feed';renderFeed();},grid:()=>{view='grid';renderFeed();},search:()=>{$('#search').hidden=!$('#search').hidden;$('#search').focus();},file:()=>$('#file').click(),
 import:()=>modal('JSON 가져오기','<p>PXF 그래프 또는 라이브러리 백업 JSON을 붙여넣으세요.</p><textarea id="import-json" placeholder="{ &quot;name&quot;: ... }" aria-label="가져올 JSON"></textarea><div class="actions"><button class="primary" data-action="do-import">가져오기</button><button data-action="file">파일 첨부</button></div><p>지원 노드 29종 · 고급 노드와 키프레임을 그대로 가져옵니다.</p>'),
 'do-import':()=>importText($('#import-json').value),
 new:()=>openEditor({...makeGraph('새 이펙트','Shape',{},['#39254e','#8754af','#d1a2f5','#fff1c3']),renderer:'dusk-public@1'}),
 close:()=>{if(aiBusy){toast('GPT가 수정 중입니다. 완료될 때까지 기다려 주세요.');return;}if($('#modal').open)$('#modal').close();else if(dirty)modal('편집 내용 보관','<p>라이브러리에 저장하고 닫거나 JSON을 내보내세요.</p><div class="actions"><button class="primary" data-action="save-close">저장하고 닫기</button><button data-action="discard">저장하지 않고 닫기</button></div>');else $('#editor').close();},
 discard:()=>{$('#modal').close();$('#editor').close();dirty=false;},'save-close':async()=>{await actions.save();$('#modal').close();$('#editor').close();},
 save:async()=>{if(saveBusy)return;saveBusy=true;$('#editor').inert=true;try{const g=validate({...current,name:$('#name').value});g.id=current.id?.startsWith('user_')?current.id:'user_'+crypto.randomUUID();const result=await saveWork(g,editorVersion);current=result.graph;editorVersion=result.version;dirty=false;$('#name').value=current.name;$('#editor-title').textContent=current.name;toast(result.synced?'계정 서버에 저장했습니다.':'이 기기에 보관했습니다. 연결되면 서버에 동기화합니다.');}finally{saveBusy=false;$('#editor').inert=false;}},
 sync:()=>cloud.sync(),
 backup:()=>download('dusk_pxf_library.json',JSON.stringify(library,null,2)),
 nodes:showNodes,json:()=>{$('#graph').hidden=true;$('#graph-json').hidden=false;$('#apply-json').hidden=false;$('#graph-json').value=JSON.stringify(current,null,2);},
 'apply-json':()=>{const g=validate(JSON.parse($('#graph-json').value));openEditor(g);dirty=true;toast('JSON을 적용했습니다.');},
 'apply-controls':()=>{const next=structuredClone(current);next.nodes.find(n=>n.id===selected).params=readControls();current=validate(next);updateFrames();selectNode(selected);},
 'apply-params':()=>{const next=structuredClone(current);next.nodes.find(n=>n.id===selected).params=JSON.parse($('#params').value);current=validate(next);updateFrames();selectNode(selected);toast('속성을 적용했습니다.');},
 'remove-node':()=>{const next=structuredClone(current);next.nodes=next.nodes.filter(n=>n.id!==selected);next.links=next.links.filter(l=>l.f!==selected&&l.t!==selected);current=validate(next);updateFrames();selected=null;renderGraph();$('#properties').innerHTML='<p>노드를 삭제했습니다.</p>';},
 tidy:()=>{current.nodes.forEach((n,i)=>{n.x=30+(i%3)*220;n.y=100+Math.floor(i/3)*180;});dirty=true;renderGraph();},
 add:()=>modal('노드 추가',`<div class="node-options">${Object.entries(getDefs(current)).filter(([k])=>k!=='Output').map(([k,v])=>`<button data-add="${k}">${v.label}<br><small>${k}</small></button>`).join('')}</div><p>추가한 노드를 선택하고 입력 연결을 설정하세요.</p>`),
 play:()=>{playing=!playing;epoch=performance.now()-frame/current.settings.fps*1000;},prev:()=>{playing=false;frame=Math.max(0,frame-1);},next:()=>{playing=false;frame=Math.min(cached.length-1,frame+1);},bg:()=>{const p=$('.preview');p.classList.toggle('checker');p.style.backgroundColor=p.classList.contains('checker')?'':'#303c45';},
 export:()=>modal('Godot로 내보내기',`<p>${escape(current.name)} · ${current.settings.frames}프레임 / ${current.settings.fps} FPS</p><div class="actions"><button class="primary" data-action="png">PNG 스프라이트 시트</button><button data-action="tres">SpriteFrames .tres</button><button data-action="download-json">PXF JSON</button></div><p>PNG와 .tres를 함께 내려받아 <code>res://art/combat_vfx/</code>에 넣으세요. AnimatedSprite2D의 Sprite Frames에 .tres를 지정하고 Texture Filter를 Nearest로 설정하세요.</p><div class="note">최대 8열 · 투명 배경 · 프레임 시간은 초 기준.<br>게임의 기존 SVG 연출 연결은 자동으로 변경하지 않습니다.</div>`),
 png:()=>exportPng(current),tres:()=>download(stem(current)+'.tres',godotResource(current,stem(current)),'text/plain'),'download-json':()=>download(stem(current)+'.pxf.json',JSON.stringify(current,null,2)),
 prompt:()=>openPrompt(),
 'ai-remix':applyAiRemix,
 'remix-current':()=>openPrompt(current),
 'undo-ai':()=>{if(aiPrevious){const previous=aiPrevious;openEditor(previous);toast('수정 전 작품으로 돌아왔습니다. GPT 결과는 내 작업에 남아 있습니다.');}},
 'clear-reference':()=>{const request=$('#request').value;openPrompt(null,request);},
 'copy-prompt':()=>copy(buildPrompt()),'prompt-txt':()=>download('dusk_pxf_prompt.txt',buildPrompt(),'text/plain'),
 connection:()=>{modal('GPT 연결',`<p>공방의 GPT 수정 기능은 서버에 보관된 OpenAI API 키를 사용합니다. 키는 브라우저에 전달되지 않습니다.</p><p id="ai-state" role="status">연결 확인 중…</p><p>작품에서 <b>이 작품 바꿔 만들기</b> → 요청 입력 → <b>GPT로 수정하고 적용</b>을 누르세요. 결과가 새 작업으로 저장되고 편집기에 열립니다.</p><div class="actions"><button data-action="prompt">GPT로 만들기</button><button data-action="check-mcp">MCP 서버 확인</button></div><p>ChatGPT/Codex용 공방 MCP 도구도 계속 사용할 수 있습니다.</p>`);checkAiStatus();},
 'check-mcp':async()=>{const r=await fetch('/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});const b=await r.json();if(!r.ok||!b.result?.tools)throw Error('서버 연결을 확인하지 못했습니다.');toast('MCP 서버 정상 · '+b.result.tools.length+'개 도구 (계정 연결 상태와 별개)');}
};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action],[data-add]');if(!b)return;if(aiBusy){toast('GPT가 수정 중입니다. 완료될 때까지 기다려 주세요.');return;}try{if(b.dataset.add){const type=b.dataset.add;if(current.nodes.length>=(isLegacy(current)?32:64))throw Error('노드 수 제한에 도달했습니다.');const id=type.toLowerCase()+'_'+current.nodes.length+'_'+crypto.randomUUID().slice(0,4);current.nodes.push({id,type,x:50+(current.nodes.length%3)*220,y:280,params:structuredClone(getDefs(current)[type].params)});$('#modal').close();updateFrames();selectNode(id);}else await actions[b.dataset.action]?.();}catch(err){toast(err.message);}});
$('#modal').addEventListener('cancel',e=>{if(aiBusy)e.preventDefault();});
$('#editor').addEventListener('close',()=>{renderJob?.terminate();renderJob=null;clearTimeout(renderTimer);});
$('#editor').addEventListener('cancel',e=>{e.preventDefault();actions.close();});$('#search').oninput=()=>{visibleLimit=24;renderFeed();};$('#catalog-filter').onchange=()=>{catalogFilter=$('#catalog-filter').value;visibleLimit=24;renderFeed();};$('#file').onchange=async()=>{try{const file=$('#file').files[0];if(file){if(file.size>4*1024*1024)throw Error('가져올 파일은 4MB 이하여야 합니다.');await importText(await file.text());}}catch(e){toast(e.message);}finally{$('#file').value='';}};
$('#name').onchange=()=>{try{const next={...current,name:$('#name').value};current=validate(next);dirty=true;$('#editor-title').textContent=current.name;}catch(e){$('#name').value=current.name;toast(e.message);}};
for(const k of ['size','frames','fps','loop'])$('#'+k).onchange=()=>{const old=structuredClone(current);try{current.settings[k]=k==='loop'?$('#loop').checked:Number($('#'+k).value);updateFrames();epoch=performance.now();}catch(e){current=old;if(k==='loop')$('#loop').checked=old.settings.loop;else $('#'+k).value=old.settings[k];toast(e.message);}};
$('#scrub').oninput=()=>{playing=false;frame=Number($('#scrub').value);};
function tick(now){if(!document.hidden){if($('#editor').open&&cached.length){if(playing){let elapsed=Math.floor((now-epoch)*current.settings.fps/1000);frame=current.settings.loop?elapsed%cached.length:Math.min(elapsed%(cached.length+12),cached.length-1);}draw($('#preview'),cached[frame],current.settings.size);$('#scrub').value=frame;$('#frame-label').textContent=`${frame+1} / ${cached.length}`;}else for(const c of cards){const rect=c.canvas.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)continue;const f=Math.min(Math.floor(now*c.g.settings.fps/1000)%(c.g.settings.frames+12),c.g.settings.frames-1);if(!c.cache.has(f))c.cache.set(f,renderFrame(c.g,f,true));draw(c.canvas,c.cache.get(f),c.g.settings.size);}}requestAnimationFrame(tick);}
renderFeed();requestAnimationFrame(tick);if(location.hash.startsWith('#graph=')){try{openEditor(JSON.parse(decodeURIComponent(escapeLegacy(atob(location.hash.slice(7))))));}catch(e){toast('공유 JSON을 읽지 못했습니다: '+e.message);}}function escapeLegacy(s){return Array.from(s,c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('');}
