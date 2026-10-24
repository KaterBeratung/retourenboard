import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const guard=fileURLToPath(new URL('../scripts/install-updater-guard.sh',import.meta.url));
for(const pending of [false,'marker','journal'])test(`manual installer pauses helper and ${pending?'rejects '+pending:'continues only without a pending update'}`,()=>{
  const dir=mkdtempSync(join(tmpdir(),'retourenboard-install-guard-'));try{for(const folder of ['data','state'])mkdirSync(join(dir,folder));if(pending)writeFileSync(join(dir,pending==='marker'?'data/.update-maintenance':'state/transaction.json'),'active');
    const output=execFileSync('bash',['-c','set -u\nsource "$1"\nfixture="$2"\nsystemctl() { printf "%s\\n" "$*" >> "$fixture/log"; return 0; }\nif pause_in_app_updater "$fixture/data" "$fixture/state"; then printf "INSTALL_ALLOWED\\n"; else printf "INSTALL_BLOCKED\\n"; fi', 'guard-test',guard,dir],{encoding:'utf8'});
    assert.match(output,pending?/INSTALL_BLOCKED/:/INSTALL_ALLOWED/);const calls=readFileSync(join(dir,'log'),'utf8');assert.match(calls,/stop retourenboard-updater.service/);if(pending)assert.match(calls,/start retourenboard-updater.service/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

for(const phase of ['staging','prepared','activating','database-committed','forward-required','committed','rolledBack'])test(`installer journal ${phase} can finish its own maintenance cleanup`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-journal-guard-'));try{mkdirSync(join(dir,'data'));mkdirSync(join(dir,'state'));writeFileSync(join(dir,'data/.update-maintenance'),'12345678-1234-4123-8123-123456789012');writeFileSync(join(dir,'state/install-transaction.json'),JSON.stringify({format:1,id:'12345678-1234-4123-8123-123456789012',phase}));
 const output=execFileSync('bash',['-c','source "$1"\nfixture="$2"\nsystemctl() { return 0; }\nif pause_in_app_updater "$fixture/data" "$fixture/state"; then printf "ALLOWED"; else printf "BLOCKED"; fi','guard-test',guard,dir],{encoding:'utf8'});
 assert.match(output,/ALLOWED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('a completed installer never claims a later in-app update marker or journal',()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-foreign-update-'));try{mkdirSync(join(dir,'data'));mkdirSync(join(dir,'state'));writeFileSync(join(dir,'data/.update-maintenance'),'later-job');writeFileSync(join(dir,'state/install-transaction.json'),JSON.stringify({format:1,id:'12345678-1234-4123-8123-123456789012',phase:'committed'}));
 const run=()=>execFileSync('bash',['-c','source "$1"\nsystemctl() { return 0; }\nif pause_in_app_updater "$2/data" "$2/state"; then echo ALLOWED; else echo BLOCKED; fi','guard-test',guard,dir],{encoding:'utf8'});
 assert.match(run(),/BLOCKED/);writeFileSync(join(dir,'data/.update-maintenance'),'12345678-1234-4123-8123-123456789012');writeFileSync(join(dir,'state/transaction.json'),JSON.stringify({id:'later-job',phase:'committed'}));assert.match(run(),/BLOCKED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('installer recognizes its JSON-encoded maintenance marker written by managed-install',()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-json-marker-'));try{mkdirSync(join(dir,'data'));mkdirSync(join(dir,'state'));const id='12345678-1234-4123-8123-123456789012';writeFileSync(join(dir,'data/.update-maintenance'),JSON.stringify(id));writeFileSync(join(dir,'state/install-transaction.json'),JSON.stringify({format:1,id,phase:'forward-required'}));
 const output=execFileSync('bash',['-c','source "$1"\nsystemctl() { return 0; }\nif pause_in_app_updater "$2/data" "$2/state"; then echo ALLOWED; else echo BLOCKED; fi','guard-test',guard,dir],{encoding:'utf8'});assert.match(output,/ALLOWED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
