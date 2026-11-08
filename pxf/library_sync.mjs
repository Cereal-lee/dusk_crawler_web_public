import {validate} from './engine.mjs';

// Server records are account-scoped. Durable outbox entries are per work, so
// another tab cannot erase an unrelated pending save by replacing an array.
export class LibrarySync {
 constructor({storage,request=(...args)=>fetch(...args),onChange=()=>{},onStatus=()=>{},onConflict=()=>{},uuid=()=>crypto.randomUUID()}){
  Object.assign(this,{storage,request,onChange,onStatus,onConflict,uuid});this.user=null;this.items=[];this.running=null;this.resolved=new Map();
 }
 prefix(){return 'dusk-pxf-account:'+encodeURIComponent(this.user.id)+':';}
 pending(){const entries=[];for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key.startsWith(this.prefix()+'pending:')){const entry=JSON.parse(this.storage.getItem(key));entries.push({key,...entry});}}return entries;}
 snapshot(){const map=new Map(this.items.map(item=>[item.graph.id,item]));for(const item of this.pending())map.set(item.graph.id,{...item,version:item.baseVersion});return [...map.values()].sort((a,b)=>b.createdAt-a.createdAt||b.graph.id.localeCompare(a.graph.id));}
 emit(){this.onChange(this.snapshot().map(item=>item.graph));}
 version(id){return this.snapshot().find(item=>item.graph.id===id)?.version??0;}
 async api(path,options={}){
  const response=await this.request(path,{cache:'no-store',credentials:'same-origin',...options,signal:AbortSignal.timeout(20000)});
  let data;try{data=await response.json();}catch{throw Error('로그인 또는 서버 연결을 확인해 주세요.');}
  if(!response.ok){const error=Error(data.error||'동기화에 실패했습니다.');error.status=response.status;error.data=data;throw error;}return data;
 }
 async connect(){
  const data=await this.api('/api/library');
  if(this.user&&this.user.id!==data.user.id){this.user=null;this.items=[];this.onChange([]);throw Error('로그인 계정이 바뀌었습니다. 새로고침해 주세요.');}
  this.user=data.user;this.items=data.items;const cache=JSON.stringify(this.items);if(this.storage.getItem(this.prefix()+'cache')!==cache)this.storage.setItem(this.prefix()+'cache',cache);
  this.migrateLegacy();this.emit();return this.user;
 }
 migrateLegacy(){
  // Claim the old unscoped data once; never import it into a second account.
  const claim='dusk-pxf-legacy-owner',owner=this.storage.getItem(claim);
  if(owner&&owner!==this.user.id)return;
  const done=this.prefix()+'legacy-migrated';if(this.storage.getItem(done))return;
  const legacy=JSON.parse(this.storage.getItem('dusk-pxf-library')||'[]');
  if(!Array.isArray(legacy))throw Error('기존 라이브러리 백업을 확인해 주세요.');
  const graphs=legacy.map(validate);this.storage.setItem(claim,this.user.id);
  // Old libraries are already newest-first. Their relative order is preserved.
  const now=Date.now();for(let i=0;i<graphs.length;i++){
   const graph=graphs[i];if(!graph.id?.startsWith('user_'))graph.id='user_'+this.uuid();
   const remote=this.items.find(item=>item.graph.id===graph.id);
   if(remote&&JSON.stringify(remote.graph)===JSON.stringify(graph))continue;
   if(!this.storage.getItem(this.prefix()+'pending:'+graph.id))this.enqueue(graph,0,now-i);
  }
  this.storage.setItem(done,'1');
 }
 enqueue(graph,baseVersion,createdAt){
  const key=this.prefix()+'pending:'+graph.id,old=JSON.parse(this.storage.getItem(key)||'null');
  const pending={graph,baseVersion:old?.baseVersion??baseVersion,createdAt:old?.createdAt??createdAt,token:this.uuid(),fallbackId:old?.fallbackId??'user_'+this.uuid()};
  this.storage.setItem(key,JSON.stringify(pending));return pending;
 }
 async save(raw,baseVersion){
  if(!this.user)await this.connect();
  const graph=validate(raw);if(!graph.id?.startsWith('user_'))graph.id='user_'+this.uuid();
  const existing=this.snapshot().find(item=>item.graph.id===graph.id);
  const pending=this.enqueue(graph,baseVersion??existing?.version??0,existing?.createdAt??Date.now());this.emit();
  await this.sync();const saved=this.resolved.get(pending.token);this.resolved.delete(pending.token);
  return {graph:saved?.graph??graph,version:saved?.version??pending.baseVersion,synced:!!saved};
 }
 sync(){if(this.running)return this.running;this.running=this.flush().finally(()=>{this.running=null;});return this.running;}
 async flush(){
  this.onStatus('busy','서버 동기화 중…');
  try{
   await this.connect();
   for(const entry of this.pending()){
    let result;
    const put=(graph,baseVersion)=>this.api('/api/library/'+graph.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({graph,baseVersion,createdAt:entry.createdAt})});
    try{result=await put(entry.graph,entry.baseVersion);}catch(error){
     if(error.status!==409)throw error;
     const graph={...entry.graph,id:entry.fallbackId,name:(entry.graph.name.slice(0,95)+' · 충돌 보관본')};
     result=await put(graph,0);this.onConflict(graph);
    }
    this.resolved.set(entry.token,result.item);
    // A newer edit made during this network request must stay in the outbox.
    const latest=JSON.parse(this.storage.getItem(entry.key)||'null');
    if(latest?.token===entry.token)this.storage.removeItem(entry.key);
    else if(latest&&result.item.graph.id===entry.graph.id){latest.baseVersion=result.item.version;this.storage.setItem(entry.key,JSON.stringify(latest));}
   }
   await this.connect();const pending=this.pending().length;
   this.onStatus(pending?'pending':'ok',pending?`${pending}개 작품 서버 저장 대기`:'서버 저장 · 동기화 완료');return !pending;
  }catch(error){
   if(error.status===401){this.user=null;this.items=[];this.onChange([]);this.onStatus('login','로그인 후 동기화');}
   else this.onStatus('error',this.user?'동기화 대기 · 이 기기에 보관 중':error.message);
   return false;
  }
 }
}
