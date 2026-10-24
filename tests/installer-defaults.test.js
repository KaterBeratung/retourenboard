import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir,networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('single-file wrapper defaults to container access and preserves explicit local or LAN options',()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-wrapper-options-'));
 try{
  const header=readFileSync(join(root,'deploy/installer-header.sh'),'utf8').replace(/\r\n/g,'\n'),wrapper=join(dir,'wrapper.sh'),stub=join(dir,'install.sh');
  // Replace package preparation; execute the wrapper's real option handling
  // and invocation with the production parser, without system installation.
  writeFileSync(wrapper,header.replace(/# BEGIN EXTRACT_BUNDLE[\s\S]*?# END EXTRACT_BUNDLE/,'mkdir -p "$temp_dir/app/scripts"\ncp "$TEST_INSTALL_SCRIPT" "$temp_dir/app/scripts/install-linux.sh"'));
  writeFileSync(stub,'#!/usr/bin/env bash\nset -euo pipefail\nusage() { :; }\nsource "$TEST_OPTIONS_SCRIPT"\nparse_install_options "$@"\nprintf "MODE=%s\\nLAN=%s\\nDOMAIN=%s\\nPORT=%s\\n" "$mode" "$lan" "$domain" "$port"\n');
  const run=args=>execFileSync('bash',[wrapper,...args],{encoding:'utf8',env:{...process.env,TEST_INSTALL_SCRIPT:stub,TEST_OPTIONS_SCRIPT:join(root,'scripts/install-options.sh')}});
  for(const args of [[],['--dry-run'],['--check']]){const output=run(args);assert.match(output,/LAN=true/);assert.match(output,/PORT=3000/);}
  assert.match(run(['--lan']),/LAN=true/);assert.match(run(['--domain','example.test']),/LAN=true\nDOMAIN=example.test/);assert.match(run(['--test']),/MODE=test\nLAN=true\nDOMAIN=\nPORT=3001/);assert.match(run(['--test','--lan']),/MODE=test\nLAN=true/);
  assert.match(run(['--domain','example.test','--lan']),/LAN=true\nDOMAIN=example.test/);
  assert.match(run(['--local']),/LAN=false/);assert.match(run(['--test','--local']),/MODE=test\nLAN=false/);assert.match(run(['--domain','example.test','--local']),/LAN=false\nDOMAIN=example.test/);
  assert.throws(()=>run(['--local','--lan']));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('new installation binds to container interfaces while retaining HTTPS proxy trust and explicit local access',()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-install-config-'));
 try{
  const installer=readFileSync(join(root,'scripts/install-linux.sh'),'utf8').replace(/\r\n/g,'\n'),stage=installer.match(/^if \[\[ ! -e "\$config"[\s\S]*?^chmod 600 "\$config"$/m)?.[0];assert.ok(stage);
  const config=join(dir,'config.env'),fixture=join(dir,'fixture.sh');writeFileSync(fixture,'#!/usr/bin/env bash\nset -euo pipefail\nconfig="$1"; domain="$2"; lan="$3"; binding_set="$4"; port=3000\nsource "$5"\nchown() { :; }; chmod() { :; }\n'+stage+'\n');
  const run=(domain='',lan='true',explicit='false')=>execFileSync('bash',[fixture,config,domain,lan,explicit,join(root,'scripts/install-network.sh')],{encoding:'utf8'});
  run();assert.match(readFileSync(config,'utf8'),/^HOST=0.0.0.0$/m);assert.doesNotMatch(readFileSync(config,'utf8'),/^TRUSTED_PROXIES=.+$/m);
  rmSync(config);run('','true');assert.match(readFileSync(config,'utf8'),/^HOST=0.0.0.0$/m);
  rmSync(config);run('example.test');assert.match(readFileSync(config,'utf8'),/^HOST=0.0.0.0$/m);assert.match(readFileSync(config,'utf8'),/^TRUSTED_PROXIES=127.0.0.1,::1$/m);
  rmSync(config);run('example.test','true');assert.match(readFileSync(config,'utf8'),/^HOST=0.0.0.0$/m);assert.match(readFileSync(config,'utf8'),/^PUBLIC_ORIGIN=https:\/\/example.test$/m);assert.match(readFileSync(config,'utf8'),/^SECURE_COOKIES=true$/m);
  const availableHost=Object.values(networkInterfaces()).flat().find(address=>address.family==='IPv4'&&!address.internal)?.address??'127.0.0.2';
  const old=('HOST=10.0.0.5\nPORT=4321\nPUBLIC_ORIGIN=https://old.test\nTRUSTED_PROXIES=10.0.0.8\n').replaceAll('10.0.0.5',availableHost);writeFileSync(config,old);run();assert.equal(readFileSync(config,'utf8'),old);
  const loopback=old.replace('HOST='+availableHost,'HOST=127.0.0.1');writeFileSync(config,loopback);run();assert.equal(readFileSync(config,'utf8'),old.replace('HOST='+availableHost,'HOST=0.0.0.0'));
  writeFileSync(config,loopback.replace('HOST=127.0.0.1','  HOST = 127.0.0.1   '));run();assert.equal(readFileSync(config,'utf8'),old.replace('HOST='+availableHost,'HOST=0.0.0.0'));
  const spaced=old.replace('HOST='+availableHost,'HOST = "'+availableHost+'"   ');writeFileSync(config,spaced);run();assert.equal(readFileSync(config,'utf8'),spaced);
  run('','true','true');assert.equal(readFileSync(config,'utf8'),old.replace('HOST='+availableHost,'HOST=0.0.0.0'));
  run('','false','true');assert.equal(readFileSync(config,'utf8'),loopback);
  rmSync(config);run('','false','true');assert.match(readFileSync(config,'utf8'),/^HOST=127.0.0.1$/m);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
