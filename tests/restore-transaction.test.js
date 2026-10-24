import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
test('a stopped file switch recovers original bytes at every rename boundary and keeps backups',async t=>{
 const {createRestoreTransaction}=await import('../dist/server/restore-transaction.js');
 for(let fault=1;fault<=12;fault++){
  const dir=mkdtempSync(join(tmpdir(),'retourenboard-switch-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(join(dir,'prepared'));mkdirSync(join(dir,'attachments'));mkdirSync(join(dir,'backups'));mkdirSync(join(dir,'secrets'));
  writeFileSync(join(dir,'preview.sqlite'),'OLD');writeFileSync(join(dir,'attachments','old.jpg'),'OLD IMAGE');writeFileSync(join(dir,'backups','keep'),'BACKUP');writeFileSync(join(dir,'secrets','smtp.key'),'SMTP');writeFileSync(join(dir,'prepared','retouren.sqlite'),'NEW');mkdirSync(join(dir,'prepared','branding'));writeFileSync(join(dir,'prepared','branding','new.png'),'NEW IMAGE');
  let steps=0;const tx=createRestoreTransaction({dataDir:dir,dbPath:join(dir,'preview.sqlite'),io:{checkpoint(){if(++steps===fault)throw Error('ENOSPC');}}});
  try{await tx.activate(join(dir,'prepared'),randomUUID());}catch{}
  await createRestoreTransaction({dataDir:dir,dbPath:join(dir,'preview.sqlite')}).recover();
  assert.equal(readFileSync(join(dir,'preview.sqlite'),'utf8'),'OLD');assert.equal(readFileSync(join(dir,'attachments','old.jpg'),'utf8'),'OLD IMAGE');assert.equal(readFileSync(join(dir,'backups','keep'),'utf8'),'BACKUP');assert.equal(readFileSync(join(dir,'secrets','smtp.key'),'utf8'),'SMTP');assert.equal(existsSync(join(dir,'branding')),false);
 }
});
test('a committed restore remains active and unsafe journal paths are rejected',async t=>{
 const {createRestoreTransaction}=await import('../dist/server/restore-transaction.js'),dir=mkdtempSync(join(tmpdir(),'retourenboard-switch-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(join(dir,'prepared'));writeFileSync(join(dir,'preview.sqlite'),'OLD');writeFileSync(join(dir,'prepared','retouren.sqlite'),'NEW');
 const tx=createRestoreTransaction({dataDir:dir,dbPath:join(dir,'preview.sqlite')});await tx.activate(join(dir,'prepared'),randomUUID());await tx.commit();assert.equal(await tx.recover(),'committed');assert.equal(readFileSync(join(dir,'preview.sqlite'),'utf8'),'NEW');
 writeFileSync(join(dir,'.restore','journal.json'),JSON.stringify({format:1,operationId:randomUUID(),phase:'switching',entries:[{relativePath:'../outside',hadOriginal:true}]}));await assert.rejects(()=>tx.recover(),/Journal/);
});
