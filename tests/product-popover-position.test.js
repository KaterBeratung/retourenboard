import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const picker=await sourceModule("export * from './frontend/src/product-picker.ts';");
function point(anchor,size,viewport){
 assert.equal(typeof picker.productPopoverPosition,'function');
 return picker.productPopoverPosition(anchor,size,viewport);
}
test('product suggestions use a wider readable surface within a narrow viewport',()=>{
 const p=point({left:54,right:241,top:233,bottom:277},{height:259},{width:305,height:640});
 assert.deepEqual(p,{left:53,top:283,width:240,maxHeight:280,placement:'below'});
});
test('product suggestions flip above a low control and shrink in short windows',()=>{
 const p=point({left:230,right:410,top:320,bottom:364},{height:200},{width:440,height:390});
 assert.deepEqual(p,{left:188,top:114,width:240,maxHeight:280,placement:'above'});
 const short=point({left:20,right:400,top:154,bottom:198},{height:240},{width:420,height:320});
 assert.equal(short.placement,'above');assert.equal(short.maxHeight,136);assert.equal(short.top,12);
});
test('product suggestions honor the visible viewport while the mobile keyboard is open',()=>{
 const p=point({left:20,right:280,top:220,bottom:264},{height:220},{left:0,top:180,width:305,height:260});
 assert.equal(p.placement,'below');assert.equal(p.maxHeight,158);
 assert.ok(p.left>=12&&p.left+p.width<=293);
 assert.ok(p.top>=192&&p.top+Math.min(220,p.maxHeight)<=428);
});

function hub(){return {handlers:new Map(),addEventListener(k,fn){this.handlers.set(k,fn);},removeEventListener(k,fn){if(this.handlers.get(k)===fn)this.handlers.delete(k);}};}
function nativeFixture(){
 const visual={...hub(),width:305,height:350,offsetLeft:0,offsetTop:0};
 const view={...hub(),visualViewport:visual},doc={...hub(),defaultView:view,documentElement:{clientWidth:305,clientHeight:640}},dialog=hub();
 const node=()=>({...hub(),attrs:{},hidden:false,value:'',style:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},setCustomValidity(v){this.validity=v;},focus(){},dispatchEvent(){}});
 const input={...node(),ownerDocument:doc,anchor:{left:54,right:241,top:220,bottom:264},getBoundingClientRect(){return this.anchor;}};
 const select=node(),hint={...node(),getBoundingClientRect:()=>({height:26})},clear=node(),list={...node(),id:'options',querySelectorAll:()=>[]};
 const popup={...node(),shown:false,matches(){return this.shown;},showPopover(){this.shown=true;},hidePopover(){this.shown=false;},contains(n){return n===list||n===hint;},getBoundingClientRect(){const limit=parseFloat(this.style.maxHeight)||Infinity;return {height:Math.min((parseFloat(list.style.maxHeight)||(list.cssMaxHeight??280))+28,limit)};}};
 const nodes={'[data-product-search]':input,'[name=productId]':select,'[data-product-list]':list,'[data-product-popover]':popup,'[data-product-hint]':hint,'[data-product-clear]':clear};
 const clip={rect:{left:0,right:305,top:0,bottom:640},getBoundingClientRect(){return this.rect;}};
 const root={...hub(),isConnected:true,querySelector:s=>nodes[s],contains:n=>Object.values(nodes).includes(n),closest:s=>s==='dialog'?dialog:s==='.dialog-body'?clip:null};
 picker.bindProductPicker(root,[{id:1,name:'Produkt',sku:'SKU',active:true}]);
 return {input,list,popup,visual,doc,view,dialog,clip,open:()=>input.handlers.get('focus')(),escape:()=>input.handlers.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}})};
}
test('native suggestion surfaces clean up document and viewport listeners on Escape and dialog close',()=>{
 const f=nativeFixture();f.open();assert.equal(f.popup.shown,true);assert.equal(f.popup.style.width,'240px');assert.ok(f.doc.handlers.has('pointerdown'));
 f.escape();assert.equal(f.popup.shown,false);assert.equal(f.input.attrs['aria-expanded'],'false');assert.equal(f.doc.handlers.size,0);assert.equal(f.visual.handlers.size,0);
 f.open();f.dialog.handlers.get('close')();assert.equal(f.popup.shown,false);assert.equal(f.doc.handlers.size,0);
});
test('resizing a previously constrained surface remeasures its full natural height before placing it',()=>{
 const f=nativeFixture();f.open();assert.equal(f.popup.style.maxHeight,'202px');
 f.visual.height=640;f.input.anchor={left:54,right:241,top:500,bottom:544};f.visual.handlers.get('resize')();
 assert.equal(f.popup.style.maxHeight,'280px');
 assert.ok(parseFloat(f.popup.style.top)+f.popup.getBoundingClientRect().height<=494,'The grown menu must stay above its anchor');
 f.escape();
});
test('an old native close event cannot hide a newly reopened suggestion surface',()=>{
 const f=nativeFixture();f.open();f.escape();f.open();
 f.popup.handlers.get('toggle')({newState:'closed'});
 assert.equal(f.popup.shown,true);assert.equal(f.input.attrs['aria-expanded'],'true');f.escape();
});

test('placing above a control never expands a naturally shorter menu into its anchor',()=>{
 const f=nativeFixture();f.list.cssMaxHeight=120;f.visual.height=390;f.input.anchor={left:54,right:241,top:250,bottom:294};f.open();
 assert.ok(parseFloat(f.popup.style.top)+f.popup.getBoundingClientRect().height<=244);
 f.escape();
});
test('out-of-frame anchors cannot produce an out-of-frame product surface',()=>{
 for(const anchor of [{left:20,right:280,top:700,bottom:744},{left:20,right:280,top:-50,bottom:-6}]){
  const p=point(anchor,{height:200},{width:305,height:640});
  assert.ok(p.top>=12);assert.ok(p.top+Math.min(200,p.maxHeight)<=628);
 }
});

test('scrolling the anchor outside its dialog body closes suggestions and releases listeners',()=>{
 const f=nativeFixture();f.clip.rect={left:0,right:305,top:180,bottom:330};f.open();assert.equal(f.popup.shown,true);
 f.input.anchor={left:54,right:241,top:120,bottom:164};f.doc.handlers.get('scroll')({target:f.clip});
 assert.equal(f.popup.shown,false);assert.equal(f.input.attrs['aria-expanded'],'false');assert.equal(f.doc.handlers.size,0);
});