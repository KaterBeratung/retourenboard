import {html,t,setText} from './i18n.js';
import {h,icon} from './ui.js';

export function productImageUrl(product){return `/api/products/${product.productId??product.id}/image?v=${encodeURIComponent(product.imageVersion)}`;}
export function productAvatar(product){
  const name=product.productName??product.name??'';
  return html`<span class="product-avatar${product.imageVersion?' has-image':''}">${product.imageVersion?html`<img src="${h(productImageUrl(product))}" alt="" width="38" height="38" loading="lazy" decoding="async">`:h(name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase())}</span>`;
}
export function productImageEditor(item){return html`<section class="field full product-image-editor" aria-label="Produktbild"><div class="product-image-preview" data-image-preview>${productAvatar(item)}</div><div class="product-image-controls"><strong>Produktbild <small>(optional)</small></strong><p>PNG, JPG, JPEG oder WebP · maximal 1 MB.</p><div class="product-image-actions"><button type="button" class="btn secondary small" data-image-choose>${icon('upload')}Bild auswählen</button><button type="button" class="text-link" data-image-remove${item.imageVersion?'':' hidden'}>${icon('trash')}Bild entfernen</button></div><small data-image-name>${h(item.imageName??t('Noch kein Bild ausgewählt.'))}</small><p class="form-error" data-image-error role="alert" hidden></p></div><input type="file" name="productImageFile" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" data-image-file hidden><input type="hidden" name="productImageAction" value="keep"></section>`;}
export function bindProductImageEditor(dialog,item){
  const root=dialog.querySelector('.product-image-editor'),file=root.querySelector('[data-image-file]'),action=root.querySelector('[name=productImageAction]'),preview=root.querySelector('[data-image-preview]'),remove=root.querySelector('[data-image-remove]'),name=root.querySelector('[data-image-name]'),error=root.querySelector('[data-image-error]');
  let objectUrl:string|null=null;
  const release=()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;};
  const resetPreview=()=>{release();preview.innerHTML=productAvatar(action.value==='remove'?{name:item.name}:item);setText(name,action.value==='remove'?t('Noch kein Bild ausgewählt.'):item.imageName??t('Noch kein Bild ausgewählt.'));remove.hidden=action.value==='remove'||!item.imageVersion;};
  root.querySelector('[data-image-choose]').onclick=()=>file.click();
  file.addEventListener('change',()=>{
    error.hidden=true;const selected:File=file.files?.[0];
    if(!selected){resetPreview();return;}
    if(!/\.(png|jpe?g|webp)$/i.test(selected.name)||selected.size>1024*1024||!selected.size){file.value='';resetPreview();setText(error,t(selected.size>1024*1024?'Produktbilder dürfen maximal 1 MB groß sein.':'Produktbilder müssen PNG, JPG, JPEG oder WebP sein.'));error.hidden=false;return;}
    release();objectUrl=URL.createObjectURL(selected);preview.innerHTML=html`<span class="product-avatar has-image"><img src="${h(objectUrl)}" alt="" width="80" height="80"></span>`;setText(name,selected.name);remove.hidden=false;
  });
  remove.onclick=()=>{file.value='';action.value=item.imageVersion?'remove':'keep';error.hidden=true;resetPreview();action.dispatchEvent(new Event('change',{bubbles:true}));};
  dialog.addEventListener('close',release,{once:true});
  const prepare=(body,data:FormData)=>{
    const selected=data.get('productImageFile');delete body.productImageFile;delete body.productImageAction;
    if(selected instanceof File&&selected.size){
      if(selected.size>1024*1024)throw new Error(t('Produktbilder dürfen maximal 1 MB groß sein.'));
      return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error(t('Das Produktbild konnte nicht gelesen werden.')));reader.readAsDataURL(selected);}).then(encoded=>{body.image={name:selected.name,data:encoded};return body;});
    }else if(data.get('productImageAction')==='remove')body.image=null;
    return body;
  };
  return {prepare,saved:(body,saved)=>{
    // A create can succeed while newer edits keep the dialog open. Its next
    // removal must target the saved image rather than the initial empty state.
    if(!saved?.id)return;
    if(body.image&& !file.files?.length&&action.value==='keep')action.value='remove';
    item={...item,...saved};
  }};
}
