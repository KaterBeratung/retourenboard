import test from 'node:test';
import assert from 'node:assert/strict';

const savedDocument=globalThis.document,savedWindow=globalThis.window;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null}),documentElement:{lang:'de',dataset:{},style:{}}};
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
let site;
try {site=await import('../website/dist/site.js');}
finally {globalThis.document=savedDocument;globalThis.window=savedWindow;}

const release=version=>({tag_name:'v'+version,draft:false,prerelease:false,assets:[{name:`retourenboard-install-${version}.sh`},{name:`retourenboard-linux-${version}.tar.gz`}]});
test('downloads select the current release asset, including existing versioned filenames',()=>{
 assert.equal(typeof site.selectReleaseDownload,'function');
 assert.equal(site.selectReleaseDownload(release('3.2.12'),'installer').url,'https://github.com/KaterBeratung/retourenboard/releases/download/v3.2.12/retourenboard-install-3.2.12.sh');
 assert.equal(site.selectReleaseDownload(release('3.2.19'),'archive').url,'https://github.com/KaterBeratung/retourenboard/releases/download/v3.2.19/retourenboard-linux-3.2.19.tar.gz');
 const stable={...release('3.2.20'),assets:[{name:'retourenboard-linux.tar.gz'}]};
 assert.equal(site.selectReleaseDownload(stable,'archive').url,'https://github.com/KaterBeratung/retourenboard/releases/download/v3.2.20/retourenboard-linux.tar.gz');
});
test('download selection rejects missing assets, unpublished releases and foreign filenames',()=>{
 assert.equal(typeof site.selectReleaseDownload,'function');
 for(const value of [null,{...release('3.2.19'),draft:true},{...release('3.2.19'),prerelease:true},{...release('3.2.19'),tag_name:'../../foreign'}, {...release('3.2.19'),assets:[{name:'retourenboard-install-3.2.12.sh'}]}]) assert.throws(()=>site.selectReleaseDownload(value,'installer'));
});
test('each click asks for latest metadata again; GitHub failures do not yield a stale download',async()=>{
 assert.equal(typeof site.resolveLatestDownload,'function');
 let version='3.2.12';const calls=[];
 const request=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>release(version)};};
 assert.equal((await site.resolveLatestDownload('installer',request)).version,'3.2.12');
 version='3.2.19';assert.equal((await site.resolveLatestDownload('archive',request)).version,'3.2.19');
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url==='https://api.github.com/repos/KaterBeratung/retourenboard/releases/latest'&&c.options.cache==='no-store'));
 await assert.rejects(site.resolveLatestDownload('installer',async()=>({ok:false,status:403})));
});
test('duplicate clicks start one download, and a failed lookup opens the latest release page',async()=>{
 assert.equal(typeof site.createReleaseDownload,'function');
 let finish,calls=0;const navigations=[],states=[];
 const download=site.createReleaseDownload({resolve:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},navigate:url=>navigations.push(url),update:state=>states.push(state)});
 const first=download('installer');await download('archive');assert.equal(calls,1);
 finish({url:'https://github.com/KaterBeratung/retourenboard/releases/download/v3.2.19/retourenboard-install-3.2.19.sh'});await first;
 assert.equal(navigations.length,1);assert.equal(states.at(-1).busy,false);
 const fallback=site.createReleaseDownload({resolve:async()=>{throw new Error('Rate limited');},navigate:url=>navigations.push(url),update:()=>{}});
 await fallback('archive');assert.equal(navigations.at(-1),'https://github.com/KaterBeratung/retourenboard/releases/latest');
});
