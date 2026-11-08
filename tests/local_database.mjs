// Local/test D1 adapter. Never bundled into the hosted Worker.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function localDatabase(filename=':memory:'){
 const sql=new DatabaseSync(filename);
 sql.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort()){
  if(sql.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name))continue;
  sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  sql.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
 }
 return {prepare(query){const statement=sql.prepare(query);return {bind(...values){return {async all(){return {results:statement.all(...values)};},async first(){return statement.get(...values)??null;},async run(){return {meta:{changes:statement.run(...values).changes}};}};}};},close:()=>sql.close()};
}
