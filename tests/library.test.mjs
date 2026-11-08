import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLibrary} from '../pxf/library_api.mjs';
import {LibrarySync} from '../pxf/library_sync.mjs';
import {validate} from '../pxf/engine.mjs';
import {PRESETS} from '../pxf/presets.mjs';
import {localDatabase} from './local_database.mjs';
const graph=(name='sample',id='user_test')=>({...validate(PRESETS[0]),name,id});
class Storage{
 data=new Map();get length(){return this.data.size;}key(i){return [...this.data.keys()][i];}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}
}
function fixture(){
 const DB=localDatabase();let identity='alice',offline=false,drop=false;
 const request=async(path,options={})=>{
  if(offline)throw Error('offline');
  const headers={'content-type':'application/json',origin:'https://workshop.test',...options.headers};
  if(identity)headers['oai-authenticated-user-id']=identity;
  const response=await handleLibrary(new Request('https://workshop.test'+path,{...options,headers}),{DB});
  if(drop&&options.method==='PUT'){drop=false;throw Error('response lost');}return response;
 };
 const device=(storage=new Storage())=>new LibrarySync({storage,request});
 return {DB,request,device,setUser:v=>identity=v,setOffline:v=>offline=v,dropResponse:()=>drop=true};
}
test('server separates accounts, rejects anonymous and cross-origin writes, preserves creation order',async t=>{
 const f=fixture();t.after(()=>f.DB.close());const a=f.device();await a.sync();const first=await a.save(graph(),0);assert.equal(first.synced,true);
 const created=a.items[0].createdAt;await a.save(graph('updated'),1);assert.equal(a.items[0].createdAt,created);
 f.setUser('bob');assert.equal((await (await f.request('/api/library')).json()).items.length,0);
 await f.device().save(graph('bob copy'),0);f.setUser('alice');assert.equal((await (await f.request('/api/library')).json()).items[0].graph.name,'updated');
 f.setUser(null);assert.equal((await f.request('/api/library')).status,401);
 f.setUser('alice');assert.equal((await f.request('/api/library/user_test',{method:'PUT',headers:{origin:'https://attacker.test'},body:JSON.stringify({graph:graph(),baseVersion:2})})).status,403);
 assert.equal((await f.request('/api/library/user_test',{method:'PUT',body:'{}'})).status,400);
});
test('two devices load same works; stale edits preserve both revisions as a conflict copy',async t=>{
 const f=fixture();t.after(()=>f.DB.close());const a=f.device(),b=f.device();await a.save(graph());await b.sync();assert.equal(b.items.length,1);
 const version=b.version('user_test');await a.save(graph('newer A'),a.version('user_test'));
 const result=await b.save(graph('older B'),version);assert.equal(result.synced,true);assert.match(result.graph.name,/충돌 보관본/);
 await a.sync();assert.equal(a.items.length,2);assert.ok(a.items.some(item=>item.graph.name==='newer A'));
});
test('offline outbox survives reload, and retry after lost response never duplicates a work',async t=>{
 const f=fixture();t.after(()=>f.DB.close());const storage=new Storage(),a=f.device(storage);await a.sync();f.setOffline(true);
 assert.equal((await a.save(graph())).synced,false);assert.equal(a.pending().length,1);
 f.setOffline(false);const restarted=f.device(storage);await restarted.sync();assert.equal(restarted.items.length,1);assert.equal(restarted.pending().length,0);
 f.dropResponse();assert.equal((await restarted.save(graph('lost-response'),1)).synced,false);
 await restarted.sync();assert.equal(restarted.items.length,1);assert.equal(restarted.items[0].graph.name,'lost-response');
});
test('legacy migration is repeatable, preserves latest-first order and never crosses accounts',async t=>{
 const f=fixture();t.after(()=>f.DB.close());const storage=new Storage();storage.setItem('dusk-pxf-library',JSON.stringify([graph('new','user_new'),graph('old','user_old')]));
 const a=f.device(storage);await a.sync();assert.deepEqual(a.items.map(item=>item.graph.name),['new','old']);await a.sync();assert.equal(a.items.length,2);
 f.setUser('bob');const b=f.device(storage);await b.sync();assert.equal(b.items.length,0);assert.ok(storage.getItem('dusk-pxf-library'));
});
test('legacy graph with same ID cannot overwrite a newer server graph',async t=>{
 const f=fixture();t.after(()=>f.DB.close());await f.device().save(graph('server'));const storage=new Storage();storage.setItem('dusk-pxf-library',JSON.stringify([graph('legacy')]));
 const b=f.device(storage);await b.sync();assert.equal(b.items.length,2);assert.ok(b.items.some(item=>item.graph.name==='server'));
});
