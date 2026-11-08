import {addTitleEditor} from './bgm_title.mjs';
const $ = id => document.getElementById(id), base = 'http://127.0.0.1:8190';
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has('key')) {
  localStorage.setItem('bgm-pc-key', hash.get('key'));
  history.replaceState(null, '', location.pathname);
}
async function request(path, options = {}) {
  const {timeout = 15000, ...init} = options;
  const r = await fetch(base + path, {...init, headers: {
    Authorization: 'Bearer ' + (localStorage.getItem('bgm-pc-key') || ''),
    ...(options.body ? {'Content-Type': 'application/json'} : {}), ...options.headers
  }, signal: AbortSignal.timeout(timeout)});
  if (!r.ok) {
    const x = await r.json().catch(() => ({}));
    throw Error(x.error || '요청에 실패했습니다. PC 연결 프로그램을 확인해 주세요.');
  }
  return r;
}
let signature = '', referenceSignature = '', urls = [], editingCount = 0;
let references = new Map(), library = [], online = false, uploading = false, submitting = false;
const setMessage = message => { $('message').textContent = message; };
function updateGenerate() { $('generate').disabled = !online || uploading || submitting; }
function describeReference() {
  const ref = references.get($('reference').value);
  $('reference-settings').hidden = !ref;
  $('strength-value').value = $('strength').value;
  if (ref) $('reference-summary').textContent = ref.title + ' · ' + Math.round(ref.duration) + '초 기준';
}
function syncReferences(items, uploads) {
  const next = JSON.stringify([items.filter(j => j.status === 'saved').map(j => [j.id,j.title,j.duration]), uploads]);
  if (next === referenceSignature) return;
  referenceSignature = next;
  const selected = $('reference').value;
  references = new Map();
  $('reference').replaceChildren(new Option('없음 · 새 곡 만들기', ''));
  for (const [label, type, tracks] of [['내 PC 음악 보관함','library',items.filter(j => j.status === 'saved')], ['업로드한 음원','upload',uploads]]) {
    const group = document.createElement('optgroup'); group.label = label;
    for (const item of tracks) {
      const key = type + ':' + item.id;
      references.set(key, {...item, type});
      const date = new Date(item.createdAt).toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      group.append(new Option(item.title + ' · ' + Math.round(item.duration) + '초 · ' + date, key));
    }
    if (tracks.length) $('reference').append(group);
  }
  $('reference').value = references.has(selected) ? selected : '';
  describeReference();
}
$('reference').onchange = () => {
  const ref = references.get($('reference').value);
  if (ref && !$('prompt').value.trim() && ref.prompt) $('prompt').value = ref.prompt;
  if (ref && $('title').value === '새 BGM') $('title').value = ref.title + ' 변형';
  describeReference();
};
$('strength').oninput = describeReference;
$('reference-file').onchange = async () => {
  const file = $('reference-file').files[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { setMessage('음원은 최대 50MB까지 업로드할 수 있습니다.'); $('reference-file').value=''; return; }
  uploading = true; updateGenerate(); $('reference-file').disabled = true;
  setMessage('내 PC에 기준 음원을 저장하고 있습니다…');
  try {
    const ref = await (await request('/references?name=' + encodeURIComponent(file.name), {
      method:'POST', body:file, headers:{'Content-Type':'application/octet-stream'}, timeout:180000
    })).json();
    await refresh();
    $('reference').value = 'upload:' + ref.id;
    $('reference').onchange();
    setMessage('기준 음원을 선택했습니다. 원하는 음악과 변형 정도를 설정해 주세요.');
  } catch (e) { setMessage(e.message); }
  finally { uploading=false; $('reference-file').disabled=false; $('reference-file').value=''; updateGenerate(); }
};
async function media(item, ext, download=false) {
  const r = await request('/files/' + item.id + '/' + ext), url = URL.createObjectURL(await r.blob());
  if (download) {
    const a = document.createElement('a'); a.href=url;
    a.download=item.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_') + '.' + ext.split('.').at(-1);
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return url;
}
function renderTracks(items) {
  const next = JSON.stringify(items);
  if (next === signature || editingCount) return;
  signature = next; urls.forEach(URL.revokeObjectURL); urls=[]; $('tracks').replaceChildren();
  for (const j of items) {
    const card=document.createElement('article'); card.className='track';
    const title=document.createElement('h3'); title.textContent=j.title;
    const detail=document.createElement('p');
    detail.textContent=j.duration+'초 · 목표 '+j.bpm+' BPM · '+({saved:'PC에 저장됨',queued:'생성 대기 중',generating:'음악 생성 중',error:'생성 실패'}[j.status]);
    card.append(title,detail);
    if (j.reference) {
      const source=document.createElement('p'); source.textContent='기준: '+j.reference.title+' · 변형 '+Math.round(j.strength*100); card.append(source);
    }
    if (j.status==='saved') {
      const audio=document.createElement('audio'); audio.controls=true; audio.preload='none';
      const play=document.createElement('button'); play.textContent='▶ 음악 불러오기';
      play.onclick=async()=>{try{play.disabled=true;audio.src=await media(j,'audio.mp3');urls.push(audio.src);await audio.play();play.remove();}catch(e){play.disabled=false;setMessage(e.message);}};
      card.append(play,audio);
      const actions=document.createElement('div'); actions.className='actions';
      for (const ext of ['audio.wav','audio.mp3','metadata.json']) {
        const b=document.createElement('button'); b.textContent=ext.split('.').at(-1).toUpperCase()+' ↓';
        b.onclick=()=>media(j,ext,true).catch(e=>setMessage(e.message)); actions.append(b);
      }
      const reuse=document.createElement('button'); reuse.textContent='프롬프트 다시 사용';
      reuse.onclick=()=>{
        $('title').value=j.title+' 변형';$('prompt').value=j.prompt;$('duration').value=j.duration;$('bpm').value=j.bpm;
        $('reference').value='';describeReference();scrollTo(0,0);
      };
      const reference=document.createElement('button'); reference.textContent='기준 곡으로 사용';
      reference.onclick=()=>{
        $('title').value=j.title+' 변형';$('prompt').value=j.prompt;$('duration').value=j.duration;$('bpm').value=j.bpm;
        $('reference').value='library:'+j.id;describeReference();scrollTo(0,0);
      };
      actions.append(reference,reuse);card.append(actions);
      addTitleEditor({card,actions,item:j,heading:title,request,onEditing:active=>{editingCount+=active?1:-1;},onSaved:()=>{signature=JSON.stringify(items);referenceSignature='';setMessage('제목을 저장했습니다. 다운로드 파일명에도 반영됩니다.');}});
    }
    if (j.error) { const e=document.createElement('p');e.textContent=j.error;card.append(e); }
    $('tracks').append(card);
  }
  if (!items.length) $('tracks').textContent='첫 음악을 만들어 보세요.';
}
async function refresh() {
  try {
    const status=await(await request('/status')).json();
    if (!status.referenceAudio) throw Error('PC 연결 프로그램을 다시 실행해 업데이트해 주세요.');
    online=true; $('state').textContent='● 내 PC 연결됨'; $('storage-path').textContent=status.libraryPath;
    const [saved,uploaded]=await Promise.all([request('/library').then(r=>r.json()),request('/references').then(r=>r.json())]);
    library=saved.items;syncReferences(library,uploaded.items);renderTracks(library);
  } catch(e) {
    online=false;$('state').textContent=e.message.includes('업데이트')?e.message:'PC 연결 안 됨 · 연결 프로그램과 브라우저 권한을 확인해 주세요.';
  } finally { updateGenerate(); }
}
$('refresh').onclick=refresh;
$('form').onsubmit=async e=>{
  e.preventDefault(); submitting=true;updateGenerate();
  try {
    const selected=references.get($('reference').value);
    await request('/generate',{method:'POST',body:JSON.stringify({
      title:$('title').value,prompt:$('prompt').value,duration:Number($('duration').value),bpm:Number($('bpm').value),
      ...(selected?{reference:{id:selected.id,type:selected.type},strength:Number($('strength').value)/100}:{})
    })});
    setMessage('생성 요청 완료. 완성되면 새 곡으로 자동 저장됩니다.');await refresh();
  } catch(e) {setMessage(e.message);} finally {submitting=false;updateGenerate();}
};
refresh();setInterval(refresh,5000);
