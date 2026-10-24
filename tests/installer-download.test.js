import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildLinuxInstaller} from '../scripts/build-linux-installer.mjs';
import {downloadFixture} from './helpers/installer-download.js';

function installer(fixture){const file=join(fixture.dir,'installer with spaces.sh');if(process.env.RETOURENBOARD_INSTALLER_UNDER_TEST)copyFileSync(process.env.RETOURENBOARD_INSTALLER_UNDER_TEST,file);else buildLinuxInstaller({outputPath:file});return file;}
test('the installer stays small and resolves the latest published version on every execution',t=>{
 const first=downloadFixture(t,{tag:'v9.9.99'}),file=installer(first);
 assert.ok(readFileSync(file).length<20000,'The installer must not contain the program archive.');
 first.run(file,['--dry-run','--port','4321']);assert.equal(readFileSync(first.result,'utf8'),'--dry-run\n--port\n4321\n');
 const requests=readFileSync(first.requests,'utf8');assert.match(requests,/releases\/latest\n/);assert.match(requests,/download\/v9\.9\.99\/retourenboard-linux-9\.9\.99\.tar\.gz\n/);assert.match(requests,/tar\.gz\.sha256\n/);
 const newer=downloadFixture(t,{tag:'v9.9.100'});newer.run(file,['--test','--once']);assert.match(readFileSync(newer.requests,'utf8'),/download\/v9\.9\.100\/retourenboard-linux-9\.9\.100\.tar\.gz/);assert.deepEqual(readdirSync(newer.scratch),[]);
});
test('a release with stable asset names also downloads and verifies within that pinned release',t=>{
 const fixture=downloadFixture(t,{tag:'v9.9.99',alias:true}),file=installer(fixture);fixture.run(file,['--local']);
 assert.equal(readFileSync(fixture.result,'utf8'),'--local\n');assert.match(readFileSync(fixture.requests,'utf8'),/download\/v9\.9\.99\/retourenboard-linux\.tar\.gz\.sha256/);
});
test('corrupt or missing downloads never reach installation and their temporary files are cleaned',t=>{
 for(const options of [{corrupt:true},{missing:true}]){const fixture=downloadFixture(t,options),file=installer(fixture);assert.throws(()=>fixture.run(file,['--dry-run']),error=>/Prüfsumme|Programmpaket.*geladen/.test(error.stderr));assert.equal(existsSync(fixture.result),false);assert.deepEqual(readdirSync(fixture.scratch),[]);}
});
test('unapproved release redirects and malformed checksum records are rejected before installation',t=>{
 for(const options of [{latestUrl:'https://evil.example/releases/tag/v9.9.99'},{latestUrl:'https://github.com/KaterBeratung/retourenboard/releases/tag/v9.9.99/../../evil'},{checksumText:'a'.repeat(64)+'  other-package.tar.gz\n'},{checksumText:'a'.repeat(64)+'  retourenboard-linux-9.9.99.tar.gz\n'+'b'.repeat(64)+'  retourenboard-linux-9.9.99.tar.gz\n'}]){
  const fixture=downloadFixture(t,options),file=installer(fixture);assert.throws(()=>fixture.run(file),error=>/Release-Adresse|Prüfsummen-Datei/.test(error.stderr));assert.equal(existsSync(fixture.result),false);assert.deepEqual(readdirSync(fixture.scratch),[]);
 }
});
test('help works without network access or downloads',t=>{
 const fixture=downloadFixture(t,{missing:true}),file=installer(fixture);assert.match(fixture.run(file,['--help']),/--dry-run/);assert.equal(existsSync(fixture.requests),false);assert.deepEqual(readdirSync(fixture.scratch),[]);
});

test('a local archive with checksum installs without GitHub and preserves forwarded arguments',t=>{
 const f=downloadFixture(t,{missing:true}),file=installer(f),folder=join(f.dir,'local packages');mkdirSync(folder);const archive=join(folder,'retourenboard-linux-9.9.99.tar.gz');copyFileSync(f.env.TEST_ARCHIVE,archive);copyFileSync(f.env.TEST_CHECKSUM,archive+'.sha256');const before=readFileSync(archive);
 const output=f.run(file,['--archive',archive.replaceAll('\\','/'),'--dry-run','--port','4321']);
 assert.equal(readFileSync(f.result,'utf8'),'--dry-run\n--port\n4321\n');assert.match(output,/9\.9\.99/);assert.equal(existsSync(f.requests),false);assert.deepEqual(readFileSync(archive),before);assert.deepEqual(readdirSync(f.scratch),[]);
});
test('a directly supplied local TAR works without a checksum companion or curl invocation',t=>{
 const f=downloadFixture(t,{missing:true}),file=installer(f);f.run(file,['--dry-run',f.env.TEST_ARCHIVE,'--local']);
 assert.equal(readFileSync(f.result,'utf8'),'--dry-run\n--local\n');assert.equal(existsSync(f.requests),false);assert.deepEqual(readdirSync(f.scratch),[]);
});
test('local archive failures never fall back to GitHub or execute an installer',t=>{
 for(const args of [f=>['--archive'],f=>['--archive','--dry-run'],f=>['--archive',join(f.dir,'missing.tar.gz')],f=>['--archive',f.env.TEST_ARCHIVE,'--archive',f.env.TEST_ARCHIVE]]){
  const f=downloadFixture(t),file=installer(f);assert.throws(()=>f.run(file,args(f)));assert.equal(existsSync(f.requests),false);assert.equal(existsSync(f.result),false);assert.deepEqual(readdirSync(f.scratch),[]);
 }
 const f=downloadFixture(t),file=installer(f);writeFileSync(f.env.TEST_ARCHIVE+'.sha256','0'.repeat(64)+'  remote.tar.gz\n');assert.throws(()=>f.run(file,['--archive',f.env.TEST_ARCHIVE]),error=>/Prüfsumme/.test(error.stderr));assert.equal(existsSync(f.requests),false);assert.equal(existsSync(f.result),false);assert.deepEqual(readdirSync(f.scratch),[]);
});

test('local filenames with spaces and option values ending in tar.gz remain distinct',t=>{
 const f=downloadFixture(t,{missing:true}),file=installer(f),archive=join(f.dir,'local package.tar.gz');copyFileSync(f.env.TEST_ARCHIVE,archive);writeFileSync(archive+'.sha256',readFileSync(f.env.TEST_CHECKSUM,'utf8').slice(0,64)+'  local package.tar.gz\n');
 f.run(file,['--archive',archive.replaceAll('\\','/'),'--dry-run','--database','external','--database-url-file','connection.tar.gz']);assert.equal(readFileSync(f.result,'utf8'),'--dry-run\n--database\nexternal\n--database-url-file\nconnection.tar.gz\n');assert.equal(existsSync(f.requests),false);
});
test('malformed local archives cannot execute package code and are cleaned up',t=>{
 const f=downloadFixture(t,{missing:true}),file=installer(f),archive=join(f.dir,'broken.tar.gz');writeFileSync(archive,'not a gzip file');assert.throws(()=>f.run(file,['--archive',archive.replaceAll('\\','/')]));assert.equal(existsSync(f.requests),false);assert.equal(existsSync(f.result),false);assert.deepEqual(readdirSync(f.scratch),[]);
});

test('the installer automatically uses a versioned archive beside its own script before contacting GitHub',t=>{
 const f=downloadFixture(t,{missing:true}),file=installer(f),archive=join(f.dir,'retourenboard-linux-9.9.99.tar.gz');copyFileSync(f.env.TEST_ARCHIVE,archive);copyFileSync(f.env.TEST_CHECKSUM,archive+'.sha256');
 const output=f.run(file,['--dry-run','--port','4321']);assert.match(output,/Lokales Programmpaket: retourenboard-linux-9\.9\.99\.tar\.gz/);assert.equal(readFileSync(f.result,'utf8'),'--dry-run\n--port\n4321\n');assert.equal(existsSync(f.requests),false);assert.deepEqual(readdirSync(f.scratch),[]);
});

test('automatic lookup works from a different working directory and a script folder containing spaces',t=>{
 const f=downloadFixture(t,{missing:true}),folder=join(f.dir,'installer folder'),working=join(f.dir,'working');mkdirSync(folder);mkdirSync(working);const file=join(folder,'install.sh');copyFileSync(installer(f),file);copyFileSync(f.env.TEST_ARCHIVE,join(folder,'retourenboard-linux.tar.gz'));
 const output=f.run(file,['--dry-run'],{},{cwd:working});assert.match(output,/Lokales Programmpaket: retourenboard-linux\.tar\.gz/);assert.equal(existsSync(f.requests),false);assert.ok(existsSync(f.result));
});

test('automatic lookup falls back to the working directory and chooses version numbers numerically',t=>{
 const f=downloadFixture(t,{missing:true}),file=installer(f),working=join(f.dir,'working');mkdirSync(working);
 for(const version of ['9.9.99','9.9.100','9.10.1']){const other=downloadFixture(t,{tag:'v'+version});copyFileSync(other.env.TEST_ARCHIVE,join(working,'retourenboard-linux-'+version+'.tar.gz'));}
 copyFileSync(f.env.TEST_ARCHIVE,join(working,'unrelated.tar.gz'));const output=f.run(file,['--dry-run'],{},{cwd:working});assert.match(output,/Lokales Programmpaket: retourenboard-linux-9\.10\.1\.tar\.gz/);assert.match(output,/retourenboard\. 9\.10\.1 wird vorbereitet/);assert.equal(existsSync(f.requests),false);
});

test('the stable archive name and script folder have deterministic priority while an explicit archive overrides lookup',t=>{
 const f=downloadFixture(t,{missing:true}),file=installer(f),working=join(f.dir,'working');mkdirSync(working);copyFileSync(f.env.TEST_ARCHIVE,join(f.dir,'retourenboard-linux-9.9.99.tar.gz'));copyFileSync(f.env.TEST_ARCHIVE,join(f.dir,'retourenboard-linux.tar.gz'));copyFileSync(f.env.TEST_ARCHIVE,join(working,'retourenboard-linux-10.0.0.tar.gz'));
 assert.match(f.run(file,['--dry-run'],{},{cwd:working}),/Lokales Programmpaket: retourenboard-linux\.tar\.gz/);
 assert.match(f.run(file,['--archive',f.env.TEST_ARCHIVE,'--dry-run'],{},{cwd:working}),/Lokales Programmpaket: remote\.tar\.gz/);assert.equal(existsSync(f.requests),false);
});

test('an automatically detected corrupt archive fails without downloading or executing another package',t=>{
 const f=downloadFixture(t),file=installer(f),archive=join(f.dir,'retourenboard-linux.tar.gz');writeFileSync(archive,'corrupt');
 assert.throws(()=>f.run(file,['--dry-run']));assert.equal(existsSync(f.requests),false);assert.equal(existsSync(f.result),false);assert.deepEqual(readdirSync(f.scratch),[]);
});
