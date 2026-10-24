import QRCode from 'qrcode/lib/core/qrcode.js';
import {html,t,addTranslations} from './i18n.js';
import {h} from './ui.js';
addTranslations({'Gerätecode':'Device code','Zusätzliche Geräteetiketten':'Additional device labels','Bei 62 × 29 mm werden die scannbaren Gerätekennungen auf zusätzlichen Etiketten gedruckt.':'At 62 × 29 mm, scannable device identifiers are printed on additional labels.'});
// Code 128 symbol widths, from ZXing (Apache-2.0, scanner-licenses/@zxing-library.txt).
const patterns=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
function code128(value:string){
 const numeric=/^\d{2}(?:\d{2})*$/.test(value),start=numeric?105:104,codes=numeric?value.match(/../g).map(Number):[...value].map(c=>c.charCodeAt(0)-32);
 const checksum=(start+codes.reduce((sum,code,i)=>sum+code*(i+1),0))%103;
 let x=10,rects='';
 for(const code of [start,...codes,checksum,106])for(const [i,span] of [...patterns[code]].entries()){const width=Number(span);if(i%2===0)rects+='<rect x="'+x+'" y="0" width="'+width+'" height="36"/>';x+=width;}
 return {width:x+10,height:36,rects};
}
export function identifierCode(value:unknown):string{
 if(typeof value!=='string'||!value.trim()||value.length>250||/[\u0000-\u001f\u007f-\u009f]/.test(value))return '';
 if(/^[\x20-\x7e]+$/.test(value)){
  const code=code128(value);
  // Never squeeze the narrowest bar below 0.25 mm to fit a small label.
  if(code.width<=220)return '<svg class="label-identifier-code label-identifier-linear" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Code 128" viewBox="0 0 '+code.width+' 36" width="'+code.width*.25+'mm" height="9mm" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">'+code.rects+'</g></svg>';
 }
 const qr=QRCode.create(value,{errorCorrectionLevel:'M'}),width=qr.modules.size+8;let rects='';
 for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.get(y,x))rects+='<rect x="'+(x+4)+'" y="'+(y+4)+'" width="1" height="1"/>';
 const mm=Math.max(18,width*.25);
 return '<svg class="label-identifier-code label-identifier-qr" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR-Code" viewBox="0 0 '+width+' '+width+'" width="'+mm+'mm" height="'+mm+'mm" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">'+rects+'</g></svg>';
}
export function identifierField(key:string,label:string,value:string){
 return value?html`<div class="label-field" data-label-field="${key}"><dt>${h(t(label))}</dt><dd>${h(value)}</dd>${identifierCode(value)}</div>`:'';
}
export function identifierStickers(number:string,serial:string,replacement=''){
 return [['Seriennummer',serial],['Austauschseriennummer',replacement]].map(([label,value])=>{
  const code=identifierCode(value);return code?html`<article class="return-print-label label-identifier-sticker" data-label-size="62x29" aria-label="${h(t('Gerätecode'))}"><header><img src="/favicon.svg" alt="" width="14" height="14"><strong>${h(number)}</strong></header><div class="label-sticker-content"><dl><dt>${h(t(label))}</dt><dd>${h(value)}</dd></dl>${code}</div></article>`:'';
 }).join('');
}
