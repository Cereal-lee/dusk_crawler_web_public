import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
export function localBucket(root) {
 root=resolve(root);
 const path=key=>{const p=resolve(join(root,key));if(!p.startsWith(root+sep))throw Error('Invalid object key');return p;};
 return {async put(key,bytes){const p=path(key);await mkdir(dirname(p),{recursive:true});await writeFile(p,new Uint8Array(bytes));},async get(key){try{const b=await readFile(path(key));return {body:b,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};}catch(e){if(e.code==='ENOENT')return null;throw e;}},async delete(key){await unlink(path(key)).catch(e=>{if(e.code!=='ENOENT')throw e;});}};
}
