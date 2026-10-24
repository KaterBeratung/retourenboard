import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const picker=await sourceModule("export * from './frontend/src/product-picker.ts'; export {setLanguage} from './frontend/src/i18n.js'; import {addTranslations} from './frontend/src/i18n.js'; import {english} from './frontend/src/i18n-catalog.js'; addTranslations(english);");
const {setLanguage}=picker;
const products=[
 {id:1,name:'Büro Kopfhörer',sku:'KH-001',ean:'0012345678905',active:true},
 {id:2,name:'Gaming Kopfhörer',sku:'KH-002',ean:'1234567890128',active:true},
 {id:3,name:'Archivierter Kopfhörer',sku:'OLD-001',ean:'0000000000000',active:false}
];
test('product search matches all terms across name, SKU and EAN while excluding archived choices',()=>{
 assert.equal(typeof picker.searchProducts,'function');
 assert.deepEqual(picker.searchProducts(products,'BURO kh-001').map(p=>p.id),[1]);
 assert.deepEqual(picker.searchProducts(products,'0012345678905').map(p=>p.id),[1]);
 assert.deepEqual(picker.searchProducts(products,'kopfhörer').map(p=>p.id),[1,2]);
 assert.deepEqual(picker.searchProducts(products,'old').map(p=>p.id),[]);
 assert.deepEqual(picker.searchProducts(products,'old',3).map(p=>p.id),[3]);
 assert.deepEqual(picker.searchProducts(products,'no match').map(p=>p.id),[]);
 assert.deepEqual(products.map(p=>p.id),[1,2,3]);
});
test('recent return product belongs to the current account and authentication generation',()=>{
 assert.equal(typeof picker.rememberProduct,'function');
 const ctx={session:{user:{id:7}},authGeneration:1};
 picker.rememberProduct(ctx,1);
 assert.equal(picker.recentProduct(ctx,products)?.id,1);
 assert.equal(picker.recentProduct(ctx,products.map(p=>({...p,active:false}))),null);
 ctx.authGeneration=2;
 assert.equal(picker.recentProduct(ctx,products),null);
 picker.rememberProduct(ctx,2);
 ctx.session.user.id=8;
 assert.equal(picker.recentProduct(ctx,products),null);
});

// Only the DOM boundary is represented here. Search, selection, validation,
// keyboard handling and submitted product ID are the production controller.
function attributes(tag){return Object.fromEntries([...tag.matchAll(/\s([\w-]+)="([^"]*)"/g)].map(([,name,value])=>[name,value]));}
function element(attrs={}){return {id:attrs.id??'',value:'',hidden:false,attrs:{...attrs},handlers:{},setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},addEventListener(k,fn){this.handlers[k]=fn;},focus(){this.focused=true;},setCustomValidity(v){this.validity=v;},dispatchEvent(){},scrollIntoView(){}};}
function dom(t,markup=String(picker.productPicker(products))){
 const input=element(attributes(markup.match(/<input\b[^>]*data-product-search\b[^>]*>/)[0])),select=element(),list=element(attributes(markup.match(/<div\b[^>]*data-product-list\b[^>]*>/)[0])),hint=element(),clear=element();
 select.value='';
 list.querySelectorAll=()=>[];
 const nodes={'[data-product-search]':input,'[name=productId]':select,'[data-product-list]':list,'[data-product-hint]':hint,'[data-product-clear]':clear};
 const root={querySelector:k=>nodes[k],contains:n=>Object.values(nodes).includes(n),handlers:{},addEventListener(k,fn){this.handlers[k]=fn;}};
 return {root,input,select,list,hint,clear};
}

test('simultaneous product pickers link each label and combobox to their own input and list',()=>{
 const markups=[String(picker.productPicker(products)),String(picker.productPicker(products,1,undefined,{optional:true}))];
 const inputs=markups.map(markup=>attributes(markup.match(/<input\b[^>]*data-product-search\b[^>]*>/)[0]));
 const lists=markups.map(markup=>attributes(markup.match(/<div\b[^>]*data-product-list\b[^>]*>/)[0]));
 for(const [index,markup]of markups.entries()){
  const label=attributes(markup.match(/<label\b[^>]*>/)[0]);
  assert.equal(inputs.find(input=>input.id===label.for),inputs[index],'A label must target its picker even when another picker precedes it');
  assert.equal(lists.find(list=>list.id===inputs[index]['aria-controls']),lists[index],'The combobox must control its own suggestions');
 }
 const ids=markups.flatMap(markup=>[...markup.matchAll(/\sid="([^"]*)"/g)].map(([,id])=>id));
 assert.equal(new Set(ids).size,ids.length,'Two mounted pickers must not render duplicate IDs');
});

test('simultaneous product pickers keep keyboard suggestions and active descendants within their own list',t=>{
 const background=dom(t),dialog=dom(t),chosen=[];
 picker.bindProductPicker(background.root,products,1);
 picker.bindProductPicker(dialog.root,products,undefined,p=>chosen.push(p?.id??null));
 background.input.handlers.focus();dialog.input.handlers.focus();
 background.input.handlers.keydown({key:'ArrowDown',preventDefault(){}});
 dialog.input.handlers.keydown({key:'ArrowUp',preventDefault(){}});
 const optionIds=d=>[...d.list.innerHTML.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>id);
 const backgroundIds=optionIds(background),dialogIds=optionIds(dialog);
 assert.equal(new Set([...backgroundIds,...dialogIds]).size,4,'The same products in different pickers need different option IDs');
 assert.equal(background.input.attrs['aria-activedescendant'],backgroundIds[0]);
 assert.equal(dialog.input.attrs['aria-activedescendant'],dialogIds[1]);
 assert.equal(backgroundIds.includes(dialog.input.attrs['aria-activedescendant']),false);
 dialog.input.handlers.keydown({key:'Enter',preventDefault(){}});
 assert.equal(dialog.select.value,'2');assert.equal(dialog.input.validity,'');
 assert.equal(dialog.input.attrs['aria-expanded'],'false');
 assert.equal(dialog.input.attrs['aria-activedescendant'],undefined);
 assert.equal(background.select.value,'1');assert.equal(background.input.attrs['aria-expanded'],'true');
 assert.deepEqual(chosen,[2]);
 dialog.input.handlers.keydown({key:'ArrowDown',preventDefault(){}});
 assert.equal(dialog.input.attrs['aria-activedescendant'],dialogIds[0],'Reopening keeps the IDs associated with this picker');
 dialog.input.handlers.keydown({key:'Tab'});
 assert.equal(dialog.input.attrs['aria-activedescendant'],undefined);
 assert.equal(dialog.list.hidden,true);
});
test('typing invalidates the old product ID and keyboard selection submits the matching product',t=>{
 assert.equal(typeof picker.bindProductPicker,'function');
 const d=dom(t),chosen=[];
 const control=picker.bindProductPicker(d.root,products,1,p=>chosen.push(p?.id??null));
 assert.equal(d.select.value,'1');
 d.input.value='KH-002';d.input.handlers.input();
 assert.equal(d.select.value,'');
 assert.ok(d.input.validity);
 d.input.handlers.keydown({key:'ArrowDown',preventDefault(){}});
 d.input.handlers.keydown({key:'Enter',preventDefault(){}});
 assert.equal(d.select.value,'2');
 assert.equal(d.input.validity,'');
 assert.equal(d.list.hidden,true);
 assert.deepEqual(chosen,[null,2]);
 control.choose(999);
 assert.equal(d.select.value,'2','Unknown IDs cannot replace a valid choice');
 d.clear.handlers.click();
 assert.equal(d.select.value,'');
 assert.equal(d.input.value,'');
});
test('Escape closes suggestions without cancelling the dialog and a refined query finds products beyond the first page',t=>{
 assert.equal(typeof picker.bindProductPicker,'function');
 const d=dom(t),many=Array.from({length:150},(_,i)=>({id:i+1,name:'Produkt '+i,sku:'SKU-'+i,active:true}));
 picker.bindProductPicker(d.root,many);
 d.input.handlers.focus();
 assert.equal(d.list.hidden,false);
 let prevented=false,stopped=false;
 d.input.handlers.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(d.list.hidden,true);assert.ok(prevented&&stopped);
 d.input.value='SKU-149';d.input.handlers.input();
 d.input.handlers.keydown({key:'ArrowDown',preventDefault(){}});
 d.input.handlers.keydown({key:'Enter',preventDefault(){}});
 assert.equal(d.select.value,'150');
});
test('English product lookup translates result counts and reuse controls while retaining product names',t=>{
 setLanguage('en');t.after(()=>setLanguage('de'));
 const d=dom(t);
 picker.bindProductPicker(d.root,products);
 d.input.value='KH-001';d.input.handlers.input();
 assert.equal(d.hint.textContent,'Matching products: 1');
 const rendered=String(picker.productPicker(products,undefined,products[0]));
 assert.match(rendered,/Use last product:/);assert.match(rendered,/Büro Kopfhörer/);
 d.input.value='';d.input.handlers.input();
 assert.equal(d.hint.textContent,'Matching products: 2');
});
test('optional catalog lookup accepts an empty or cleared choice but still rejects an unselected search',t=>{
 const d=dom(t);picker.bindProductPicker(d.root,products,undefined,()=>{},{optional:true});assert.equal(d.input.validity,'');
 d.input.value='KH-';d.input.handlers.input();assert.ok(d.input.validity);assert.equal(d.select.value,'');
 d.input.value='';d.input.handlers.input();assert.equal(d.input.validity,'');
 const selected=dom(t);picker.bindProductPicker(selected.root,products,1,()=>{},{optional:true});selected.clear.handlers.click();assert.equal(selected.input.validity,'');assert.equal(selected.select.value,'');
 const markup=String(picker.productPicker(products,undefined,undefined,{optional:true}));assert.doesNotMatch(markup,/\srequired(?:\s|>)/);assert.doesNotMatch(markup,/<b>\*<\/b>/);
});
