import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir,networkInterfaces} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
test('installer repairs a bind address absent from the current container without changing domain, port or secrets',t=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-binding-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'app.env'),original='HOST=203.0.113.253\nPORT=4321\nPUBLIC_ORIGIN=https://board.example\nDATABASE_URL_FILE=/private/database-url\n';writeFileSync(file,original);
 execFileSync('bash',['-c','set -euo pipefail\nsource scripts/install-network.sh\napply_install_binding "$1" true false "$2"','test',file.replaceAll('\\','/'),process.execPath.replaceAll('\\','/')],{encoding:'utf8'});
 assert.equal(readFileSync(file,'utf8'),original.replace('HOST=203.0.113.253','HOST=0.0.0.0'));
});
test('recovery repairs the staged environment and preserves explicit local access',async t=>{
 const {repairInstallBinding}=await import('../scripts/install-binding.mjs');const dir=mkdtempSync(join(tmpdir(),'retourenboard-recovery-binding-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const staged=join(dir,'new.env'),text='HOST=10.1.10.162\nPORT=3000\nSECURE_COOKIES=true\nPUBLIC_ORIGIN=https://board.example\n';writeFileSync(staged,text);
 const interfaces={eth0:[{address:'10.1.10.163',family:'IPv4'}]};repairInstallBinding(staged,{mode:'local',interfaces});assert.equal(readFileSync(staged,'utf8'),text.replace('HOST=10.1.10.162','HOST=127.0.0.1'));repairInstallBinding(staged,{mode:'auto',interfaces});assert.equal(readFileSync(staged,'utf8'),text.replace('HOST=10.1.10.162','HOST=127.0.0.1'));
});
test('assigned IPs, equivalent IPv6 addresses and custom hostnames are preserved',async()=>{
 const {installBindingHost}=await import('../scripts/install-binding.mjs');const interfaces={eth0:[{address:'10.1.10.163',family:'IPv4'},{address:'fd00::1',family:'IPv6'}]};
 for(const host of ['10.1.10.163','fd00:0:0:0:0:0:0:1','app.internal','0.0.0.0','::','127.0.0.1'])assert.equal(installBindingHost(host,{interfaces}),host);
 assert.equal(installBindingHost('10.1.10.162',{interfaces}),'0.0.0.0');assert.equal(installBindingHost('10.1.10.163',{interfaces,mode:'local'}),'127.0.0.1');assert.equal(installBindingHost('127.0.0.1',{interfaces,mode:'lan'}),'0.0.0.0');
});
