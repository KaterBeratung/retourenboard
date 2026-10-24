import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {createLinuxUpdate} from './fixtures/sqlite-updater57/update-linux.js';
import {createStore} from '../dist/server/legacy-sqlite/store.js';
import {buildLinuxPackages} from '../scripts/build-linux-installer.mjs';
test('the original 3.2.57 updater rejects the PostgreSQL package before stopping SQLite and releases its lock for retry',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-old-updater-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const dataDir=join(dir,'data'),appDir=join(dir,'app'),stateDir=join(dir,'state');for(const p of [dataDir,stateDir,join(appDir,'releases')])mkdirSync(p,{recursive:true});
 const path=join(dataDir,'retouren.sqlite'),legacy=createStore(path);legacy.createProduct({sku:'PRESERVED',name:'Altbestand'});legacy.close();const hash=()=>createHash('sha256').update(readFileSync(path)).digest('hex'),before=hash();
 const {version}=buildLinuxPackages({outputDir:join(dir,'packages')}),archive=join(dir,'packages',version,`retourenboard-linux-${version}.tar.gz`),calls=[];
 const adapter=createLinuxUpdate({appDir,dataDir,stateDir,uid:0,gid:0,run:async(...args)=>calls.push(args),changeOwner:()=>{}});
 for(let attempt=0;attempt<2;attempt++){const id=randomUUID();adapter.lock(id);await assert.rejects(adapter.prepare(archive,version,id),/unzulässig|ungültig|Paket/i);assert.equal(await adapter.rollback(),false);adapter.unlock();assert.equal(hash(),before);assert.equal(existsSync(join(dataDir,'.update-maintenance')),false);}
 assert.deepEqual(calls,[],'old service must keep running through rejected PostgreSQL handoffs');
});
