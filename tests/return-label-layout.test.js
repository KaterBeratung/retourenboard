import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReturnLabelDocument} from '../dist/public/scan-labels.js';
import {setLanguage} from '../dist/public/i18n.js';

const row={id:7,returnNumber:'RET-2026-000007',productName:'Testgerät',sku:'SKU-7',serialNumber:'00ABC123',replacementSerialNumber:'00004567',customerReference:'REF-001',receiptDate:'2026-10-13',createdAt:'2026-10-13T10:30:00.000Z',status:'In Prüfung',reason:'Defekt',condition:'Ungeprüft',resolution:'Austausch',nextStep:'Neues Gerät prüfen',qrDataUrl:'data:image/png;base64,aGVsbG8='};
test('A4 label includes original and replacement identifiers and useful processing information',()=>{
 const output=String(renderReturnLabelDocument(row));
 assert.match(output,/data-label-size="a4"/);assert.match(output,/00004567/);assert.match(output,/SKU-7/);
 assert.match(output,/Austauschseriennummer/);assert.match(output,/In Prüfung/);assert.match(output,/Neues Gerät prüfen/);
 assert.doesNotMatch(output,/value="[^"\n]*(?:style|onerror)=/);
});
test('label formats are selected from the supported physical sizes and invalid format falls back to A4',()=>{
 for(const size of ['a4','103x164','62x29','auto'])assert.match(String(renderReturnLabelDocument(row,{size})),new RegExp(`data-label-size="${size}"`));
 for(const size of ['other','62x29" onmouseover="x',null])assert.match(String(renderReturnLabelDocument(row,{size})),/data-label-size="a4"/);
 const output=String(renderReturnLabelDocument(row));assert.match(output,/103 × 164 mm/);assert.match(output,/62 × 29 mm/);assert.match(output,/A4/);assert.match(output,/Allgemeines Drucklayout/);
});
test('replacement identifier is optional, preserved exactly, and record content is escaped',()=>{
 assert.doesNotMatch(String(renderReturnLabelDocument({...row,replacementSerialNumber:''})),/data-label-field="replacement"/);
 const output=String(renderReturnLabelDocument({...row,replacementSerialNumber:'<img src=x onerror="x">',nextStep:'<script>alert(1)</script>'}));
 assert.match(output,/&lt;img/);assert.match(output,/&lt;script/);assert.doesNotMatch(output,/<script|<img src=x/);
});
test('label size and replacement identifier labels translate while values retain leading zeroes',t=>{
 setLanguage('en');t.after(()=>setLanguage('de'));
 const output=String(renderReturnLabelDocument(row,{size:'62x29'}));assert.match(output,/Label size/);assert.match(output,/Replacement serial number/);assert.match(output,/00004567/);assert.match(output,/lang="en"/);
 assert.match(String(renderReturnLabelDocument(row,{size:'a4'})),/Receipt &amp; processing/);
});
