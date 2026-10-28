import test from 'node:test';
import assert from 'node:assert/strict';
import {returnDetailContent} from '../dist/public/inventory-display.js';
import {setLanguage} from '../dist/public/i18n.js';
test('return detail puts the real next step before reference fields and identifies the responsible person',()=>{
 const markup=String(returnDetailContent({}, {id:1,productName:'Device',nextStep:'Call <supplier>',assignedDisplayName:'Person A',statusTone:'working'}));
 assert.match(markup,/return-guidance/);assert.ok(markup.indexOf('Call &lt;supplier&gt;')<markup.indexOf('Gerät &amp; Zuordnung'));assert.ok(markup.includes('Person A'));assert.ok(!markup.includes('Call <supplier>'));
});
test('closed returns do not keep an old open next step as their current guidance',()=>{
 const markup=String(returnDetailContent({}, {id:1,productName:'Device',nextStep:'OLD TASK',isClosed:true,statusTone:'done'}));
 const guidance=markup.match(/<section[^>]*return-guidance[\s\S]*?<\/section>/)?.[0];assert.ok(guidance);assert.ok(!guidance.includes('OLD TASK'));assert.match(guidance,/abgeschlossen/i);
});
test('unknown statuses give neutral guidance in both languages without fabricating a phase',()=>{try{for(const language of ['de','en']){setLanguage(language);const markup=String(returnDetailContent({}, {id:1,productName:'Device',status:'Custom state',statusTone:'neutral'}));assert.ok(markup.includes(language==='de'?'Nächsten Schritt festlegen':'Set the next step'));}}finally{setLanguage('de');}});
