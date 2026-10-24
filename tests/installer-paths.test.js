import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readlinkSync,realpathSync,rmSync,symlinkSync,renameSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseEnv} from 'node:util';

const moduleURL=new URL('../scripts/install-paths.mjs',import.meta.url);
async function migrate(root){assert.ok(existsSync(moduleURL),'installer must migrate the existing storage before switching to retourenboard paths');return (await import(moduleURL.href)).migrateInstallPaths({root});}
function fixture(){const root=mkdtempSync(join(tmpdir(),'retourenboard-paths-'));for(const p of ['opt/retourenverwaltung/releases/old','opt/retourenverwaltung/node-v24/bin','var/lib/retourenverwaltung/secrets','var/lib/retourenboard-updater/installations/123','etc/systemd/system'])mkdirSync(join(root,p),{recursive:true});return root;}
const env='DATA_DIR=/var/lib/retourenverwaltung\nDB_PATH="/var/lib/retourenverwaltung/db#1.sqlite"\nPORT=4321\nDATABASE_URL_FILE=/etc/retourenboard/database-url\nEXAMPLE_SECRET="/var/lib/retourenverwaltung/keep-me"\n';
const nextEnv='DATA_DIR=/var/lib/retourenboard\nDB_PATH="/var/lib/retourenboard/db#1.sqlite"\nPORT=4321\nDATABASE_URL_FILE=/etc/retourenboard/database-url\nEXAMPLE_SECRET="/var/lib/retourenverwaltung/keep-me"\n';

test('installer moves legacy storage without changing keys or credentials and reconciles pending update paths',{skip:process.platform==='win32'?'Linux file symlinks require Windows privileges; also executed on Linux':false},async()=>{
 const root=fixture();try{
  const secret=Buffer.from([0,254,33,12,200,5]);writeFileSync(join(root,'var/lib/retourenverwaltung/secrets/mfa.key'),secret);writeFileSync(join(root,'etc/retourenverwaltung.env'),env,{mode:0o600});
  const stage=join(root,'var/lib/retourenboard-updater/installations/123');for(const name of ['old','new']){writeFileSync(join(stage,name+'.env'),env,{mode:0o600});writeFileSync(join(stage,name+'.service'),'WorkingDirectory=/opt/retourenverwaltung/current\nEnvironmentFile=/etc/retourenverwaltung.env\nReadWritePaths=/var/lib/retourenverwaltung\n');}
  writeFileSync(join(root,'var/lib/retourenboard-updater/install-transaction.json'),JSON.stringify({newRelease:'/opt/retourenverwaltung/releases/old',oldRelease:'/opt/retourenverwaltung/releases/prior',newRuntime:'/opt/retourenverwaltung/node-v24',oldRuntime:'/opt/retourenverwaltung/node-prior',phase:'forward-required'}),{mode:0o600});
  writeFileSync(join(root,'var/lib/retourenboard-updater/transaction.json'),JSON.stringify({oldRelease:'/opt/retourenverwaltung/releases/prior',phase:'ready'}),{mode:0o600});
  symlinkSync(join(root,'opt/retourenverwaltung/releases/old'),join(root,'opt/retourenverwaltung/current'),'junction');symlinkSync(join(root,'opt/retourenverwaltung/node-v24'),join(root,'opt/retourenverwaltung/node'),'junction');
  await migrate(root);
  assert.deepEqual(readFileSync(join(root,'var/lib/retourenboard/secrets/mfa.key')),secret);
  assert.equal(readFileSync(join(root,'etc/retourenboard.env'),'utf8'),nextEnv);
  assert.equal(parseEnv(readFileSync(join(root,'etc/retourenboard.env'),'utf8')).DB_PATH,'/var/lib/retourenboard/db#1.sqlite');
  assert.equal(readFileSync(join(stage,'old.env'),'utf8'),nextEnv);assert.equal(readFileSync(join(stage,'new.env'),'utf8'),nextEnv);
  assert.equal(readFileSync(join(stage,'new.service'),'utf8'),'WorkingDirectory=/opt/retourenboard/current\nEnvironmentFile=/etc/retourenboard.env\nReadWritePaths=/var/lib/retourenboard\n');
  const journal=JSON.parse(readFileSync(join(root,'var/lib/retourenboard-updater/install-transaction.json'),'utf8'));assert.equal(journal.newRelease,'/opt/retourenboard/releases/old');assert.equal(journal.oldRuntime,'/opt/retourenboard/node-prior');assert.equal(journal.phase,'forward-required');
  assert.equal(JSON.parse(readFileSync(join(root,'var/lib/retourenboard-updater/transaction.json'),'utf8')).oldRelease,'/opt/retourenboard/releases/prior');
  assert.equal(realpathSync(join(root,'opt/retourenboard/current')),realpathSync(join(root,'opt/retourenboard/releases/old')));
  assert.equal(realpathSync(join(root,'var/lib/retourenverwaltung')),realpathSync(join(root,'var/lib/retourenboard')));
  await migrate(root);assert.equal(readFileSync(join(root,'etc/retourenboard.env'),'utf8'),nextEnv);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('installer refuses independent old and new stores before moving any files',async()=>{
 const root=fixture();try{mkdirSync(join(root,'var/lib/retourenboard'));writeFileSync(join(root,'var/lib/retourenboard/keep'),'canonical');writeFileSync(join(root,'etc/retourenverwaltung.env'),env);await assert.rejects(()=>migrate(root),/beide|parallel|Konflikt/i);assert.ok(existsSync(join(root,'opt/retourenverwaltung/releases/old')));assert.equal(readFileSync(join(root,'etc/retourenverwaltung.env'),'utf8'),env);assert.equal(readFileSync(join(root,'var/lib/retourenboard/keep'),'utf8'),'canonical');}finally{rmSync(root,{recursive:true,force:true});}
});

test('installer resumes after an interrupted directory move and preserves external data paths',{skip:process.platform==='win32'?'Linux file symlinks require Windows privileges; also executed on Linux':false},async()=>{
 const root=fixture();try{
  writeFileSync(join(root,'etc/retourenverwaltung.env'),'DATA_DIR=/srv/custom-data\nDB_PATH=/srv/custom-data/source.sqlite\n');
  writeFileSync(join(root,'var/lib/retourenboard-updater/paths-migration.json'),JSON.stringify({format:1,phase:'started'}),{mode:0o600});renameSync(join(root,'opt/retourenverwaltung'),join(root,'opt/retourenboard'));
  await migrate(root);assert.equal(readFileSync(join(root,'etc/retourenboard.env'),'utf8'),'DATA_DIR=/srv/custom-data\nDB_PATH=/srv/custom-data/source.sqlite\n');assert.ok(lstatSync(join(root,'opt/retourenverwaltung')).isSymbolicLink());
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('fresh canonical installation does not create legacy storage or aliases',async()=>{
 const root=mkdtempSync(join(tmpdir(),'retourenboard-fresh-paths-'));try{mkdirSync(join(root,'opt/retourenboard'),{recursive:true});mkdirSync(join(root,'var/lib/retourenboard-updater'),{recursive:true});mkdirSync(join(root,'etc'),{recursive:true});await migrate(root);assert.equal(existsSync(join(root,'opt/retourenverwaltung')),false);assert.equal(existsSync(join(root,'etc/retourenverwaltung.env')),false);}finally{rmSync(root,{recursive:true,force:true});}
});
