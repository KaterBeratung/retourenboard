export function bindPreviewDevice(page:Document){
 const controls=page.querySelector<HTMLElement>('#preview-device-controls');if(!controls)return;
 const buttons=[...page.querySelectorAll<HTMLButtonElement>('[data-preview-device]')];
 const panels=[...page.querySelectorAll<HTMLElement>('[data-preview-device-panel]')];
 function select(device:string){
  if(device!=='desktop'&&device!=='mobile')return;
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.previewDevice===device));
  for(const panel of panels)panel.hidden=panel.dataset.previewDevicePanel!==device;
 }
 for(const button of buttons)button.addEventListener('click',()=>select(button.dataset.previewDevice??''));
 select('desktop');controls.hidden=false;
}
