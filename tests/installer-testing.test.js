import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {cpSync,existsSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {downloadFixture} from './helpers/installer-download.js';

const project=fileURLToPath(new URL('../',import.meta.url));
const cli=(args)=>execFileSync('bash',['scripts/install-linux.sh',...args],{cwd:project,encoding:'utf8',timeout:10000});

test('dry-run and check inspect the current build without installation',()=>{
  for(const mode of ['--dry-run','--check']){
    const output=cli([mode,'--port','4321']);
    assert.match(output,/PROBELAUF/);assert.match(output,/4321/);assert.doesNotMatch(output,/Voraussetzungen installieren/);
  }
});

test('test-mode help explains disposable data and conflicting options are rejected',()=>{
  assert.match(cli(['--help']),/--test/);assert.match(cli(['--help']),/--dry-run/);
  for(const args of [['--test','--domain','example.test'],['--port','0'],['--port','abc'],['--test','--dry-run']]){
    let error;try{cli(args);}catch(e){error=e;}assert.ok(error,'Invalid CLI must fail');assert.doesNotMatch(error.stdout||'',/Voraussetzungen installieren/);
  }
});

test('package command emits versioned archives and integrity metadata for the current build',async t=>{
  const module=await import('../scripts/build-linux-installer.mjs');assert.equal(typeof module.buildLinuxPackages,'function');
  const dir=mkdtempSync(join(tmpdir(),'retouren-versioned-'));
  try{
    const result=module.buildLinuxPackages({sourceDir:project,outputDir:dir});const version=JSON.parse(readFileSync(join(project,'package.json'),'utf8')).version;
    assert.ok(existsSync(join(dir,version,`retourenboard-install-${version}.sh`)));assert.ok(existsSync(join(dir,version,`retourenboard-linux-${version}.tar.gz`)));
    assert.ok(existsSync(join(dir,'latest','retourenboard-install.sh')));assert.ok(existsSync(join(dir,'latest','retourenboard-linux.tar.gz')));
    assert.equal(existsSync(join(dir,'retourenboard-install.sh')),false,'Package output must keep the top level tidy');
    const manifest=JSON.parse(readFileSync(join(dir,'release-manifest.json'),'utf8'));assert.equal(manifest.version,version);assert.equal(result.version,version);
    for(const {name,path,sha256}of manifest.files){
      assert.equal(createHash('sha256').update(readFileSync(join(dir,path))).digest('hex'),sha256);
      assert.equal(readFileSync(join(dir,path+'.sha256'),'utf8'),`${sha256}  ${name}\n`);
    }
    const files=execFileSync('tar',['-tzf',join(dir,version,`retourenboard-linux-${version}.tar.gz`)],{encoding:'utf8'}).split(/\r?\n/);
    assert.ok(files.includes('dist/server/index.js'));assert.ok(files.includes('dist/public/admin.html'));assert.ok(files.includes('scripts/test-server.mjs'));
    assert.equal(files.some(name=>name.startsWith('releases/')),false,'Previous release packages must not be repackaged');
    assert.equal(files.some(name=>/(^|\/)(\.env|data|\.qa|node_modules)(\/|$)|\.(sqlite|sqlite-wal|sqlite-shm)$/.test(name)),false);
    const download=downloadFixture(t,{tag:'v'+version,archivePath:join(dir,version,`retourenboard-linux-${version}.tar.gz`)});
    const check=download.run(join(dir,version,`retourenboard-install-${version}.sh`),['--dry-run']);assert.match(check,/PROBELAUF/);assert.match(check,new RegExp(`Version: ${version.replaceAll('.','\\.')}`));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('test runner serves the current app with fresh accounts and no production database',async t=>{
  assert.ok(existsSync(join(project,'scripts/test-server.mjs')),'isolated test runner is missing');
  const child=spawn(process.execPath,[join(project,'scripts/test-server.mjs'),'--port','0'],{cwd:project,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,DB_PATH:'must-not-be-used.sqlite',PUBLIC_ORIGIN:'https://must-not-be-used.test',SECURE_COOKIES:'true',NODE_ENV:'production'}});
  let errors='',output='';child.stderr.on('data',chunk=>errors+=chunk);t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit'),timer=setTimeout(()=>child.kill(),10000);child.send('stop');await stopped;clearTimeout(timer);}const path=output.match(/TEST_DATA=([^\r\n]+)/)?.[1];if(path)assert.equal(existsSync(path),false,'test data must be removed on stop');});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Test startup timed out: '+errors)),10000);child.stdout.on('data',chunk=>{output+=chunk;if(/TEST_URL=http:\/\//.test(output)){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Test runner exited '+code+': '+errors));});});
  const base=output.match(/TEST_URL=(http:\/\/[^\s]+)/)[1];
  const session=await(await fetch(base+'/api/session')).json();assert.equal(session.setupRequired,true);assert.equal(session.unlocked,false);
  assert.equal((await fetch(base+'/api/products')).status,401);assert.equal((await fetch(base+'/admin')).status,200);
  assert.equal(existsSync(join(project,'must-not-be-used.sqlite')),false);
});

test('one-shot test starts and cleans up without touching installation paths',()=>{
  const output=cli(['--test','--port','39019','--once']);assert.match(output,/TEST_OK/);
  const path=output.match(/TEST_DATA=([^\r\n]+)/)[1];assert.equal(existsSync(path),false);
});

test('an incomplete compiled build is rejected by packaging, check, test and startup',async()=>{
  const {buildLinuxPackages}=await import('../scripts/build-linux-installer.mjs');
  const dir=mkdtempSync(join(tmpdir(),'retouren-incomplete-'));
  try{
    for(const entry of ['LICENSE','package.json','README.md','.env.example','.dockerignore','Dockerfile','server','shared','public','scripts','deploy','tests','dist'])cpSync(join(project,entry),join(dir,entry),{recursive:true});
    rmSync(join(dir,'dist/server/app.js'));
    assert.throws(()=>buildLinuxPackages({sourceDir:dir,outputDir:join(dir,'output')}),/dist[\\/]server[\\/]app\.js/,'Packaging must reject missing compiled app');
    for(const args of [['scripts/install-linux.sh','--dry-run'],['scripts/install-linux.sh','--test','--once']]){
      assert.throws(()=>execFileSync('bash',args,{cwd:dir,encoding:'utf8',timeout:15000}),error=>error.status!==0&&/dist[\\/]server[\\/]app\.js/.test(error.stderr)&&!/TEST_OK|Voraussetzungen installieren/.test(error.stdout));
    }
    for(const script of ['scripts/test-server.mjs','scripts/start.mjs']){
      assert.throws(()=>execFileSync(process.execPath,[script,'--once'],{cwd:dir,encoding:'utf8',timeout:15000}),error=>error.status!==0&&/dist[\\/]server[\\/]app\.js/.test(error.stderr));
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('an occupied test port reports the conflict and removes temporary data',async()=>{
  const blocker=createServer(),dir=mkdtempSync(join(tmpdir(),'retouren-port-conflict-'));
  try{
    await new Promise(resolve=>blocker.listen(0,'127.0.0.1',resolve));
    const child=spawn(process.execPath,['scripts/test-server.mjs','--port',String(blocker.address().port),'--once'],{cwd:project,stdio:['ignore','pipe','pipe'],env:{...process.env,TEMP:dir,TMP:dir,TMPDIR:dir}});
    let errors='';child.stderr.on('data',chunk=>errors+=chunk);
    const [code]=await once(child,'exit');assert.equal(code,1);assert.match(errors,/Port \d+ ist bereits belegt/);
    assert.deepEqual(readdirSync(dir),[],'failed test startup must remove its database and attachments');
  }finally{await new Promise(resolve=>blocker.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
