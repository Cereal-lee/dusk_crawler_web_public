import {ART_MODELS,artConfig,artRecipe} from './art_config.mjs';
import {base64} from '../pxf/png.mjs';

const artJson=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const artId=id=>/^[a-f0-9-]{36}$/.test(id);
const artObjectKey=(user,id,variant='original')=>'art/'+encodeURIComponent(user)+'/'+id+'/'+variant+'.png';
const artRow=row=>row?{id:row.id,kind:row.kind,title:row.title,status:row.status,error:row.error,createdAt:row.created_at,config:JSON.parse(row.config_json),
  originalUrl:row.status==='completed'||row.status==='uploaded'?'/api/art/'+row.id+'/original':null,
  imageUrl:row.processed?'/api/art/'+row.id+'/image':null,processed:!!row.processed,export:row.export_json?JSON.parse(row.export_json):null}:null;
async function artReadBody(request,max=16000000) {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw Error('JSON 요청이 필요합니다.');
  if(Number(request.headers.get('content-length'))>max)throw Error('이미지가 너무 큽니다. 최대 10MB입니다.');
  const reader=request.body?.getReader(); if(!reader)throw Error('빈 요청입니다.');
  let size=0,parts=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('요청이 너무 큽니다.');}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function artPng(data) {
  if(typeof data!=='string'||data.length>14000000)throw Error('PNG 파일은 최대 10MB입니다.');
  const raw=data.replace(/^data:image\/png;base64,/, '');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw Error('올바른 PNG 파일이 아닙니다.');
  const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error('PNG 형식이 아닙니다.');
  const view=new DataView(bytes.buffer),w=view.getUint32(16),h=view.getUint32(20);
  if(w<1||h<1||w>8192||h>8192||w*h>20000000)throw Error('이미지 크기가 제한을 초과했습니다.');
  return bytes;
}
async function artModels(env,fetcher) {
  const r=await fetcher('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('OpenAI 모델 목록을 불러오지 못했습니다.');
  const ids=new Set(((await r.json()).data||[]).map(x=>x.id));
  return ART_MODELS.filter(id=>ids.has(id));
}
function artApiError(data,status) {
  if(status===401)return '공방의 OpenAI API 연결을 확인해 주세요.';
  if(data?.error?.code==='insufficient_quota'||data?.error?.code==='credit_balance_exhausted')return 'OpenAI API 크레딧 또는 사용 한도가 부족합니다.';
  if(status===403)return '선택한 이미지 모델 사용 권한 또는 OpenAI 조직 인증이 필요합니다.';
  return String(data?.error?.message||'이미지 생성 응답을 받지 못했습니다.').replace(/sk-[\w-]+/g,'[redacted]').slice(0,450);
}
export async function handleArt(request,env={},fetcher=fetch,assets={}) {
  const url=new URL(request.url),user=request.headers.get('oai-authenticated-user-id');
  if(!user)return artJson({error:'ChatGPT 계정으로 로그인해 주세요.'},401);
  if(!env.DB||!env.BUCKET)return artJson({error:'이미지 저장소가 아직 준비되지 않았습니다.'},503);
  const query=(sql,...args)=>env.DB.prepare(sql).bind(...args);
  const get=id=>query('SELECT * FROM art_jobs WHERE user_id = ? AND id = ?',user,id).first();
  try {
    if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)return artJson({error:'공방에서만 요청할 수 있습니다.'},403);
    if(url.pathname==='/api/art/models'&&request.method==='GET') {
      if(!env.OPENAI_API_KEY)return artJson({error:'OpenAI API 연결이 필요합니다.'},503);
      return artJson({models:await artModels(env,fetcher),routerModel:env.OPENAI_MODEL||'gpt-5.4'});
    }
    if(url.pathname==='/api/art'&&request.method==='GET') {
      const rows=await query('SELECT * FROM art_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',user).all();
      return artJson({items:rows.results.map(artRow)});
    }
    if(url.pathname==='/api/art/upload'&&request.method==='POST') {
      const body=await artReadBody(request),bytes=artPng(body.png),id=crypto.randomUUID(),now=Date.now();
      await env.BUCKET.put(artObjectKey(user,id),bytes,{httpMetadata:{contentType:'image/png'}});
      await query('INSERT INTO art_jobs (user_id,id,kind,title,status,config_json,created_at,processed) VALUES (?,?,?,?,?,?,?,0)',user,id,'reference',String(body.title||'업로드 이미지').slice(0,100),'uploaded','{}',now).run();
      return artJson({item:artRow(await get(id))},201);
    }
    if(url.pathname==='/api/art'&&request.method==='POST') {
      if(!env.OPENAI_API_KEY)return artJson({error:'OpenAI API 연결이 필요합니다.'},503);
      const body=await artReadBody(request,40000),id=body.id;
      if(!artId(id))return artJson({error:'잘못된 요청 ID입니다.'},400);
      const config=artConfig(body),recipe=artRecipe(config),serialized=JSON.stringify(config);
      const existing=await get(id);if(existing)return existing.config_json===serialized?artJson({item:artRow(existing)}):artJson({error:'동일 요청 ID에 다른 내용이 있습니다.'},409);
      const recent=await query('SELECT COUNT(*) AS total FROM art_jobs WHERE user_id = ? AND created_at > ? AND kind != ?',user,Date.now()-60000,'reference').first();
      if(recent.total>=5)return artJson({error:'분당 최대 5개까지 생성할 수 있습니다.'},429);
      if(!(await artModels(env,fetcher)).includes(config.model))return artJson({error:'이 계정에서 선택한 모델을 사용할 수 없습니다.'},403);
      const input=[{type:'input_text',text:recipe.prompt}],attach=async(id)=>{
        const ref=await get(id);if(!ref||!['completed','uploaded'].includes(ref.status))throw Error('사용 가능한 레퍼런스가 아닙니다.');
        const data=await env.BUCKET.get(artObjectKey(user,id,ref.processed?'processed':'original'));if(!data)throw Error('레퍼런스 파일이 없습니다.');
        input.push({type:'input_image',image_url:'data:image/png;base64,'+base64(new Uint8Array(await data.arrayBuffer()))});
      };
      if(recipe.guide) {const guide=assets[recipe.guide];if(!guide)throw Error('동작 가이드가 없습니다.');input.push({type:'input_image',image_url:'data:image/png;base64,'+guide.body});}
      for(const id of config.refs)await attach(id);
      if(config.kind==='item'&&config.style==='tomato')for(let i=1;i<=3;i++)input.push({type:'input_image',image_url:'data:image/png;base64,'+assets['/item/style_refs/ref-'+i+'.png'].body});
      const inserted=await query('INSERT INTO art_jobs (user_id,id,kind,title,status,config_json,created_at,processed) VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(user_id,id) DO NOTHING',user,id,config.kind,config.title,'submitting',serialized,Date.now()).run();
      if(!inserted.meta.changes)return artJson({item:artRow(await get(id))});
      try {
        const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5.4',background:true,store:true,instructions:'Create exactly one image using the image_generation tool. Follow the supplied art brief and reference images. No additional tool calls.',input:[{role:'user',content:input}],tools:[{type:'image_generation',model:config.model,quality:config.quality,size:config.size,background:config.background,output_format:'png'}],tool_choice:{type:'image_generation'},max_tool_calls:1})});
        const result=await response.json();
        if(!response.ok||!result.id)throw Error(artApiError(result,response.status));
        await query('UPDATE art_jobs SET response_id = ?, status = ? WHERE user_id = ? AND id = ?',result.id,'generating',user,id).run();
      } catch(e) {
        await query('UPDATE art_jobs SET status = ?, error = ? WHERE user_id = ? AND id = ?','error',e.name==='TimeoutError'?'요청 수신 여부를 확인하지 못했습니다. 중복 과금을 피하려면 Platform 사용 내역을 확인한 뒤 새 요청을 보내세요.':String(e.message).slice(0,450),user,id).run();
      }
      return artJson({item:artRow(await get(id))},202);
    }
    const match=url.pathname.match(/^\/api\/art\/([a-f0-9-]{36})(?:\/(original|image|processed|poll))?$/);
    if(!match)return artJson({error:'없는 경로입니다.'},404);
    const [,id,action]=match,row=await get(id);if(!row)return artJson({error:'작품을 찾지 못했습니다.'},404);
    if(request.method==='GET'&&(action==='original'||action==='image')) {
      const obj=await env.BUCKET.get(artObjectKey(user,id,action==='image'&&row.processed?'processed':'original'));
      if(!obj)return artJson({error:'이미지를 찾지 못했습니다.'},404);
      return new Response(obj.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff'}});
    }
    if(request.method==='POST'&&action==='poll') {
      if(row.status==='submitting'&&Date.now()-row.created_at>180000)await query('UPDATE art_jobs SET status = ?, error = ? WHERE user_id = ? AND id = ? AND status = ?','error','요청 연결이 중단되었습니다. API 사용 내역을 확인한 뒤 다시 생성해 주세요.',user,id,'submitting').run();
      if(row.status==='generating') {
        const r=await fetcher('https://api.openai.com/v1/responses/'+encodeURIComponent(row.response_id),{headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},signal:AbortSignal.timeout(60000)});
        const data=await r.json();if(!r.ok)return artJson({error:artApiError(data,r.status)},502);
        if(data.status==='completed') {
          const generated=data.output?.find(o=>o.type==='image_generation_call'&&o.result);
          if(generated) {
            const bytes=artPng(generated.result);
            await env.BUCKET.put(artObjectKey(user,id),bytes,{httpMetadata:{contentType:'image/png'}});
            await query('UPDATE art_jobs SET status = ?, export_json = ? WHERE user_id = ? AND id = ?','completed',JSON.stringify({grid:artRecipe(JSON.parse(row.config_json)).grid,usage:data.usage||null}),user,id).run();
          } else await query('UPDATE art_jobs SET status = ?, error = ? WHERE user_id = ? AND id = ?','error','이미지가 반환되지 않았습니다. 요청 내용을 바꾸어 주세요.',user,id).run();
        } else if(['failed','cancelled','incomplete'].includes(data.status))await query('UPDATE art_jobs SET status = ?, error = ? WHERE user_id = ? AND id = ?','error',artApiError(data,400),user,id).run();
      }
      return artJson({item:artRow(await get(id))});
    }
    if(request.method==='POST'&&action==='processed') {
      if(row.status!=='completed')return artJson({error:'완성된 작품만 저장할 수 있습니다.'},409);
      const body=await artReadBody(request),bytes=artPng(body.png);
      await env.BUCKET.put(artObjectKey(user,id,'processed'),bytes,{httpMetadata:{contentType:'image/png'}});
      const meta=JSON.parse(row.export_json||'{}');meta.width=Math.min(8192,Math.max(1,Number(body.width)||1));meta.height=Math.min(8192,Math.max(1,Number(body.height)||1));
      await query('UPDATE art_jobs SET processed = 1, export_json = ? WHERE user_id = ? AND id = ?',JSON.stringify(meta),user,id).run();
      return artJson({item:artRow(await get(id))});
    }
    if(request.method==='PATCH'&&!action) {
      const body=await artReadBody(request,1000),title=String(body.title||'').trim().slice(0,100);if(!title)throw Error('제목을 입력해 주세요.');
      await query('UPDATE art_jobs SET title = ? WHERE user_id = ? AND id = ?',title,user,id).run();return artJson({item:artRow(await get(id))});
    }
    if(request.method==='DELETE'&&!action) {
      if(['submitting','generating'].includes(row.status))return artJson({error:'생성 완료 후 삭제할 수 있습니다.'},409);
      await env.BUCKET.delete(artObjectKey(user,id));await env.BUCKET.delete(artObjectKey(user,id,'processed'));
      await query('DELETE FROM art_jobs WHERE user_id = ? AND id = ?',user,id).run();return artJson({deleted:true});
    }
    return artJson({error:'지원하지 않는 요청입니다.'},405);
  }catch(e){return artJson({error:String(e.message).slice(0,450)},400);}
}
