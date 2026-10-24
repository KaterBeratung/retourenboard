import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const root='backend/src/server';
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):/\.(?:ts|js)$/.test(e.name)?[join(dir,e.name)]:[]);}
test('SQLite connections and SQL stay confined to the explicit legacy transfer boundary',()=>{
 for(const file of files(root)){if(file.includes('legacy-sqlite')||file.replaceAll('\\','/').endsWith('/migration/legacy-transfer.ts'))continue;const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/node:sqlite|new\s+DatabaseSync|\bPRAGMA\s+|\.prepare\(\s*['"`]/,file);}
});
test('authorization promises are awaited at the known application and updater boundaries',()=>{
 for(const file of ['app.js','in-app-updater.ts','account-settings.ts','collaboration-routes.ts','attachment-routes.ts']){
  const path=join(root,file);let source;try{source=readFileSync(path,'utf8');}catch{continue;}
  // Exclude declarations and returned promises; direct guards must await.
  for(const match of source.matchAll(/\b(?:requireAdmin|requireSession|requireAdministration|owner)\(\)/g)){
   const before=source.slice(Math.max(0,match.index-30),match.index);if(/(?:function|async)\s*$/.test(before))continue;
   assert.match(before,/(?:await|return)\s*$/,path+': '+match[0]);
  }
 }
});
