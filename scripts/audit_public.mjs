// SPDX-License-Identifier: MIT
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {loadAssets} from '../site_assets.mjs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw Error('Stage the public source before auditing.');
const failures=[];
const forbidden=/^(?:\.local|\.openai|\.sites|dist|outputs|node_modules|bgm\/runtime|pxf\/original)(?:\/|$)|(?:^|\/)(?:pxf_engine\.mjs|import_original\.py|render_original\.mjs|\.env(?!\.example$)|\.bridge_key)|\.(?:safetensors|sqlite|pem|key|wav|mp3|flac)$/;
const patterns=[
 ['provider secret',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b/],
 ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b/],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['runtime identity',/appgprj_[a-f0-9]{20,}/],
 ['operator machine path',/[A-Z]:[\\/]Users[\\/][^\s'"<>]+/],
 ['private hosted origin',/https:\/\/[a-z0-9][a-z0-9.-]*\.chatgpt\.site/]
];
for(const file of files){
 if(forbidden.test(file))failures.push({file,reason:'excluded file path'});
 if(/\.(?:png|jpg|webp|ico)$/.test(file))continue;
 const content=await readFile(file,'utf8');
 for(const [reason,pattern] of patterns)if(pattern.test(content))failures.push({file,reason});
}
const assets=await loadAssets();
if(Object.keys(assets).some(p=>/\/original\/|pxf_engine\.mjs|\.env|\.sqlite/.test(p)))failures.push({reason:'private runtime asset'});
const packageJson=JSON.parse(await readFile('package.json','utf8'));
if(packageJson.license!=='MIT')failures.push({reason:'missing MIT declaration'});
const license=await readFile('LICENSE','utf8');
if(!license.includes('MIT License')||!license.includes('Cereal-lee'))failures.push({reason:'missing project license'});
if(!(await readFile('third-party-tomato-license.txt','utf8')).includes('Open Generative AI Contributors'))failures.push({reason:'missing upstream attribution'});
console.log(JSON.stringify({files:files.length,assets:Object.keys(assets).length,failures},null,2));
if(failures.length)process.exitCode=1;
