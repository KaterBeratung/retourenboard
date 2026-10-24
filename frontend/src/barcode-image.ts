import {BinaryBitmap,HybridBinarizer,MultiFormatReader,RGBLuminanceSource,Result,DecodeHintType} from '@zxing/library';

export type BarcodePixels={data:Uint8ClampedArray;width:number;height:number};
type Region={left:number;top:number;width:number;height:number};
type ImageOptions={isCurrent?:()=>boolean;onProgress?:(done:number,total:number)=>void;yieldTask?:()=>Promise<void>;maxResults?:number};
const MAX_PIXELS=8_000_000,MAX_ATTEMPTS=160,MAX_RESULTS=64;
function validImage(image:BarcodePixels){
  return image&&Number.isInteger(image.width)&&Number.isInteger(image.height)&&image.width>0&&image.height>0&&image.width<=8192&&image.height<=8192&&image.width*image.height<=MAX_PIXELS&&image.data instanceof Uint8ClampedArray&&image.data.length>=image.width*image.height*4;
}
function validValue(value:string){return value.length>0&&value.length<=500&&value.trim().length>0&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);}
function reader(harder=false){
  const decoder=new MultiFormatReader();
  decoder.setHints(harder?new Map([[DecodeHintType.TRY_HARDER,true]]):new Map());
  return decoder;
}
/** Composite transparent pixels onto white before calculating luminance. */
function luminance(image:BarcodePixels,region:Region){
  const pixels=new Uint8ClampedArray(region.width*region.height);
  for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){
    const from=((region.top+y)*image.width+region.left+x)*4,alpha=image.data[from+3]/255;
    pixels[y*region.width+x]=255+(image.data[from]+2*image.data[from+1]+image.data[from+2])/4*alpha-255*alpha;
  }
  return new RGBLuminanceSource(pixels,region.width,region.height);
}
/** RGBLuminanceSource cannot rotate: retain each original pixel explicitly. */
function rotated(source:RGBLuminanceSource){
  const width=source.getWidth(),height=source.getHeight(),input=source.getMatrix(),output=new Uint8ClampedArray(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)output[x*height+height-y-1]=input[y*width+x];
  return new RGBLuminanceSource(output,height,width);
}
function decode(source:RGBLuminanceSource,decoder:MultiFormatReader,invert=false):Result|null {
  try{
    const matrix=source.getMatrix();let minimum=255,maximum=0,contrast=false;
    for(let i=0;i<matrix.length;i++){
      minimum=Math.min(minimum,matrix[i]);maximum=Math.max(maximum,matrix[i]);
      if(maximum-minimum>=24){contrast=true;break;}
    }
    if(!contrast)return null;
    // Materialize a crop once; both binarization and the contrast check share it.
    const pixels=new RGBLuminanceSource(matrix,source.getWidth(),source.getHeight());
    const result=decoder.decodeWithState(new BinaryBitmap(new HybridBinarizer(invert?pixels.invert():pixels)));
    return validValue(result.getText())?result:null;
  }catch{return null;}finally{decoder.reset();}
}
function whole(width:number,height:number):Region{return {left:0,top:0,width,height};}

/** Shared camera capture rectangle, strictly inside the visible UI frame. */
export function cameraFrameRegion(width:number,height:number,aspectRatio=16/9):Region|null {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  if(!Number.isFinite(aspectRatio)||aspectRatio<=0)aspectRatio=16/9;
  const visibleWidth=Math.min(width,height*aspectRatio),visibleHeight=Math.min(height,width/aspectRatio);
  const left=Math.ceil((width-visibleWidth)/2+visibleWidth*.12),top=Math.ceil((height-visibleHeight)/2+visibleHeight*.2);
  const right=Math.floor((width+visibleWidth)/2-visibleWidth*.12),bottom=Math.floor((height+visibleHeight)/2-visibleHeight*.2);
  if(right-left<16||bottom-top<16)return null;
  return {left,top,width:right-left,height:bottom-top};
}
/** Match the centered object-fit:cover video and the 12%/20% frame inset. */
export function decodeBarcodeFrame(image:BarcodePixels,{aspectRatio=16/9}:{aspectRatio?:number}={}):Result|null {
  if(!validImage(image))return null;
  const region=cameraFrameRegion(image.width,image.height,aspectRatio);if(!region)return null;
  const source=luminance(image,region),decoder=reader(true);
  return decode(source,decoder)??decode(rotated(source),decoder)??decode(source,decoder,true)??decode(rotated(source),decoder,true);
}

function plannedRegions(width:number,height:number){
  const regions:Region[]=[whole(width,height)];
  const add=(x:number,y:number,w:number,h:number)=>regions.push({left:Math.round(x*width),top:Math.round(y*height),width:Math.floor(w*width),height:Math.floor(h*height)});
  // Strips preserve long linear labels; overlapping tiles retain quiet zones
  // when several stickers share a page or cross a regular grid boundary.
  for(const p of [0,.275,.55]){add(0,p,1,.45);add(p,0,.45,1);}
  for(const y of [0,.2,.4])for(const x of [0,.2,.4])add(x,y,.6,.6);
  for(const y of [0,.2,.4,.6])for(const x of [0,.2,.4,.6])add(x,y,.4,.4);
  return regions;
}
function contentRegions(source:RGBLuminanceSource):Region[]{
  const width=source.getWidth(),height=source.getHeight(),matrix=source.getMatrix(),step=2;
  const rows=new Uint8Array(Math.ceil(height/step)),columns=new Uint8Array(Math.ceil(width/step));
  // White space between stickers is useful even when multiple QR finder
  // patterns prevent a full-page reader from selecting one valid symbol.
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step)if(matrix[y*width+x]<160){rows[y/step]=1;columns[x/step]=1;}
  const bands=(marks:Uint8Array,length:number)=>{
    const found:[number,number][]=[];let start=-1,last=-1;
    for(let i=0;i<marks.length;i++){
      if(marks[i]){if(start<0)start=i;last=i;}
      if(start>=0&&(i-last>8||i===marks.length-1)){
        if((last-start+1)*step>=12)found.push([Math.max(0,start*step-20),Math.min(length,(last+1)*step+20)]);
        start=-1;
      }
    }
    return found;
  };
  const horizontal=bands(columns,width),vertical=bands(rows,height);
  if(!horizontal.length||!vertical.length||horizontal.length*vertical.length>64)return [];
  return vertical.flatMap(([top,bottom])=>horizontal.map(([left,right])=>({left,top,width:right-left,height:bottom-top})));
}
function resultRegions(result:Result,region:Region,source:RGBLuminanceSource,turned:boolean):Region[]{
  const points=result.getResultPoints();if(!points?.length)return [];
  const xs=points.map(p=>turned?p.getY():p.getX()),ys=points.map(p=>turned?region.height-p.getX()-1:p.getY());
  let left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  if(![left,right,top,bottom].every(Number.isFinite))return [];
  // Linear readers return points on one scan row. Find that barcode's actual
  // stripe band before splitting vertically so it cannot hide the next label.
  if(bottom-top<3){
    const matrix=source.getMatrix(),width=region.width,x1=Math.max(0,Math.floor(left)),x2=Math.min(width,Math.ceil(right)),middle=Math.round(top);
    const stripe=(y:number)=>{
      let dark=0;for(let x=x1;x<x2;x++)if(matrix[y*width+x]<128)dark++;
      return dark>Math.max(2,(x2-x1)*.04);
    };
    while(top>0&&stripe(Math.floor(top)-1))top--;
    while(bottom<region.height-1&&stripe(Math.ceil(bottom)+1))bottom++;
    if(middle<0||middle>=region.height)return [];
  }else if(right-left<3){
    const matrix=source.getMatrix(),width=region.width,y1=Math.max(0,Math.floor(top)),y2=Math.min(region.height,Math.ceil(bottom));
    const stripe=(x:number)=>{
      let dark=0;for(let y=y1;y<y2;y++)if(matrix[y*width+x]<128)dark++;
      return dark>Math.max(2,(y2-y1)*.04);
    };
    while(left>0&&stripe(Math.floor(left)-1))left--;
    while(right<region.width-1&&stripe(Math.ceil(right)+1))right++;
  }
  const padX=Math.max(8,(right-left)*.12),padY=Math.max(8,(bottom-top)*.12),regions:Region[]=[];
  const add=(x:number,y:number,w:number,h:number)=>{
    const l=Math.max(0,Math.ceil(x)),t=Math.max(0,Math.ceil(y)),r=Math.min(region.width,Math.floor(x+w)),b=Math.min(region.height,Math.floor(y+h));
    if(r-l>=32&&b-t>=32)regions.push({left:region.left+l,top:region.top+t,width:r-l,height:b-t});
  };
  add(0,0,left-padX,region.height);add(right+padX,0,region.width-right-padX,region.height);
  add(0,0,region.width,top-padY);add(0,bottom+padY,region.width,region.height-bottom-padY);
  return regions;
}

/** Bounded local image scan. Cancellation deliberately discards partial codes. */
export async function decodeBarcodeImage(image:BarcodePixels,{isCurrent=()=>true,onProgress=()=>{},yieldTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0)),maxResults=MAX_RESULTS}:ImageOptions={}):Promise<string[]> {
  if(!validImage(image)||!isCurrent())return [];
  const limit=Number.isFinite(maxResults)?Math.max(1,Math.min(MAX_RESULTS,Math.floor(maxResults))):MAX_RESULTS;
  onProgress(0,MAX_ATTEMPTS);await yieldTask();if(!isCurrent())return [];
  const source=luminance(image,whole(image.width,image.height)),decoder=reader(),values=new Set<string>();
  const queue=[...contentRegions(source),...plannedRegions(image.width,image.height)],seen=new Set<string>(),fallback:Region[]=[];
  let attempts=0;
  async function attempt(source:RGBLuminanceSource,invert:boolean){
    if(!isCurrent()||attempts>=MAX_ATTEMPTS)return null;
    const result=decode(source,decoder,invert);attempts++;onProgress(attempts,MAX_ATTEMPTS);
    await yieldTask();return isCurrent()?result:null;
  }
  while(queue.length&&attempts<MAX_ATTEMPTS-16&&values.size<limit){
    if(!isCurrent())return [];
    const region=queue.shift()!,key=[region.left,region.top,region.width,region.height].join(',');
    if(seen.has(key)||region.width<16||region.height<16)continue;seen.add(key);
    const crop=source.crop(region.left,region.top,region.width,region.height) as RGBLuminanceSource;
    let result=await attempt(crop,false),turned=false;
    if(!isCurrent())return [];
    if(!result){result=await attempt(rotated(crop),false);turned=true;}
    if(!isCurrent())return [];
    if(result){
      values.add(result.getText());
      queue.unshift(...resultRegions(result,region,crop,turned));
    }else fallback.push(region);
  }
  // Inverted labels are less common. Reserve a bounded second pass so failed
  // normal scans cannot monopolize the operation before inversion is tried.
  for(const region of fallback){
    if(attempts>=MAX_ATTEMPTS||values.size>=limit)break;
    if(!isCurrent())return [];
    const crop=source.crop(region.left,region.top,region.width,region.height) as RGBLuminanceSource;
    const result=await attempt(crop,true)??await attempt(rotated(crop),true);
    if(!isCurrent())return [];
    if(result)values.add(result.getText());
  }
  if(!isCurrent())return [];
  onProgress(MAX_ATTEMPTS,MAX_ATTEMPTS);return [...values];
}
