import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fixtures} from './compatibility_fixtures.mjs';
import {validate,renderFrames} from '../pxf/engine.mjs';
const expected=JSON.parse(readFileSync(new URL('./compatibility_hashes.json',import.meta.url)));
test('saved graph defaults, geometry, particles and temporal sampling match frozen native baseline',()=>{
 for(const raw of fixtures){
  const before=JSON.stringify(raw),g=validate(raw),hash=createHash('sha256');
  for(const pixels of renderFrames(g))hash.update(pixels);
  assert.equal(hash.digest('hex'),expected[raw.name],raw.name);
  assert.equal(JSON.stringify(raw),before,'import must not mutate input');
  assert.deepEqual(validate(JSON.parse(JSON.stringify(g))),g,'save/load must preserve values');
 }
});
