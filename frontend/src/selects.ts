const selector='select:not([multiple]):not([hidden]):not([size])';
const bound=new WeakSet<Document>();

// The browser still owns selection, keyboard input, validation and form values.
// An explicit caption only lets CSS truncate long text without hiding the arrow.
export function enhanceSelects(root:ParentNode){
  const controls=[...root.querySelectorAll<HTMLSelectElement>(selector)];
  if('matches' in root&&(root as Element).matches(selector))controls.unshift(root as HTMLSelectElement);
  for(const select of controls){
    if(select.firstElementChild?.tagName==='BUTTON')continue;
    const selected=select.selectedIndex,button=select.ownerDocument.createElement('button');
    button.type='button';button.className='select-value-button';
    button.append(select.ownerDocument.createElement('selectedcontent'));
    select.prepend(button);
    if(select.selectedIndex!==selected)select.selectedIndex=selected;
  }
}
export function bindSelectMenus(doc:Document=document){
  if(bound.has(doc)||!CSS.supports('appearance','base-select')||!CSS.supports('selector(::picker(select))'))return;
  bound.add(doc);enhanceSelects(doc);
  new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes'){enhanceSelects(record.target as Element);continue;}
      for(const node of record.addedNodes)if(node.nodeType===1)enhanceSelects(node as Element);
    }
  }).observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','multiple','size']});
}
