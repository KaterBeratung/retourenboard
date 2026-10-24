import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCsv,inferCsvKind,guessCsvMapping} from '../dist/shared/csv.js';
import {RETURN_IMPORT_COLUMNS} from '../dist/shared/model.js';
import {html,t,setText,setLanguage,addTranslations} from '../dist/public/i18n.js';
import {english} from '../frontend/src/i18n-catalog.js';
import {isInventoryText} from '../dist/shared/inventory-file.js';

test('choosing a manual type after automatic detection fails keeps the newly read CSV available for mapping',()=>{
  const source=readFileSync(new URL('../dist/public/import.js',import.meta.url),'utf8');
  const readStart=source.indexOf('    function useText('),readEnd=source.indexOf('    async function loadFile(',readStart);
  const typeStart=source.indexOf("    $('import-kind').onchange ="),typeEnd=source.indexOf("    $('update-existing').onchange",typeStart);
  assert.ok(readStart>=0&&readEnd>readStart&&typeStart>=0&&typeEnd>typeStart);
  const nodes={};
  function node(){return {value:'',dataset:{},classList:{remove(){}},querySelector:()=>node(),querySelectorAll:()=>[],closest:()=>node()};}
  const $=id=>nodes[id]??=(node());$('import-kind').value='auto';$('csv-delimiter').value='auto';
  const run=new Function('$','parseCsv','inferCsvKind','guessCsvMapping','html','t','setText','columns','isInventoryText',`
    let kind='products',text='',parsed=null,textDirty=false;
    const ctx={can:()=>true},allowed=['products','returns'],selectedProfile=()=>null,profileOptions=()=>{},clearPreview=()=>{},showError=error=>{$('import-error').textContent=error.message;};
    const h=value=>value;
    ${source.slice(readStart,readEnd)}
    ${source.slice(typeStart,typeEnd)}
    return {read:useText,choose(value){$('import-kind').value=value;$('import-kind').onchange({target:$('import-kind')});},get parsed(){return parsed;}};
  `)($,parseCsv,inferCsvKind,guessCsvMapping,html,t,setText,()=>RETURN_IMPORT_COLUMNS,isInventoryText);
  const csv='Art;Gerät;SN\nMANUAL;Model;SN-M';
  run.read(csv,'manual.csv');assert.match($('import-error').textContent,/automatisch/);
  run.choose('returns');
  assert.deepEqual(run.parsed.rows[0].values,['MANUAL','Model','SN-M']);
  assert.match($('mapping').innerHTML,/data-column="serialNumber"/);assert.equal($('preview-button').disabled,false);
});

test('import confirmation translates the counts of newly created dependencies in both languages',()=>{
  const source=readFileSync(new URL('../dist/public/import.js',import.meta.url),'utf8');
  const start=source.search(/const summary\s*=/),end=source.indexOf('\n',source.indexOf('ctx.toast(summary',start));
  assert.ok(start>=0&&end>start);
  const notify=new Function('t','result','ctx',source.slice(start,end));
  const messages=[],result={created:2,updated:0,skipped:0,productsCreated:1,masterdataCreated:7};
  addTranslations(english);
  try{
    setLanguage('en');notify(t,result,{toast:message=>messages.push(message)});
    assert.equal(messages[0],'Import complete: 2 new, 0 updated, 0 skipped. Also created: 1 products and 7 master data entries.');
    setLanguage('de');notify(t,result,{toast:message=>messages.push(message)});
    assert.match(messages[1],/Zusätzlich angelegt: 1 Produkte und 7 Stammdateneinträge\./);
  }finally{setLanguage('de');}
});
