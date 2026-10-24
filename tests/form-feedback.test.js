import test from 'node:test';
import assert from 'node:assert/strict';

const feedbackUrl=process.env.FORM_FEEDBACK_MODULE || new URL('../dist/public/form-feedback.js',import.meta.url).href;
const feedback = await import(feedbackUrl).catch(() => ({}));
const i18n=await import(new URL('./i18n.js',feedbackUrl).href);

// Browser mechanics are the boundary here. The production controller creates
// the feedback, decides which input owns an error and preserves chosen values.
class Node {
  constructor(tag='div') { this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.dataset={};this.listeners={};this.hidden=false;this.isConnected=true;this._value='';this._text=''; }
  append(...nodes) { for(const node of nodes){node.parentElement=this;this.children.push(node);} }
  replaceChildren(...nodes) { this.children=[];this.append(...nodes);if(this.tagName==='SELECT')this._value=String(nodes.find(n=>n.selected)?.value??nodes[0]?.value??''); }
  get options() { return this.children; }
  get selectedOptions() { return this.children.filter(n=>n.value===this.value); }
  get value() { return this._value; }
  set value(value) { this._value=String(value); }
  set textContent(value) { this._text=String(value);this.children=[]; }
  get textContent() { return this._text+this.children.map(n=>n.textContent).join(''); }
  setAttribute(name,value) { this.attrs[name]=String(value); }
  getAttribute(name) { return this.attrs[name]??null; }
  removeAttribute(name) { delete this.attrs[name]; }
  addEventListener(type,listener) { (this.listeners[type]??=[]).push(listener); }
  fire(type,event={}) { for(const listener of this.listeners[type]??[])listener({target:this,preventDefault(){},...event}); }
  matches(selector) {
    if(selector.includes(','))return selector.split(',').some(s=>this.matches(s.trim()));
    if(selector[0]==='.')return String(this.className??'').split(/\s+/).includes(selector.slice(1));
    if(selector[0]==='#')return this.id===selector.slice(1);
    const attr=selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
    if(attr){const value=attr[1]==='name'?this.name:attr[1].startsWith('data-')?this.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:this.getAttribute(attr[1]);return attr[2]===undefined?value!==undefined&&value!==null:String(value)===attr[2];}
    return this.tagName===selector.toUpperCase();
  }
  closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector)??null; }
  querySelectorAll(selector) { return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]??null; }
  focus() { this.focused=true; }
  scrollIntoView() { this.scrolled=true; }
}
function fixture(t,fields) {
  const original=globalThis.document;
  const document={createElement:tag=>new Node(tag)};
  globalThis.document=document;
  t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
  const form=new Node('form');form.ownerDocument=document;form.dataset.dirty='true';
  const controls={};
  for(const [name,value]of Object.entries(fields)){
    const label=new Node('label');label.className='field';
    const control=new Node(name==='assignedUserId'?'select':'input');control.name=name;control.value=value;control.validity={valid:true};
    label.append(control);form.append(label);controls[name]=control;
  }
  return {form,controls,document};
}
const invalid=(control)=>({target:control,preventDefault(){this.prevented=true;}});
function requireController(){assert.equal(typeof feedback.bindFormFeedback,'function');return feedback.bindFormFeedback;}

test('duplicate serial advisory normalizes case and surrounding whitespace, excludes the edited record and ignores empty or opaque values',()=>{
  assert.equal(typeof feedback.duplicateSerials,'function');
  const rows=[{id:1,serialNumber:' SN-42 '},{id:2,serialNumber:'sn-42'},{id:3,serialNumber:'SN-420'},null,{id:4,serialNumber:{toString(){throw Error('opaque value');}}}];
  assert.deepEqual(feedback.duplicateSerials(rows,' Sn-42 ','1').map(row=>row.id),[2]);
  assert.deepEqual(feedback.duplicateSerials(rows,'   '),[]);
  assert.deepEqual(feedback.duplicateSerials(rows,{toString(){throw Error('opaque value');}}),[]);
  assert.equal(rows[0].serialNumber,' SN-42 ');
});

test('serial warnings show existing return reference and status as plain text and clear after the input changes without blocking a repeated return',t=>{
  const bind=requireController(),d=fixture(t,{serialNumber:'SN-42',productId:'8',replacementSerialNumber:'SN-42'});
  const existing={id:17,serialNumber:'sn-42',returnNumber:'<img onerror=alert(1)>',customerReference:'Aktiv',status:'Abgeschlossen',productId:9,productName:'<b>Gerät</b>'};
  bind(d.form,{kind:'returns',returns:[existing],itemId:18});
  const advice=d.form.querySelector('.field-advisory');
  assert.equal(advice.hidden,false);
  assert.ok(advice.textContent.includes('<img onerror=alert(1)>'));
  assert.ok(advice.textContent.includes('Aktiv'));
  assert.ok(advice.textContent.includes('Abgeschlossen'));
  assert.equal(advice.querySelector('a').href,'#returns?detail=17');
  assert.equal(d.controls.serialNumber.getAttribute('aria-invalid'),null);
  assert.equal(d.controls.serialNumber.validity.valid,true);
  assert.equal(d.controls.replacementSerialNumber.getAttribute('aria-invalid'),null);
  assert.equal(d.form.dataset.dirty,'true');
  d.controls.serialNumber.value='NEW';d.form.fire('input',{target:d.controls.serialNumber});
  assert.equal(advice.hidden,true);
  assert.equal(advice.textContent,'');
});
test('English feedback translates instructions and new-field errors while keeping stored reference, product and status data opaque',t=>{
  const bind=requireController();i18n.setLanguage('en');
  const d=fixture(t,{serialNumber:'SAME',nextStep:'Keep my text'});
  t.after(()=>i18n.setLanguage('de'));
  bind(d.form,{kind:'returns',returns:[{id:17,serialNumber:'same',returnNumber:'RET-17',customerReference:'Aktiv',productName:'Abgeschlossen',status:'In Prüfung'}]});
  const advice=d.form.querySelector('.field-advisory');
  assert.match(advice.textContent,/This serial number/);assert.match(advice.textContent,/Aktiv/);assert.match(advice.textContent,/Abgeschlossen/);assert.match(advice.textContent,/In Prüfung/);
  const controller=bind(d.form,{kind:'returns'});
  assert.equal(controller.showServerError('Nächster Schritt: maximal 500 Zeichen erlaubt.'),true);
  const inline=d.controls.nextStep.closest('.field').querySelector('.field-error');
  assert.equal(inline.textContent,'Next step: at most 500 characters are allowed.');assert.equal(d.controls.nextStep.value,'Keep my text');
});

test('product duplicate SKU advice excludes the edited product and leaves validation to the server',t=>{
  const bind=requireController(),d=fixture(t,{sku:'sku-1'});
  bind(d.form,{kind:'products',products:[{id:1,sku:'SKU-1',name:'First'},{id:2,sku:' sku-1 ',name:'Second'}],itemId:1});
  const advice=d.form.querySelector('.field-advisory');
  assert.equal(advice.hidden,false);assert.match(advice.textContent,/Second/);assert.doesNotMatch(advice.textContent,/First/);
  assert.equal(d.controls.sku.getAttribute('aria-invalid'),null);
  d.controls.sku.value='new';d.form.fire('input',{target:d.controls.sku});
  assert.equal(advice.hidden,true);
});

test('native validation adds inline feedback, keeps existing help references and focuses only the first invalid control',async t=>{
  const bind=requireController(),d=fixture(t,{name:'Typed product',sku:'',ean:'ABC'});
  d.controls.sku.setAttribute('aria-describedby','existing-help');
  d.controls.sku.validity={valid:false,valueMissing:true};
  d.controls.ean.validity={valid:false,patternMismatch:true};
  bind(d.form,{kind:'products'});
  const first=invalid(d.controls.sku);d.form.fire('invalid',first);d.form.fire('invalid',invalid(d.controls.ean));
  await Promise.resolve();
  assert.equal(d.controls.sku.getAttribute('aria-invalid'),'true');
  assert.match(d.controls.sku.getAttribute('aria-describedby'),/existing-help/);
  assert.equal(d.controls.sku.focused,true);assert.equal(d.controls.sku.scrolled,true);assert.equal(d.controls.ean.focused,undefined);
  assert.equal(d.controls.name.value,'Typed product');assert.equal(d.form.dataset.dirty,'true');
  const inline=d.controls.sku.closest('.field').querySelector('.field-error');assert.equal(inline.hidden,false);assert.ok(inline.textContent);
  d.controls.sku.value='NEW';d.controls.sku.validity={valid:true};d.form.fire('input',{target:d.controls.sku});
  assert.equal(inline.hidden,true);assert.equal(d.controls.sku.getAttribute('aria-invalid'),null);
  assert.equal(d.controls.sku.getAttribute('aria-describedby'),'existing-help');
});

test('only explicit known server validation messages attach to a field; ambiguous and unknown errors stay general',t=>{
  const bind=requireController(),d=fixture(t,{sku:'EXISTING',ean:'abc',price:'12,00'});
  const controller=bind(d.form,{kind:'products'});
  assert.equal(controller.showServerError('EAN muss 8, 12, 13 oder 14 Ziffern enthalten.'),true);
  assert.equal(d.controls.ean.getAttribute('aria-invalid'),'true');assert.equal(d.controls.ean.value,'abc');
  controller.clearErrors();
  assert.equal(controller.showServerError('Artikelnummer oder Retourennummer ist bereits vorhanden.'),true);
  assert.equal(d.controls.sku.getAttribute('aria-invalid'),'true');
  controller.clearErrors();
  assert.equal(controller.showServerError('Netzwerkfehler bei Artikelnummer EXISTING'),false);
  assert.equal(d.controls.sku.getAttribute('aria-invalid'),null);
  const returns=fixture(t,{serialNumber:'SN',productId:'1'});
  const returnFeedback=bind(returns.form,{kind:'returns'});
  assert.equal(returnFeedback.showServerError('Artikelnummer oder Retourennummer ist bereits vorhanden.'),false);
  assert.equal(returnFeedback.showServerError('Produkt und Menge müssen gültige ganze Zahlen sein.'),false);
  assert.equal(returnFeedback.showServerError('Seriennummer ist erforderlich.'),true);
  assert.equal(returns.controls.serialNumber.getAttribute('aria-invalid'),'true');
});
test('return rules and account assignment errors point to their explicit fields',t=>{
  const bind=requireController(),d=fixture(t,{supplierId:'',assignedUserId:'7',nextStep:'Typed next step'});
  const controller=bind(d.form,{kind:'returns'});
  assert.equal(controller.showServerError('Lieferant ist laut Retourenregeln erforderlich.'),true);
  assert.equal(d.controls.supplierId.getAttribute('aria-invalid'),'true');controller.clearErrors();
  assert.equal(controller.showServerError('Nur aktive Konten können neu zugeordnet werden.'),true);
  assert.equal(d.controls.assignedUserId.getAttribute('aria-invalid'),'true');controller.clearErrors();
  assert.equal(controller.showServerError('Nächster Schritt: maximal 500 Zeichen erlaubt.'),true);
  assert.equal(d.controls.nextStep.getAttribute('aria-invalid'),'true');assert.equal(d.controls.nextStep.value,'Typed next step');
});

function initialAssignee(d,id,label) {
  const blank=d.document.createElement('option');blank.value='';
  const selected=d.document.createElement('option');selected.value=String(id);selected.textContent=label;selected.selected=true;
  d.controls.assignedUserId.replaceChildren(blank,selected);
  const hint=d.document.createElement('small');hint.dataset.assigneeHelp='';d.controls.assignedUserId.closest('.field').append(hint);
  return hint;
}

test('assignee loading preserves a changed selection, typed next step and dirty state; unavailable historical assignment remains selectable',async t=>{
  assert.equal(typeof feedback.bindReturnAssignees,'function');
  const d=fixture(t,{assignedUserId:'7',nextStep:'Typed note'});initialAssignee(d,7,'Historical person');
  let finish;const ctx={session:{user:{id:1}},authGeneration:2,api:async path=>{assert.equal(path,'/api/returns/assignees');return new Promise(resolve=>finish=resolve);}};
  const pending=feedback.bindReturnAssignees(d.form,ctx,{assignedUserId:7,assignedDisplayName:'Historical person'});
  d.controls.assignedUserId.value='';
  finish([{id:9,username:'active',displayName:'Active person'}]);await pending;
  assert.equal(d.controls.assignedUserId.value,'');assert.equal(d.controls.nextStep.value,'Typed note');assert.equal(d.form.dataset.dirty,'true');
  assert.ok(d.controls.assignedUserId.options.some(option=>option.value==='7'&&option.textContent.includes('Historical person')));
  assert.ok(d.controls.assignedUserId.options.some(option=>option.value==='9'&&option.textContent.includes('Active person')));
});

test('cached assignees avoid another request, failed loading keeps the historical value and late account responses do not alter the form',async t=>{
  assert.equal(typeof feedback.bindReturnAssignees,'function');
  const d=fixture(t,{assignedUserId:'7',nextStep:'Keep this'});const hint=initialAssignee(d,7,'Historic');
  await feedback.bindReturnAssignees(d.form,{returnAssignees:[{id:9,username:'new',displayName:'New'}],api(){throw Error('unexpected network');}},{assignedUserId:7,assignedDisplayName:'Historic'});
  assert.equal(d.controls.assignedUserId.value,'7');
  await feedback.bindReturnAssignees(d.form,{api:async()=>{throw Error('offline');}},{assignedUserId:7,assignedDisplayName:'Historic'});
  assert.equal(d.controls.assignedUserId.value,'7');assert.equal(d.controls.nextStep.value,'Keep this');assert.ok(hint.textContent);
  let finish;const ctx={session:{user:{id:1}},authGeneration:1,api:()=>new Promise(resolve=>finish=resolve)};
  const before=d.controls.assignedUserId.options.map(option=>option.value);
  const pending=feedback.bindReturnAssignees(d.form,ctx,{assignedUserId:7,assignedDisplayName:'Historic'});ctx.authGeneration=2;
  finish([{id:11,username:'late',displayName:'Late'}]);await pending;
  assert.deepEqual(d.controls.assignedUserId.options.map(option=>option.value),before);
});
