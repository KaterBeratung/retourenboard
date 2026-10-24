import test from 'node:test';
import assert from 'node:assert/strict';
const menus=await import('../dist/public/selects.js').catch(()=>({}));

function fixture(){
  const ownerDocument={createElement(tag){return {tagName:tag.toUpperCase(),children:[],append(child){this.children.push(child);}};}};
  const select={tagName:'SELECT',ownerDocument,selectedIndex:2,value:'archived',name:'activity',id:'filter',required:true,disabled:false,firstElementChild:{tagName:'OPTION'},children:[],prepend(child){this.children.unshift(child);this.firstElementChild=child;},matches(){return !this.hidden&&!this.multiple&&!this.size;}};
  return {select,root:{querySelectorAll(){return [select].filter(el=>el.matches());}}};
}
test('native select enhancement adds a truncatable caption without changing selection, validation or form identity',()=>{
  assert.equal(typeof menus.enhanceSelects,'function');const {select,root}=fixture();menus.enhanceSelects(root);
  assert.equal(select.children.length,1);assert.equal(select.firstElementChild.tagName,'BUTTON');assert.equal(select.firstElementChild.children[0].tagName,'SELECTEDCONTENT');
  assert.equal(select.selectedIndex,2);assert.equal(select.value,'archived');assert.equal(select.name,'activity');assert.equal(select.id,'filter');assert.equal(select.required,true);
});
test('enhancing a select twice preserves the same native caption and disabled state',()=>{
  assert.equal(typeof menus.enhanceSelects,'function');const {select,root}=fixture();select.disabled=true;menus.enhanceSelects(root);const button=select.firstElementChild;menus.enhanceSelects(root);assert.equal(select.children.length,1);assert.equal(select.firstElementChild,button);assert.equal(select.disabled,true);
});
test('hidden selects, multiple selections and listboxes keep their existing representation',()=>{
  assert.equal(typeof menus.enhanceSelects,'function');for(const field of ['hidden','multiple','size']){const {select,root}=fixture();select[field]=field==='size'?4:true;menus.enhanceSelects(root);assert.equal(select.children.length,0);assert.equal(select.value,'archived');}
});
test('a newly inserted select itself can be enhanced and an existing native button is preserved',()=>{
  assert.equal(typeof menus.enhanceSelects,'function');const {select}=fixture();select.querySelectorAll=()=>[];menus.enhanceSelects(select);assert.equal(select.firstElementChild.tagName,'BUTTON');const button=select.firstElementChild;menus.enhanceSelects(select);assert.equal(select.firstElementChild,button);
});
