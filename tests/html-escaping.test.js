import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {scanSource,scanSinks,scanForbidden,isSafeExpression,summarizeUnreviewed,summarizeSinks} from './helpers/html-interpolations.js';

// Schutz gegen vergessenes Escaping im Frontend.
//
// `html`…`` escaped Interpolationen nicht selbst; Nutzerdaten gehören in `h(…)`.
// Alle Stellen, die dieser Test nicht als sicher beweisen kann (z. B. Werte, die nur
// durch ihren Typ sicher sind: IDs, Zähler), stehen in der Baseline
// tests/fixtures/html-interpolation-baseline.json. Neue Stellen lassen den Test
// fehlschlagen. Dann entweder `h(…)` ergänzen oder – nur wenn der Wert nachweislich
// kein Nutzertext ist – die Baseline aktualisieren:
//   UPDATE_HTML_BASELINE=1 node --test tests/html-escaping.test.js
// und die Änderung der Baseline im Review begründen.

const sourceDir=new URL('../frontend/src/',import.meta.url);
const baselineUrl=new URL('./fixtures/html-interpolation-baseline.json',import.meta.url);
const files=readdirSync(sourceDir).filter(name=>/\.(ts|js)$/.test(name)&&!name.endsWith('.d.ts')&&name!=='i18n-catalog.js').sort();
const sources=new Map(files.map(name=>[name,readFileSync(new URL(name,sourceDir),'utf8')]));

function current(){
 const interpolations=summarizeUnreviewed([...sources].flatMap(([name,src])=>scanSource(src,name)));
 const sinks=summarizeSinks([...sources].flatMap(([name,src])=>scanSinks(src,name)));
 return {interpolations,sinks};
}
function diff(expected,actual){
 const added=[],removed=[];
 for(const [key,count] of Object.entries(actual))if((expected[key]??0)<count)added.push(`${key}  (${expected[key]??0} → ${count})`);
 for(const [key,count] of Object.entries(expected))if((actual[key]??0)<count)removed.push(`${key}  (${count} → ${actual[key]??0})`);
 return {added,removed};
}
const advice='\nNeue Nutzerdaten in html`…` immer mit h(…) ausgeben. Ist der Wert nachweislich kein Text (ID, Zähler), die Baseline mit\n  UPDATE_HTML_BASELINE=1 node --test tests/html-escaping.test.js\naktualisieren und die Änderung begründen.';

test('html-Templates: keine neuen Interpolationen ohne Escaping oder Nachweis',()=>{
 const actual=current();
 if(process.env.UPDATE_HTML_BASELINE==='1'){
  writeFileSync(baselineUrl,JSON.stringify({
   hinweis:'Von Hand nicht bearbeiten. Stellen, die html-escaping.test.js nicht als sicher beweisen kann (Typ-Sicherheit, Hilfsfunktionen). Schlüssel: Datei|Template-Art|Ausdruck bzw. Datei|Senke|Wert.',
   interpolations:actual.interpolations,sinks:actual.sinks
  },null,1)+'\n');
  return;
 }
 const baseline=JSON.parse(readFileSync(baselineUrl,'utf8'));
 const {added,removed}=diff(baseline.interpolations,actual.interpolations);
 assert.deepEqual(added,[],'Neue Interpolationen ohne nachweisliches Escaping:\n'+added.join('\n')+advice);
 assert.deepEqual(removed,[],'Baseline enthält erledigte Stellen. Bitte aktualisieren, damit sie nicht als Freibrief für spätere Rückfälle dienen:\n'+removed.join('\n')+advice);
});

test('innerHTML, outerHTML und insertAdjacentHTML: keine neuen Zuweisungen ohne Prüfung',()=>{
 if(process.env.UPDATE_HTML_BASELINE==='1')return;
 const baseline=JSON.parse(readFileSync(baselineUrl,'utf8'));
 const {added,removed}=diff(baseline.sinks,current().sinks);
 assert.deepEqual(added,[],'Neue Markup-Zuweisungen, deren Wert nicht offensichtlich aus html`…`/h(…) stammt:\n'+added.join('\n')+advice);
 assert.deepEqual(removed,[],'Baseline enthält erledigte Zuweisungen:\n'+removed.join('\n')+advice);
});

test('Frontend enthält keine verbotenen Muster für Skript- oder Markup-Einschleusung',()=>{
 const hits=[...sources].flatMap(([name,src])=>scanForbidden(src,name));
 assert.deepEqual(hits.map(hit=>`${hit.file}:${hit.line} ${hit.label}`),[],'Verbotene Muster gefunden');
});

test('Scanner erkennt ungeschützte Nutzerdaten und akzeptiert geschützte Ausgabe',()=>{
 const raw=scanSource('const a=html`<p>${user.name}</p>`;','a.ts');
 assert.deepEqual(raw.map(item=>item.expr),['user.name']);
 assert.deepEqual(Object.keys(summarizeUnreviewed(raw)),['a.ts|html|user.name']);
 const safe=scanSource('const a=html`<p>${h(user.name)}</p><b>${icon(\'x\')}</b>${rows.map(r=>html`<i>${h(r.n)}</i>`).join(\'\')}${ok?html`<u></u>`:\'\'}${t(\'Text\')}${rows.length}`;','b.ts');
 assert.equal(safe.length,7);
 assert.deepEqual(summarizeUnreviewed(safe),{});
});

test('Einstufung: bedingte Zweige und Verknüpfungen werden einzeln bewertet',()=>{
 for(const expr of ["cond?html`<b></b>`:''","cond&&html`<b></b>`","''||h(b)","x?h(y):h(z)","list.map(i=>html`<li>${h(i)}</li>`).join('')","(count)","42","''","t('Text')","html`<b></b>`","rows.length"])
  assert.equal(isSafeExpression(expr),true,expr);
 for(const expr of ['user.name',"cond?user.name:''","cond?html`<b></b>`:user.note","a||user.name","a||h(b)","cond&&user.name","list.map(i=>i.name).join('')","render(user)","user.name+h(x)","h(a)+user.name","t(label)","list.map(i=>`<li>${i.name}</li>`).join('')"])
  assert.equal(isSafeExpression(expr),false,expr);
});

test('Scanner erkennt Zuweisungen und verbotene Muster',()=>{
 assert.deepEqual(scanSinks("el.innerHTML=user.bio;","c.ts"),[{file:'c.ts',sink:'innerHTML',rhs:'user.bio'}]);
 assert.deepEqual(scanSinks("el.innerHTML=html`<p></p>`;el.innerHTML='';el.insertAdjacentHTML('beforeend',h(x));","c.ts"),[]);
 assert.equal(scanSinks("el.insertAdjacentHTML('beforeend',user.markup);","c.ts").length,1);
 for(const bad of ['document.write(x)','eval(code)','new Function("x")','frame.srcdoc=html','const m=html`<a href=${url}>`','html`<${tag}>`','html`<a onclick="x()">`','a.href="javascript:alert(1)"'])
  assert.ok(scanForbidden(bad,'d.ts').length>0,bad);
 assert.deepEqual(scanForbidden("el.addEventListener('click',()=>x());const m=html`<a href=\"${h(url)}\">`;// eval(old)","d.ts"),[]);
});

test('Scanner kommt mit Regex-Literalen, Zeichenketten und verschachtelten Templates zurecht',()=>{
 const src='const r=/`${x}/g;const s="`${y}`";const a=html`<p>${list.map(i=>html`<i>${i.n}</i>`).join(\'\')}</p>`;';
 assert.deepEqual(scanSource(src,'e.ts').map(item=>item.expr).sort(),["i.n","list.map(i=>html`<i>${i.n}</i>`).join('')"].sort());
});
