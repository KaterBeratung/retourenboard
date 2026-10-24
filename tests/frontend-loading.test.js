import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../dist/',import.meta.url);
function graph(entry){const files=new Map(),pending=[new URL(entry,root)];while(pending.length){const url=pending.pop();if(files.has(url.href))continue;const text=readFileSync(url,'utf8');files.set(url.href,text);for(const item of text.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/g))pending.push(new URL(item[1],url));}return files;}
test('the regular workspace starts without downloading camera, PDF or OCR decoders',()=>{
 const modules=graph('public/app.js');for(const url of modules.keys())assert.doesNotMatch(url,/\/(?:scan-labels|barcode-image|pdf-serial-scan|serial-ocr)\.js$/,'Decoders belong to the explicit scan action');
 assert.ok([...modules.values()].reduce((sum,text)=>sum+Buffer.byteLength(text),0)<1000000,'Normal workspace JavaScript stays below 1 MB');
});
