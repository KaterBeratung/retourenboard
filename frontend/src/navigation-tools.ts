export function bindNavigationTools(root:any,storage?:Pick<Storage,'getItem'|'setItem'>){
  if(!root)return {update:(_rights:any)=>{}};
  try{root.open=storage?.getItem('retourenboard.tools.open')==='true';}catch{}
  root.addEventListener('toggle',()=>{try{storage?.setItem('retourenboard.tools.open',String(root.open));}catch{}});
  return {update(rights:{import:boolean,export:boolean}){root.hidden=!rights.import&&!rights.export;}};
}
