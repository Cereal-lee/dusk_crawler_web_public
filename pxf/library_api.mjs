import {validate} from './engine.mjs';

const libraryJson=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
const libraryRecord=row=>row?{graph:JSON.parse(row.graph_json),version:row.version,createdAt:row.created_at,updatedAt:row.updated_at}:null;

export async function handleLibrary(request,env){
 const url=new URL(request.url),userId=request.headers.get('oai-authenticated-user-id');
 if(!userId)return libraryJson({error:'ChatGPT 계정으로 로그인해 주세요.'},401);
 if(!env.DB)return libraryJson({error:'서버 저장소를 사용할 수 없습니다. 잠시 후 동기화해 주세요.'},503);
 try{
  if(request.method==='GET'&&url.pathname==='/api/library'){
   const rows=await env.DB.prepare('SELECT * FROM effects WHERE user_id = ? ORDER BY created_at DESC, effect_id DESC').bind(userId).all();
   return libraryJson({user:{id:userId,email:request.headers.get('oai-authenticated-user-email')||''},items:rows.results.map(libraryRecord)});
  }
  if(request.method!=='PUT')return libraryJson({error:'지원하지 않는 요청입니다.'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return libraryJson({error:'같은 공방에서만 저장할 수 있습니다.'},403);
  if(!(request.headers.get('content-type')||'').startsWith('application/json'))return libraryJson({error:'JSON 형식이 필요합니다.'},415);
  const effectId=url.pathname.slice('/api/library/'.length);
  if(!/^user_[a-zA-Z0-9_-]{1,80}$/.test(effectId))return libraryJson({error:'작품 ID가 올바르지 않습니다.'},400);
  if(Number(request.headers.get('content-length'))>280000)return libraryJson({error:'작품 크기 제한을 초과했습니다.'},413);
  const body=await request.text();if(body.length>280000)return libraryJson({error:'작품 크기 제한을 초과했습니다.'},413);
  let input,graph;
  try{input=JSON.parse(body);graph=validate(input.graph);}catch(e){return libraryJson({error:'작품 JSON이 올바르지 않습니다: '+e.message},400);}
  if(!Number.isSafeInteger(input.baseVersion)||input.baseVersion<0)return libraryJson({error:'저장 버전이 올바르지 않습니다.'},400);
  graph.id=effectId;const serialized=JSON.stringify(graph),now=Date.now();
  const createdAt=Number.isSafeInteger(input.createdAt)&&input.createdAt>0?Math.min(input.createdAt,now):now;
  let result;
  if(input.baseVersion===0){
   result=await env.DB.prepare('INSERT INTO effects (user_id,effect_id,graph_json,version,created_at,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(user_id,effect_id) DO NOTHING').bind(userId,effectId,serialized,createdAt,now).run();
  }else{
   result=await env.DB.prepare('UPDATE effects SET graph_json = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND effect_id = ? AND version = ?').bind(serialized,now,userId,effectId,input.baseVersion).run();
  }
  const row=await env.DB.prepare('SELECT * FROM effects WHERE user_id = ? AND effect_id = ?').bind(userId,effectId).first();
  // A retried request whose response was lost is already saved, not a conflict.
  if(result.meta.changes===0&&row?.graph_json!==serialized)return libraryJson({error:'다른 기기에서 수정한 작품입니다.',item:libraryRecord(row)},409);
  return libraryJson({item:libraryRecord(row)});
 }catch{return libraryJson({error:'서버 저장에 실패했습니다. 작품은 이 브라우저에 보관하며 다시 동기화합니다.'},503);}
}
