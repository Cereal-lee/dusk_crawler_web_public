// Import completed work without generating again or charging the image API.
export function importProvenance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('제작 기록이 필요합니다.');
  const text=(v,max)=>String(v??'').slice(0,max);
  const script=value.script||{};
  const result={source:text(value.source,200),requestPrompt:text(value.requestPrompt,6000),
    generationPrompt:text(value.generationPrompt,10000),engine:text(value.engine,100),
    steps:Array.isArray(value.steps)?value.steps.slice(0,20).map(v=>text(v,700)):[],
    parameters:{width:Number(value.parameters?.width),height:Number(value.parameters?.height),
      paletteLimit:Number(value.parameters?.paletteLimit)||null,alpha:text(value.parameters?.alpha,100),
      sourceAsset:text(value.parameters?.sourceAsset,200)},
    script:{name:text(script.name,100),text:text(script.text,50000)},
    sourceSha256:text(value.sourceSha256,64)};
  if (!Number.isInteger(result.parameters.width)||!Number.isInteger(result.parameters.height)||result.parameters.width<1||result.parameters.height<1) throw Error('이미지 크기가 필요합니다.');
  return result;
}

export async function persistImportedArt({body,user,env,get,query,config,png,asRow}) {
  const provenance=importProvenance(body.provenance);
  const original=png(body.originalPng),processed=png(body.processedPng);
  const view=new DataView(processed.buffer,processed.byteOffset,processed.byteLength);
  const width=view.getUint32(16),height=view.getUint32(20);
  if(width!==provenance.parameters.width||height!==provenance.parameters.height)throw Error('제작 기록과 PNG 크기가 다릅니다.');
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join('');
  const serialized=JSON.stringify(config);
  const digest=await hash(new TextEncoder().encode(JSON.stringify([serialized,provenance,await hash(original),await hash(processed)])));
  const meta={width,height,grid:null,provenance,importDigest:digest};
  await query('INSERT INTO art_jobs (user_id,id,kind,title,status,config_json,created_at,processed,export_json) VALUES (?,?,?,?,?,?,?,0,?) ON CONFLICT(user_id,id) DO NOTHING',user,body.id,config.kind,config.title,'importing',serialized,Date.now(),JSON.stringify(meta)).run();
  const row=await get(body.id);
  if(JSON.parse(row.export_json||'{}').importDigest!==digest)throw Error('같은 ID에 다른 작품이 있습니다. 기존 작품은 변경하지 않았습니다.');
  if(row.status==='completed')return asRow(row);
  const key='art/'+encodeURIComponent(user)+'/'+body.id+'/';
  try {
    await env.BUCKET.put(key+'original.png',original,{httpMetadata:{contentType:'image/png'}});
    await env.BUCKET.put(key+'processed.png',processed,{httpMetadata:{contentType:'image/png'}});
    await query('UPDATE art_jobs SET status = ?, processed = 1, error = NULL WHERE user_id = ? AND id = ?','completed',user,body.id).run();
  } catch {
    await query('UPDATE art_jobs SET status = ?, error = ? WHERE user_id = ? AND id = ?','error','이미지 저장을 마치지 못했습니다. 같은 파일을 다시 가져오세요.',user,body.id).run();
    throw Error('이미지 저장을 마치지 못했습니다. 같은 파일을 다시 가져오세요.');
  }
  return asRow(await get(body.id));
}
