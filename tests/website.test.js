import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWebsiteServer} from '../scripts/website-preview.mjs';

test('website preview serves only built marketing assets and never application data',async t=>{
 const server=createWebsiteServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);assert.match(response.headers.get('content-security-policy'),/connect-src https:\/\/api\.github\.com;/);
 const html=await response.text();assert.match(html,/Retouren rein/);assert.match(html,/Beispieldaten/);assert.match(html,new RegExp('Version '+JSON.parse(readFileSync('package.json','utf8')).version.replaceAll('.','\\.')));
 assert.doesNotMatch(html,/@@VERSION@@|localhost:3000|RetourenboardDemo2026/);
 for(const path of ['/site.css','/site.js','/favicon.svg','/kofi.avif']){const asset=await fetch(base+path);assert.equal(asset.status,200);assert.equal(asset.headers.get('x-content-type-options'),'nosniff');}
 for(const path of ['/datenschutz.html','/impressum.html']){
  const page=await fetch(base+path);assert.equal(page.status,200,path);const content=await page.text();
  assert.match(page.headers.get('content-type'),/text\/html/);assert.match(content,/Datenschutz|Impressum/);assert.doesNotMatch(content,/@{2}[A-Z_]+@{2}/);
 }
 for(const path of ['/assets/returns-studio.webp','/assets/overview-dark-de.webp','/assets/team-light-en.webp']){
  const asset=await fetch(base+path);assert.equal(asset.status,200,path);assert.equal(asset.headers.get('content-type'),'image/webp');
  const bytes=Buffer.from(await asset.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  const head=await fetch(base+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes.length);assert.equal(await head.text(),'');
 }
 for(const path of ['/assets/asset-manifest.json','/assets/../../.env','/assets/%2e%2e%2f%2e%2e%2f.env','/assets/unknown.webp'])assert.equal((await fetch(base+path)).status,404,path);
 for(const path of ['/api/session','/.env','/data/retouren.sqlite','/%2e%2e%2f.env','/server/app.js','/README.md'])assert.equal((await fetch(base+path)).status,404,path);
 assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
 const head=await fetch(base+'/site.css',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});
