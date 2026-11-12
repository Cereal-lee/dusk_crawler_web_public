export function showProvenance(host,item,download) {
  const p=item.export?.provenance;
  const section=document.createElement('details');section.className='art-provenance';
  const summary=document.createElement('summary');summary.textContent='제작 기록 · 프롬프트'+(p?' · Blender 스크립트':'');section.append(summary);
  const block=(label,text)=>{const h=document.createElement('h3'),pre=document.createElement('pre');h.textContent=label;pre.textContent=text||'기록 없음';section.append(h,pre);};
  block('입력한 프롬프트',p?.requestPrompt||item.config.prompt);
  if(p?.generationPrompt)block('이미지 생성기에 전달한 전체 프롬프트',p.generationPrompt);
  if(p){
    const info=document.createElement('p');info.textContent=[p.source,p.engine,`${p.parameters.width} × ${p.parameters.height}px`,p.parameters.paletteLimit?`최대 ${p.parameters.paletteLimit}색`:'',p.parameters.alpha].filter(Boolean).join(' · ');section.append(info);
    const list=document.createElement('ol');for(const text of p.steps||[]){const li=document.createElement('li');li.textContent=text;list.append(li);}section.append(list);
    if(p.script?.text){
      const script=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre'),button=document.createElement('button');
      label.textContent='Blender Python 스크립트 펼치기';pre.textContent=p.script.text;
      button.type='button';button.textContent='Blender 스크립트 (.py) 다운로드';button.onclick=()=>download(p.script.name||'pixel_finish.py',p.script.text,'text/plain');
      script.append(label,pre);section.append(button,script);
    }
    const note=document.createElement('p');note.className='field-note';note.textContent='이미지는 완성본 그대로 저장했습니다. 프롬프트는 새 시안을 만드는 데 사용할 수 있으며, AI 생성 결과가 매번 같지는 않습니다. 스크립트는 Blender에서 원본 PNG를 열어 다시 후처리하는 용도입니다.';section.append(note);
  }
  host.append(section);
}

export function installArtImporter({host,api,upsert,select,notice,kind}) {
  if(!['image','item'].includes(kind))return;
  const row=document.createElement('div'),button=document.createElement('button'),input=document.createElement('input'),status=document.createElement('span');
  row.className='art-import-row';button.type='button';button.textContent='제작 기록 가져오기';button.className='subtle-button';
  input.type='file';input.accept='.json,application/json';input.multiple=true;input.hidden=true;
  status.className='field-note';status.setAttribute('role','status');status.textContent='완성 PNG와 프롬프트·처리 기록을 계정에 저장합니다. 재생성 비용 없음.';
  row.append(button,input,status);host.after(row);
  button.onclick=()=>input.click();
  input.onchange=async()=>{
    const files=Array.from(input.files);if(!files.length)return;
    button.disabled=true;let saved=[],errors=[];
    for(const [index,file] of files.entries()){
      status.textContent=`계정에 저장 중 ${index+1} / ${files.length}`;
      try {
        if(file.size>16000000)throw Error('파일은 최대 16MB입니다.');
        const body=JSON.parse(await file.text());
        if(body.format!=='dusk.artwork@1')throw Error('Dusk 제작 기록 파일이 아닙니다.');
        const data=await api('/import','POST',body);upsert(data.item);saved.push(data.item);
      }catch(e){errors.push(file.name+': '+e.message);}
    }
    const message=`${saved.length}개 작품을 계정에 저장했습니다.`+(errors.length?' 실패 '+errors.length+'개: '+errors.join(' / '):'');
    status.textContent=message;notice(message,errors.length>0);button.disabled=false;input.value='';
    const current=saved.findLast(item=>item.kind===kind);if(current)await select(current);
  };
}
