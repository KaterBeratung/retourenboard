import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {create as archive} from '../dist/vendor/archive.js';
import {createLinuxUpdate,UPDATE_MARKER} from '../dist/server/update-linux.js';
import {readDatabaseConfig} from '../dist/server/database/config.js';
async function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'retourenboard-linux-update-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const appDir=join(root,'app'),dataDir=join(root,'data'),stateDir=join(root,'state'),old=join(appDir,'releases','old');
  for(const dir of [join(old,'dist'),join(dataDir,'secrets'),stateDir])mkdirSync(dir,{recursive:true});writeFileSync(join(old,'dist/package.json'),JSON.stringify({version:'3.1.0'}));symlinkSync(old,join(appDir,'current'),process.platform==='win32'?'junction':'dir');
  writeFileSync(join(dataDir,'retouren.sqlite'),'old database');writeFileSync(join(dataDir,'secrets','mfa.key'),Buffer.alloc(32,17));
  const source=join(root,'source');for(const dir of ['dist/server','dist/public','deploy'])mkdirSync(join(source,dir),{recursive:true});const metadata={name:'retourenboard',version:'3.2.0',type:'module',engines:{node:'>=22.16.0'},retourenboard:{database:'postgresql',schema:1}};
  for(const file of ['package.json','dist/package.json'])writeFileSync(join(source,file),JSON.stringify(metadata));for(const file of ['dist/server/index.js','dist/server/app.js','dist/public/index.html'])writeFileSync(join(source,file),'test');writeFileSync(join(source,'deploy/runtime-files.txt'),'server/index.js\nserver/app.js\npublic/index.html\n');writeFileSync(join(source,'deploy/compiled-runtime-files.txt'),'server/index.js\n');
  const file=join(root,'release.tar.gz');await archive({file,cwd:source,gzip:true},['package.json','dist','deploy']);const calls=[],options={appDir,dataDir,stateDir,uid:0,gid:0,databaseConfig:readDatabaseConfig({DATABASE_URL:'postgresql://updater:fixture@127.0.0.1/test?sslmode=disable'}),leaseFactory:async()=>({held:true,close:async()=>{}}),technicalOps:{verify:async()=>{},snapshot:async({file})=>{writeFileSync(file,'trusted fixture');calls.push(['pg_dump',[]]);return {format:'pg-custom-v1',schema:'retourenboard',serverVersion:180000,sha256:'fixture'};},restore:async()=>{calls.push(['pg_restore',[]]);}},changeOwner(){},run:async(command,args)=>calls.push([command,args]),healthCheck:async()=>{}};
  return {root,appDir,dataDir,stateDir,old,file,calls,options,env:createLinuxUpdate(options)};
}
test('Linux transaction switches to validated release, checks restart, and preserves data and MFA key',async t=>{
  const f=await fixture(t),id=randomUUID();f.env.lock(id);await f.env.prepare(f.file,'3.2.0',id);await f.env.snapshot(id);await f.env.activate(id);await f.env.restart('3.2.0');await f.env.commit(id);f.env.unlock();
  assert.equal(f.env.installed(),'3.2.0');assert.equal(readFileSync(join(f.dataDir,'retouren.sqlite'),'utf8'),'old database');assert.deepEqual(readFileSync(join(f.dataDir,'secrets','mfa.key')),Buffer.alloc(32,17));assert.equal(existsSync(join(f.dataDir,UPDATE_MARKER)),false);assert.equal(existsSync(join(f.stateDir,'transaction.json')),false);assert.deepEqual(f.calls.filter(([command])=>command==='systemctl'),[['systemctl',['stop','retourenboard.service']],['systemctl',['start','retourenboard.service']]]);
});
test('failed new process restores both release and complete offline data snapshot',async t=>{
  const f=await fixture(t),id=randomUUID();f.env.lock(id);await f.env.prepare(f.file,'3.2.0',id);await f.env.snapshot(id);await f.env.activate(id);writeFileSync(join(f.dataDir,'retouren.sqlite'),'new schema');writeFileSync(join(f.dataDir,'new-file'),'new version only');writeFileSync(join(f.dataDir,'secrets','mfa.key'),Buffer.alloc(32,99));
  assert.equal(await f.env.rollback(),true);f.env.unlock();assert.equal(realpathSync(join(f.appDir,'current')),realpathSync(f.old));assert.equal(readFileSync(join(f.dataDir,'retouren.sqlite'),'utf8'),'old database');assert.deepEqual(readFileSync(join(f.dataDir,'secrets','mfa.key')),Buffer.alloc(32,17));assert.equal(existsSync(join(f.dataDir,'new-file')),false);
});
test('a helper restart recovers a journal interrupted after activation, while committed data stays intact',async t=>{
  for(const committed of [false,true]){const f=await fixture(t),id=randomUUID();f.env.lock(id);await f.env.prepare(f.file,'3.2.0',id);await f.env.snapshot(id);await f.env.activate(id);writeFileSync(join(f.dataDir,'retouren.sqlite'),'new database');if(committed)await f.env.commit(id);
    const recovered=createLinuxUpdate(f.options);await recovered.recover();assert.equal(recovered.installed(),committed?'3.2.0':'3.1.0');assert.equal(readFileSync(join(f.dataDir,'retouren.sqlite'),'utf8'),committed?'new database':'old database');assert.equal(existsSync(join(f.dataDir,UPDATE_MARKER)),false);
  }
});
test('snapshot refuses links in data and root maintenance lock cannot overwrite an existing file',async t=>{
  const f=await fixture(t),id=randomUUID();writeFileSync(join(f.dataDir,UPDATE_MARKER),'existing');assert.throws(()=>f.env.lock(id));assert.equal(readFileSync(join(f.dataDir,UPDATE_MARKER),'utf8'),'existing');rmSync(join(f.dataDir,UPDATE_MARKER));
  symlinkSync(f.old,join(f.dataDir,'outside'),process.platform==='win32'?'junction':'dir');f.env.lock(id);await assert.rejects(f.env.snapshot(id),/Links/);await f.env.rollback();f.env.unlock();
});
test('recovery works when interrupted data-directory exchange left the canonical data directory absent',async t=>{
  const f=await fixture(t),id=randomUUID();f.env.lock(id);await f.env.prepare(f.file,'3.2.0',id);await f.env.snapshot(id);await f.env.activate(id);
  const journal=JSON.parse(readFileSync(join(f.stateDir,'transaction.json'),'utf8'));journal.phase='rollingBack';writeFileSync(join(f.stateDir,'transaction.json'),JSON.stringify(journal));renameSync(f.dataDir,join(f.root,'.retourenboard-failed-'+id));
  const recovered=createLinuxUpdate(f.options);await recovered.recover();assert.equal(recovered.installed(),'3.1.0');assert.equal(readFileSync(join(f.dataDir,'retouren.sqlite'),'utf8'),'old database');assert.equal(existsSync(join(f.dataDir,UPDATE_MARKER)),false);
});
