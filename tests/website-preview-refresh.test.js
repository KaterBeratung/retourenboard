import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('running website preview serves rebuilt pages and images without a restart',async t=>{
 const temporaryRoot=resolve(tmpdir()),work=mkdtempSync(join(temporaryRoot,'retourenboard-website-refresh-'));
 assert.ok(work.startsWith(join(temporaryRoot,'retourenboard-website-refresh-')));
 let server;
 t.after(async()=>{if(server)await new Promise(done=>{server.close(done);server.closeAllConnections();});rmSync(work,{recursive:true,force:true});});
 const built=join(work,'website','dist');mkdirSync(join(built,'assets'),{recursive:true});mkdirSync(join(work,'scripts'));
 copyFileSync(new URL('../scripts/website-preview.mjs',import.meta.url),join(work,'scripts','website-preview.mjs'));
 for(const file of ['index.html','site.css','site.js','favicon.svg','kofi.avif','datenschutz.html','impressum.html'])writeFileSync(join(built,file),file==='index.html'?'<h1>Previous build</h1>':file);
 writeFileSync(join(built,'assets','asset-manifest.json'),JSON.stringify(['overview-dark-de.webp']));
 const image=join(built,'assets','overview-dark-de.webp'),before=readFileSync(new URL('../website/src/assets/overview-dark-de.webp',import.meta.url)),after=readFileSync(new URL('../website/src/assets/returns-light-en.webp',import.meta.url));
 assert.notDeepEqual(before,after);writeFileSync(image,before);
 const {createWebsiteServer}=await import(pathToFileURL(join(work,'scripts','website-preview.mjs')).href);
 server=createWebsiteServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${server.address().port}`;
 assert.deepEqual(Buffer.from(await (await fetch(base+'/assets/overview-dark-de.webp')).arrayBuffer()),before);
 writeFileSync(join(built,'index.html'),'<h1>Current build</h1>');writeFileSync(image,after);
 assert.equal(await (await fetch(base+'/')).text(),'<h1>Current build</h1>');
 const response=await fetch(base+'/assets/overview-dark-de.webp');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),after);
 const head=await fetch(base+'/assets/overview-dark-de.webp',{method:'HEAD'});assert.equal(Number(head.headers.get('content-length')),after.length);assert.equal(await head.text(),'');
 unlinkSync(image);assert.equal((await fetch(base+'/assets/overview-dark-de.webp')).status,404);assert.equal((await fetch(base+'/')).status,200);
 writeFileSync(image,before);assert.deepEqual(Buffer.from(await (await fetch(base+'/assets/overview-dark-de.webp')).arrayBuffer()),before);
});
