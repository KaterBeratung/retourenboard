import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {networkInterfaces} from 'node:os';
import {restoreFixture} from './helpers/restore-runtime.js';import {testPassword} from './helpers/runtime.js';
import {fileURLToPath} from 'node:url';
test('installer emits the container address for normal and HTTPS installations',()=>{
 assert.match(execFileSync('bash',['tests/install-network.test.sh'],{encoding:'utf8'}),/PASS/);
});
test('installer test mode advertises the same selected container address as normal installation',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const script='set -euo pipefail\nsource "$1/scripts/install-network.sh"\nsource "$1/scripts/test-linux.sh"\ninstall_server_address() { printf "192.168.1.42"; }\nport=0;lan=true;once=true\nrun_test_app "$1"\n';
 const output=execFileSync('bash',['-c',script,'test-address',root],{encoding:'utf8',timeout:15000});assert.match(output,/TEST_URL=http:\/\/192\.168\.1\.42:\d+/);assert.match(output,/Im Browser öffnen: http:\/\/192\.168\.1\.42:\d+/);assert.match(output,/TEST_OK/);
});
test('all-interface listener accepts login over its actual private IPv4 address with HTTPS configured',async t=>{
 const address=Object.values(networkInterfaces()).flat().find(item=>item?.family==='IPv4'&&!item.internal&&(/^(10\.|192\.168\.)/.test(item.address)||/^172\.(1[6-9]|2\d|3[01])\./.test(item.address)))?.address;
 if(!address)return t.skip('Keine private IPv4-Adresse für den LAN-Verbindungstest.');
 const f=await restoreFixture(t,{host:'0.0.0.0',publicOrigin:'https://retourenboard.app',secureCookies:true,production:true});await f.setup();
 const base=`http://${address}:${f.app.server.address().port}`;
 const session=await fetch(base+'/api/session',{signal:AbortSignal.timeout(3000)});assert.equal(session.status,200);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'Admin',password:testPassword}),signal:AbortSignal.timeout(3000)});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/^retouren_local_session=/);
 const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(base+'/api/products',{headers:{Cookie:cookie},signal:AbortSignal.timeout(3000)})).status,200);
});
