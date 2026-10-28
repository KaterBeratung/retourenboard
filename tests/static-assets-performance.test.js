import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,unlinkSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {gunzipSync,gzip as gzipCallback} from 'node:zlib';
import {promisify} from 'node:util';
import {runtimeFixture} from './helpers/runtime.js';
const gzip=promisify(gzipCallback);
const module=await import('../dist/server/static-assets.js').catch(()=>({}));
const raw=(base,path,headers={})=>new Promise((done,fail)=>{httpRequest(base+path,{headers},response=>{const chunks=[];response.on('data',b=>chunks.push(b));response.on('end',()=>done({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));}).on('error',fail).end();});
const directory=t=>{const dir=mkdtempSync(join(tmpdir(),'rb-static-performance-'));t.after(()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));assert.match(dir,/rb-static-performance-/);rmSync(dir,{recursive:true,force:true});});return dir;};

test('static code and CSS negotiate gzip without changing bytes, private cache policy or HEAD metadata',async t=>{
 const f=await runtimeFixture(t),{auth}=await f.setup();
 for(const path of ['/app.js','/design.css']){
  const plain=await raw(f.base,path,{...auth,'Accept-Encoding':'identity'}),compressed=await raw(f.base,path,{...auth,'Accept-Encoding':'gzip'});
  assert.equal(compressed.status,200);assert.equal(compressed.headers['content-encoding'],'gzip');
  assert.deepEqual(gunzipSync(compressed.body),plain.body);assert.ok(compressed.body.length<plain.body.length*.7);
  assert.match(compressed.headers.vary,/Accept-Encoding/i);
  if(path==='/app.js'){assert.match(compressed.headers.vary,/Cookie/i);assert.match(compressed.headers['cache-control'],/private.*no-store/);}
  const head=await new Promise((done,fail)=>{httpRequest(f.base+path,{method:'HEAD',headers:{...auth,'Accept-Encoding':'gzip'}},res=>{let bytes=0;res.on('data',b=>bytes+=b.length);res.on('end',()=>done({headers:res.headers,bytes}));}).on('error',fail).end();});
  assert.equal(head.headers['content-encoding'],'gzip');assert.equal(Number(head.headers['content-length']),compressed.body.length);assert.equal(head.bytes,0);
 }
 for(const encoding of ['gzip;q=0','gzip;q=0, *;q=1','identity','br']){const response=await raw(f.base,'/app.js',{...auth,'Accept-Encoding':encoding});assert.equal(response.headers['content-encoding'],undefined,encoding);}
});

test('cached static code still requires fresh authentication and never compresses private API data',async t=>{
 const f=await runtimeFixture(t),{auth}=await f.setup();await raw(f.base,'/app.js',{...auth,'Accept-Encoding':'gzip'});
 const anonymous=await raw(f.base,'/app.js',{'Accept-Encoding':'gzip'});assert.equal(anonymous.status,401);assert.equal(anonymous.headers['content-encoding'],undefined);
 const api=await raw(f.base,'/api/session',{...auth,'Accept-Encoding':'gzip'});assert.equal(api.headers['content-encoding'],undefined);assert.match(api.headers['cache-control'],/no-store/);
 await f.request('/api/logout','POST',{},auth);
 const locked=await raw(f.base,'/app.js',{...auth,'Accept-Encoding':'gzip'});assert.equal(locked.status,401);assert.equal(locked.headers['content-encoding'],undefined);
});

test('static cache coalesces concurrent reads and compression, but notices changed files',async t=>{
 assert.equal(typeof module.createStaticAssetReader,'function');const dir=directory(t),file=join(dir,'code.js');writeFileSync(file,'original '.repeat(300));let reads=0,compressions=0;
 const reader=module.createStaticAssetReader({readFile:async file=>{reads++;return readFile(file);},compress:async bytes=>{compressions++;return gzip(bytes);}});
 const results=await Promise.all(Array.from({length:12},()=>reader.read(file,true)));assert.equal(reads,1);assert.equal(compressions,1);assert.ok(results.every(r=>r.encoding==='gzip'));
 const identity=await reader.read(file,false);assert.equal(reads,1);assert.deepEqual(identity.body,readFileSync(file));
 writeFileSync(file,'updated '.repeat(400));const updated=await reader.read(file,true);assert.equal(reads,2);assert.deepEqual(gunzipSync(updated.body),readFileSync(file));
});

test('static cache bounds retained bytes and does not waste compression on small data',async t=>{
 assert.equal(typeof module.createStaticAssetReader,'function');const dir=directory(t);let reads=0,compressions=0;
 const reader=module.createStaticAssetReader({maxCacheBytes:300,readFile:async file=>{reads++;return readFile(file);},compress:async bytes=>{compressions++;return gzip(bytes);}});
 const a=join(dir,'a.css'),b=join(dir,'b.css');writeFileSync(a,'a'.repeat(200));writeFileSync(b,'b'.repeat(200));
 assert.equal((await reader.read(a,true)).encoding,undefined);await reader.read(b,true);await reader.read(a,true);assert.equal(reads,3,'The first file must be evicted when both exceed the byte budget');assert.equal(compressions,0);
});

test('gzip negotiation honors explicit refusal, wildcard quality and case',()=>{
 assert.equal(typeof module.acceptsGzip,'function');
 for(const value of ['gzip','GZIP;Q=0.5','gzip ; q=0.5','br, gzip;q=0.8','*;q=0.2'])assert.equal(module.acceptsGzip(value),true,value);
 for(const value of [undefined,'','gzip;q=0','gzip;q=0, *;q=1','br','*;q=0','gzip;q=invalid','gzip;q=2'])assert.equal(module.acceptsGzip(value),false,value);
});


test('a slow old static read cannot replace the cache entry of a newer file',async t=>{
 assert.equal(typeof module.createStaticAssetReader,'function');const dir=directory(t),file=join(dir,'changing.js');writeFileSync(file,'old bytes');let reads=0,started,release;
 const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 const reader=module.createStaticAssetReader({readFile:async path=>{reads++;const bytes=await readFile(path);if(reads===1){started();await gate;}return bytes;}});
 const old=reader.read(file,false);await began;writeFileSync(file,'new bytes of a different length');
 const current=await reader.read(file,false);release();await old;
 assert.deepEqual((await reader.read(file,false)).body,current.body);assert.equal(reads,2);
});

test('an optional compression failure serves the unchanged identity bytes',async t=>{
 assert.equal(typeof module.createStaticAssetReader,'function');const dir=directory(t),file=join(dir,'fallback.js');writeFileSync(file,'fallback '.repeat(300));let calls=0;
 const reader=module.createStaticAssetReader({compress:async()=>{calls++;throw Error('Synthetic compression failure');}});
 for(let i=0;i<2;i++){const result=await reader.read(file,true);assert.equal(result.encoding,undefined);assert.deepEqual(result.body,readFileSync(file));}assert.equal(calls,1);
});


test('static cache includes compressed buffers in its retained byte budget',async t=>{
 const dir=directory(t),a=join(dir,'large-a.css'),b=join(dir,'large-b.css');writeFileSync(a,'a'.repeat(2000));writeFileSync(b,'b'.repeat(2000));let reads=0;
 const reader=module.createStaticAssetReader({maxCacheBytes:4000,readFile:async path=>{reads++;return readFile(path);}});
 await reader.read(a,true);await reader.read(b,true);await reader.read(a,false);assert.equal(reads,3);
});

test('static cache caps empty metadata entries and stops serving deleted files',async t=>{
 const dir=directory(t);let reads=0;const reader=module.createStaticAssetReader({readFile:async path=>{reads++;return readFile(path);}});
 for(let i=0;i<129;i++){const file=join(dir,i+'.css');writeFileSync(file,'');await reader.read(file,false);}
 const first=join(dir,'0.css');await reader.read(first,false);assert.equal(reads,130);
 unlinkSync(first);await assert.rejects(reader.read(first,false),{code:'ENOENT'});
});
