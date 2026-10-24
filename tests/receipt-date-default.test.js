import test from 'node:test';
import assert from 'node:assert/strict';
import * as forms from '../dist/public/forms.js';
test('new return dates use the current calendar day in the configured timezone',()=>{
 assert.equal(typeof forms.defaultReceiptDate,'function');
 for(const [instant,zone,want] of [['2026-10-12T22:30:00Z','Europe/Berlin','2026-10-13'],['2026-10-12T00:30:00Z','America/Los_Angeles','2026-10-11'],['2026-03-29T01:30:00Z','Europe/Berlin','2026-03-29']])assert.equal(forms.defaultReceiptDate({},zone,Date.parse(instant)),want);
});
test('editing preserves old or empty dates and explicit new dates remain unchanged',()=>{
 assert.equal(typeof forms.defaultReceiptDate,'function');const now=Date.parse('2026-10-12T22:30:00Z');
 assert.equal(forms.defaultReceiptDate({id:1,receiptDate:'2024-01-01'},'Europe/Berlin',now),'2024-01-01');
 assert.equal(forms.defaultReceiptDate({id:1,receiptDate:''},'Europe/Berlin',now),'');
 assert.equal(forms.defaultReceiptDate({id:1},'Europe/Berlin',now),'');
 assert.equal(forms.defaultReceiptDate({receiptDate:'2026-10-01'},'Europe/Berlin',now),'2026-10-01');
});
