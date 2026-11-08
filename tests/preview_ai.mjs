// Local-only deterministic API fixture for browser QA. Never bundled or served.
import http from 'node:http';
import {loadAssets} from '../site_assets.mjs';
import {makeWorker} from '../worker.mjs';
const origin='http://127.0.0.1:4175';
const aiFetch=async(_url,options)=>{
 const input=JSON.parse(JSON.parse(options.body).input),graph=structuredClone(input.reference);
 graph.name='자동 적용 검증 · 붉은 구체';
 for(const node of graph.nodes)if(node.type==='Palette')node.params.colors=['#280305','#8c1125','#ed3553','#ffd8d8'];
 return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({graph_json:JSON.stringify(graph),summary:'테스트 응답: 팔레트를 붉은색으로 수정했습니다.'})}]}]});
};
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:4175'){res.writeHead(403);res.end();return;}
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const request=new Request(origin+req.url,{method:req.method,headers:{...req.headers,'oai-authenticated-user-id':'fixture-browser'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
 const response=await makeWorker(await loadAssets(),{aiFetch}).fetch(request,{OPENAI_API_KEY:'fixture-only'});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Fixture server failed');}});
server.listen(4175,'127.0.0.1',()=>console.log('Fixture preview: '+origin));
