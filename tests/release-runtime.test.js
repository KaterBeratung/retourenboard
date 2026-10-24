import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,existsSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {buildLinuxPackages} from '../scripts/build-linux-installer.mjs';
import {validateUpdatePackage} from '../dist/server/update-package.js';

const project=fileURLToPath(new URL('../',import.meta.url));

test('extracted release starts without developer dependencies and enforces the MFA boundary',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'retourenboard-release-'));
  let child;
  t.after(async()=>{if(child?.exitCode===null){const done=once(child,'exit'),timer=setTimeout(()=>child.kill(),5000);child.send('stop');await done;clearTimeout(timer);}rmSync(dir,{recursive:true,force:true});});
  const manifest=buildLinuxPackages({sourceDir:project,outputDir:join(dir,'packages')});
  const runtime=join(dir,'runtime');
  await validateUpdatePackage({archive:join(dir,'packages',manifest.version,`retourenboard-linux-${manifest.version}.tar.gz`),target:runtime,version:manifest.version});
  for(const name of ['backend/src/server/mfa.ts','package-lock.json','scripts/recover-account.mjs','scripts/restore-backup.mjs','dist/vendor/licenses/packages.json','docs/IN-APP-UPDATES.md','scripts/install-updater.sh','deploy/retourenboard-updater.service'])assert.ok(existsSync(join(runtime,name)),name);
  assert.equal(existsSync(join(runtime,'node_modules')),false);
  const licenses=JSON.parse(readFileSync(join(runtime,'dist/vendor/licenses/packages.json'),'utf8'));
  assert.ok(licenses['pngjs'],'Bundled transitive licenses must be included');
  const compat=await import(pathToFileURL(join(runtime,'server/app.js'))),compiled=await import(pathToFileURL(join(runtime,'dist/server/app.js')));
  assert.equal(compat.createApp,compiled.createApp);
  child=spawn(process.execPath,['scripts/test-server.mjs','--port','0'],{cwd:runtime,stdio:['ignore','pipe','pipe','ipc']});
  let output='',errors='';child.stderr.on('data',chunk=>errors+=chunk);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout '+errors)),15000);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('TEST_URL=')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Exit ${code}: ${errors}`));});});
  const base=output.match(/TEST_URL=(http:\/\/[^\s]+)/)[1];
  const request=(path,method='GET',body,auth={})=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...auth},body:body===undefined?undefined:JSON.stringify(body)});
  const session=await(await request('/api/session')).json();assert.equal(session.version,JSON.parse(readFileSync(join(project,'package.json'),'utf8')).version);
  assert.equal((await request('/api/products')).status,401);
  for(const name of ['bootstrap.js','login.js','auth-security.js','auth-context.js','ui.js','unsaved.js','settings.css'])assert.equal((await request('/'+name)).status,200,name);
  const privateModules=['app.js','account.js','admin-backups.js','admin-notifications.js','admin-updater.js','admin-updates.js','server-operations.js','appearance.js','pagination.js','input-generation.js','return-status.js','switches.js'];
  for(const name of privateModules)assert.equal((await request('/'+name)).status,401,name);
  const response=await request('/api/setup','POST',{username:'Admin',displayName:'Package Admin',password:'Package-Test-Passwort!'}),setup=await response.json();
  const auth={Cookie:response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':setup.csrfToken};
  for(const name of privateModules)assert.equal((await request('/'+name,'GET',undefined,auth)).status,200,name);
  const enrollment=await(await request('/api/account/mfa/setup','POST',{password:'Package-Test-Passwort!'},auth)).json();
  const {TOTP,Secret}=await import(pathToFileURL(join(runtime,'dist/vendor/totp.js')));
  const code=new TOTP({secret:Secret.fromBase32(enrollment.secret),algorithm:'SHA1',digits:6,period:30}).generate();
  const verified=await request('/api/account/mfa/verify','POST',{enrollmentId:enrollment.enrollmentId,code},auth);assert.equal(verified.status,200);
  const proof=await verified.json();
  const confirmed=await request('/api/account/mfa/confirm','POST',{confirmationId:proof.confirmationId,saved:true},auth);assert.equal(confirmed.status,200);
  const login=await request('/api/login','POST',{username:'Admin',password:'Package-Test-Passwort!'}),challenge=await login.json();
  assert.equal(challenge.mfaRequired,true);assert.equal(Boolean(challenge.unlocked),false);
  const partial={Cookie:login.headers.get('set-cookie')?.split(';')[0]??''};
  for(const path of ['/api/products','/api/returns','/api/config','/api/admin/diagnostics','/api/account','/app.js','/account.js'])assert.equal((await request(path,'GET',undefined,partial)).status,401,path);
});

test('shell installation refuses a modern source-only package before touching the system',()=>{
  const dir=mkdtempSync(join(tmpdir(),'retourenboard-shell-contract-'));
  try{
    writeFileSync(join(dir,'package.json'),'{"version":"1.4.0"}');
    const script=`source '${join(project,'scripts/install-options.sh').replaceAll('\\','/')}'; select_app_layout '${dir.replaceAll('\\','/')}';`;
    assert.throws(()=>execFileSync('bash',['-c',script],{encoding:'utf8'}),error=>/Kompilierter Build fehlt/.test(error.stderr));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
