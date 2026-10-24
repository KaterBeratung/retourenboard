import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const helper=fileURLToPath(new URL('../scripts/start-service.sh',import.meta.url));
const harness=`set -euo pipefail
source "$1"
fixture="$2"
systemctl() { printf '%s\\n' "$*" >> "$fixture/events"; if [[ "$1" == is-active ]]; then [[ -f "$fixture/\${*: -1}" ]]; else return 0; fi; }
readlink() { if [[ -f "$fixture/is-alias" && "$*" == *retourenverwaltung.service ]]; then command readlink -f -- "$fixture/retourenboard.service"; else command readlink "$@"; fi; }
ln() { printf 'alias %s\\n' "$*" >> "$fixture/events"; }
prepare_application_service "$fixture/retourenboard.service" "$fixture/retourenverwaltung.service" "$fixture/previous.service"
install_application_service "$fixture/new.service" "$fixture/retourenboard.service" "$fixture/retourenverwaltung.service"
`;
for(const existing of ['fresh','legacy','canonical','alias'])test(`service rename safely installs the canonical unit for ${existing} installation`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-service-name-'));try{
  const prior='ExecStart=/opt/retourenverwaltung/node/bin/node server/index.js\n';
  if(existing==='legacy')writeFileSync(join(dir,'retourenverwaltung.service'),prior);
  if(existing==='canonical'||existing==='alias')writeFileSync(join(dir,'retourenboard.service'),prior);
  if(existing==='alias'){writeFileSync(join(dir,'retourenverwaltung.service'),prior);writeFileSync(join(dir,'is-alias'),'yes');}
  const next='ExecStart=/opt/retourenverwaltung/node/bin/node dist/server/index.js\n';writeFileSync(join(dir,'new.service'),next);
  execFileSync('bash',['-c',harness,'service-name',helper,dir],{encoding:'utf8'});
  assert.equal(readFileSync(join(dir,'retourenboard.service'),'utf8'),next);
  const calls=readFileSync(join(dir,'events'),'utf8');assert.match(calls,/alias -sfn -- .*retourenboard.service .*retourenverwaltung.service/);
  if(existing==='fresh'){assert.equal(existsSync(join(dir,'previous.service')),false);assert.doesNotMatch(calls,/stop |disable /);}else assert.equal(readFileSync(join(dir,'previous.service'),'utf8'),prior);
  if(existing==='legacy'){assert.match(calls,/stop retourenverwaltung.service\ndisable retourenverwaltung.service/);}
  if(existing==='canonical'||existing==='alias')assert.match(calls,/stop retourenboard.service/);
  if(existing==='alias')assert.doesNotMatch(calls,/stop retourenverwaltung.service|disable retourenverwaltung.service/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a failed migrated service start restores the prior release and matching unit under the new name',()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-service-name-'));try{
  const prior='ExecStart=/opt/retourenverwaltung/node/bin/node server/index.js\n';writeFileSync(join(dir,'retourenverwaltung.service'),prior);writeFileSync(join(dir,'new.service'),'ExecStart=/opt/retourenverwaltung/node/bin/node dist/server/index.js\n');
  const rollback=`
attempts=0
systemctl() { printf '%s\\n' "$*" >> "$fixture/events"; if [[ "$1" == restart ]]; then attempts=$((attempts+1)); [[ "$attempts" -gt 1 ]]; elif [[ "$1" == is-active ]]; then [[ "$attempts" -gt 1 ]]; else return 0; fi; }
sleep() { :; }
journalctl() { :; }
if start_service_or_restore retourenboard.service /opt/retourenverwaltung /old/release /old/runtime "$fixture/previous.service" "$fixture/retourenboard.service"; then exit 99; fi
[[ "$attempts" == 2 ]]
`;
  execFileSync('bash',['-c',harness+rollback,'service-name',helper,dir],{encoding:'utf8'});
  assert.equal(readFileSync(join(dir,'retourenboard.service'),'utf8'),prior);const calls=readFileSync(join(dir,'events'),'utf8');assert.match(calls,/daemon-reload\nrestart retourenboard.service/);assert.match(calls,/alias -sfn -- \/old\/release \/opt\/retourenverwaltung\/current/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a failed legacy stop prevents unit replacement',()=>{
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-service-name-'));try{
  writeFileSync(join(dir,'retourenverwaltung.service'),'original');writeFileSync(join(dir,'new.service'),'new');
  const script=harness.replace('else return 0;','else [[ "$1" != stop ]];');
  assert.throws(()=>execFileSync('bash',['-c',script,'service-name',helper,dir],{encoding:'utf8'}),error=>error.status===1);
  assert.match(readFileSync(join(dir,'events'),'utf8'),/stop retourenverwaltung.service/);
  assert.equal(existsSync(join(dir,'retourenboard.service')),false);assert.equal(readFileSync(join(dir,'retourenverwaltung.service'),'utf8'),'original');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
