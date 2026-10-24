import test from 'node:test';
import assert from 'node:assert/strict';
const ui=await import('../dist/public/presentation.js');

function fixture({customCards=false,disposal=false}={}){
 const doc={createElement:()=>node('SPAN')};
 function node(tag,text=''){return {tagName:tag,textContent:text,dataset:{},children:[],attrs:{},ownerDocument:doc,
  getAttribute(key){return this.attrs[key]??null;},hasAttribute(key){return key==='data-mobile-cell-label'?this.dataset.mobileCellLabel!==undefined:this.attrs[key]!==undefined;},setAttribute(key,value){this.attrs[key]=value;},
  prepend(child){this.children.unshift(child);},matches(selector){return tag==='TABLE'&&selector.includes('table');}};}
 const headers=['Name','Status','Aktionen'].map(text=>({...node('TH',text),colSpan:1}));
 const button={...node('BUTTON'),disabled:false,onclick:()=>42},input={...node('INPUT'),value:'unsaved note'};
 const cells=['Example','Aktiv',''].map(text=>({...node('TD',text),colSpan:1}));cells[0].children.push(input);cells[2].children.push(button);
 const row={...node('TR'),cells},body={...node('TBODY'),rows:[row]},headRow={...node('TR'),cells:headers};
 const wrapper={dataset:{},nextElementSibling:customCards?{matches:s=>s==='.mobile-records'}:null};
 const table={...node('TABLE'),parentElement:wrapper,tHead:{...node('THEAD'),rows:[headRow]},tBodies:[body],classList:{contains:name=>disposal&&name==='disposal-table'},querySelectorAll:()=>[]};
 return {table,wrapper,headers,body,row,cells,button,input,root:{querySelectorAll:()=>[table]},node};
}

test('mobile table labels follow headers without replacing controls, values or action handlers',()=>{
 assert.equal(typeof ui.enhanceResponsiveTables,'function');const f=fixture();ui.enhanceResponsiveTables(f.root);
 assert.equal(f.table.dataset.responsiveCards,'');assert.equal(f.wrapper.dataset.responsiveCards,'');
 assert.deepEqual(f.cells.map(cell=>cell.children[0].textContent),['Name','Status','Aktionen']);
 assert.ok(f.cells.every(cell=>cell.children[0].getAttribute('aria-hidden')==='true'));
 assert.equal(f.cells[0].children[1],f.input);assert.equal(f.input.value,'unsaved note');assert.equal(f.cells[2].children[1],f.button);assert.equal(f.button.onclick(),42);
 assert.equal(f.table.getAttribute('role'),'table');assert.equal(f.row.getAttribute('role'),'row');assert.ok(f.cells.every(cell=>cell.getAttribute('role')==='cell'));
});

test('repeated table enhancement reuses labels and updates them after a language or row change',()=>{
 assert.equal(typeof ui.enhanceResponsiveTables,'function');const f=fixture();ui.enhanceResponsiveTables(f.root);const original=f.cells[1].children[0];
 f.headers[1].textContent='State';ui.enhanceResponsiveTables(f.root);assert.equal(f.cells[1].children[0],original);assert.equal(original.textContent,'State');assert.equal(f.cells[1].children.length,1);
 const newCell={...f.node('TD','new'),colSpan:1};f.body.rows.push({...f.node('TR'),cells:[newCell]});ui.enhanceResponsiveTables(f.table);assert.equal(newCell.children[0].textContent,'Name');
});

test('existing inventory and disposal card layouts are retained without extra labels',()=>{
 assert.equal(typeof ui.enhanceResponsiveTables,'function');for(const options of [{customCards:true},{disposal:true}]){const f=fixture(options);ui.enhanceResponsiveTables(f.root);assert.equal(f.table.dataset.responsiveCards,undefined);assert.equal(f.cells[1].children.length,0);}
});

test('row headers keep their semantics and spanning messages do not receive misleading column labels',()=>{
 assert.equal(typeof ui.enhanceResponsiveTables,'function');const f=fixture();f.cells[0].tagName='TH';f.cells[1].colSpan=3;ui.enhanceResponsiveTables(f.root);
 assert.equal(f.cells[0].getAttribute('role'),'rowheader');assert.equal(f.cells[1].children.length,0);assert.equal(f.cells[1].dataset.responsiveSpan,'');
});
