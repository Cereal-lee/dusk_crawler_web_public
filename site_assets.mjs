import {readFile,readdir} from 'node:fs/promises';
import {ANIMS,WALK_GUIDES} from './sd/anims.mjs';
const root=new URL('./',import.meta.url);
export async function loadAssets(){
 const guides=new Set([...Object.values(WALK_GUIDES),...ANIMS.flatMap(a=>Object.values(a.guides||{}))].map(p=>p.split('/').at(-1)));
 const assets={},types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',png:'image/png',txt:'text/plain; charset=utf-8'};
 const add=async(file,url='/'+file)=>{const ext=file.split('.').at(-1),binary=ext==='png',bytes=await readFile(new URL(file,root));assets[url]={body:bytes.toString(binary?'base64':'utf8'),type:types[ext],base64:binary};};
 for(const f of ['index.html','style.css','third-party-notices.txt','third-party-tomato-license.txt','shared/shell.mjs','shared/workshop.css','shared/art_app.mjs','shared/art_process.mjs','shared/art_config.mjs','sd/anims.mjs','sd/prompt_builder.mjs'])await add(f);
 for(const f of ['index.html','app.mjs','library_sync.mjs','engine.mjs','legacy_engine.mjs','dusk_engine.mjs','node_contract.mjs','generators.mjs','pxf_schema.mjs','render_worker.mjs','presets.mjs']){await add('pxf/'+f);if(f!=='index.html')assets['/'+f]=assets['/pxf/'+f];}
 for(const f of ['bgm.html','bgm.mjs','bgm_title.mjs']){await add('bgm/'+f);assets['/'+f]=assets['/bgm/'+f];}
 for(const dir of ['sd/guides','item/style_refs'])for(const f of await readdir(new URL(dir+'/',root))){if((dir!=='sd/guides'||guides.has(f))&&/^[\w-]+\.(json|png)$/.test(f)){await add(dir+'/'+f);}}
 for(const dir of ['image','item','sd'])await add(dir+'/index.html');
 assets['/pxf/']=assets['/pxf/index.html'];assets['/bgm/']=assets['/bgm/bgm.html'];
 for(const dir of ['image','item','sd'])assets['/'+dir+'/']=assets['/'+dir+'/index.html'];
 return assets;
}
