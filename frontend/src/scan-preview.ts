export type ScanBounds={left:number;top:number;width:number;height:number};
/** Choices belong to one result set. Reading a file never selects its codes. */
export function createScanCandidateSelection(){
  let values:string[]=[];const selected=new Set<number>();
  return {
    replace(candidates:Array<{value:string}>){values=candidates.map(candidate=>candidate.value);selected.clear();},
    choose(index:number,checked:boolean){if(!Number.isSafeInteger(index)||index<0||index>=values.length)return;checked?selected.add(index):selected.delete(index);},
    clear(){values=[];selected.clear();},
    values(){return [...new Set(values.filter((_value,index)=>selected.has(index)))];},
  };
}
const round=(value:number)=>Math.round(value*1e9)/1e9;
/** Fractional bounds always refer to the original, never to CSS display pixels. */
export function normalizeScanRegion(region:ScanBounds):ScanBounds|null{
  if(!region||!Object.values(region).every(Number.isFinite)||region.width<=0||region.height<=0)return null;
  const left=Math.max(0,Math.min(1,region.left)),top=Math.max(0,Math.min(1,region.top));
  const width=Math.min(region.width,1-left),height=Math.min(region.height,1-top);
  return width>0&&height>0?{left:round(left),top:round(top),width:round(width),height:round(height)}:null;
}
export function scanCanvasSize(width:number,height:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Bild ist nicht lesbar.');
  const scale=Math.min(1,3200/Math.max(width,height),Math.sqrt(8_000_000/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
/** Project genuine OCR boxes through crop and downscaling back onto the original. */
export function mapScanBounds(bounds:ScanBounds,width:number,height:number,region:ScanBounds={left:0,top:0,width:1,height:1}):ScanBounds|null{
  if(width<=0||height<=0)return null;
  return normalizeScanRegion({left:region.left+bounds.left/width*region.width,top:region.top+bounds.top/height*region.height,width:bounds.width/width*region.width,height:bounds.height/height*region.height});
}

type ImageDimensions={width:number;height:number};
const withinSourceBudget=({width,height}:ImageDimensions)=>width<=16384&&height<=16384&&width*height<=64_000_000;
/** Inspect encoded dimensions before asking the browser to allocate image pixels. */
export function readScanImageDimensions(bytes:Uint8Array):ImageDimensions|null{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=bytes.length;
  const text=(offset:number,count:number)=>offset+count<=length?String.fromCharCode(...bytes.subarray(offset,offset+count)):'';
  const dimensions=(width:number,height:number)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0?{width,height}:null;
  if(length>=24&&bytes[0]===137&&text(1,3)==='PNG'&&text(12,4)==='IHDR')return dimensions(view.getUint32(16),view.getUint32(20));
  if(length>=12&&bytes[0]===255&&bytes[1]===216){
    for(let offset=2;offset+3<length;){
      if(bytes[offset++]!==255)continue;while(offset<length&&bytes[offset]===255)offset++;const marker=bytes[offset++];
      if(marker===217||marker===218)break;if(marker===0||marker===216||marker===1||marker>=208&&marker<=215)continue;
      if(offset+2>length)break;const size=view.getUint16(offset);if(size<2||offset+size>length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8)return dimensions(view.getUint16(offset+5),view.getUint16(offset+3));
      offset+=size;
    }return null;
  }
  if(length>=20&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'){
    for(let offset=12;offset+8<=length;){
      const kind=text(offset,4),size=view.getUint32(offset+4,true),start=offset+8;if(start+size>length)return null;
      if(kind==='VP8X'&&size>=10)return dimensions(1+bytes[start+4]+bytes[start+5]*256+bytes[start+6]*65536,1+bytes[start+7]+bytes[start+8]*256+bytes[start+9]*65536);
      if(kind==='VP8 '&&size>=10&&bytes[start+3]===157&&bytes[start+4]===1&&bytes[start+5]===42)return dimensions(view.getUint16(start+6,true)&16383,view.getUint16(start+8,true)&16383);
      if(kind==='VP8L'&&size>=5&&bytes[start]===47){const bits=view.getUint32(start+1,true);return dimensions((bits&16383)+1,((bits>>>14)&16383)+1);}
      offset=start+size+(size&1);
    }return null;
  }
  if(length>=26&&text(0,2)==='BM'){
    const header=view.getUint32(14,true);return header===12?dimensions(view.getUint16(18,true),view.getUint16(20,true)):header>=40?dimensions(view.getInt32(18,true),Math.abs(view.getInt32(22,true))):null;
  }
  if(length>=40&&text(4,4)==='ftyp'){
    // AVIF and HEIF share ISO-BMFF spatial extent properties. Inspect every
    // encoded extent, including auxiliary pictures, before allowing a decode.
    let largest:ImageDimensions|null=null;
    for(let offset=8;offset+20<=length;offset++)if(bytes[offset+4]===105&&bytes[offset+5]===115&&bytes[offset+6]===112&&bytes[offset+7]===101&&view.getUint32(offset)>=20&&offset+view.getUint32(offset)<=length&&view.getUint32(offset+8)===0){
      const size=dimensions(view.getUint32(offset+12),view.getUint32(offset+16));
      // Return an unsafe extent immediately so a smaller-area auxiliary image
      // with an excessive edge cannot be masked by the main picture's area.
      if(size&&!withinSourceBudget(size))return size;
      if(size&&(!largest||size.width*size.height>largest.width*largest.height))largest=size;
    }return largest;
  }
  return null;
}
export class ScanPhotoError extends Error{
  constructor(public code:'file'|'header'|'dimensions'|'decode'){super(code);this.name='ScanPhotoError';}
}
type PhotoJob={stopped:boolean;disposed:boolean;cancel:()=>void;cancelled:Promise<null>;image?:HTMLImageElement;url?:string;canvas?:HTMLCanvasElement};
type PhotoSessionOptions={isCurrent?:()=>boolean;createImage?:()=>HTMLImageElement;createCanvas?:()=>HTMLCanvasElement;createObjectURL?:(file:Blob)=>string;revokeObjectURL?:(url:string)=>void};
/** A full decoder exists only during one bounded read. The caller receives a
 * canvas within the 8MP scan budget and may retain the compressed File for a
 * later original-resolution crop without retaining its decoded source image. */
export function createScanPhotoSession({isCurrent=()=>true,createImage=()=>new Image(),createCanvas=()=>document.createElement('canvas'),createObjectURL=file=>URL.createObjectURL(file),revokeObjectURL=url=>URL.revokeObjectURL(url)}:PhotoSessionOptions={}){
  let active:PhotoJob|null=null;
  function dispose(job:PhotoJob){
    if(job.disposed)return;job.disposed=true;if(job.image){try{job.image.src='';}catch{}job.image=null;}
    if(job.url){revokeObjectURL(job.url);job.url=null;}if(job.canvas){job.canvas.width=0;job.canvas.height=0;job.canvas=null;}
  }
  function stop(){if(active){active.stopped=true;active.cancel();dispose(active);active=null;}}
  async function read(file:File,requested:ScanBounds={left:0,top:0,width:1,height:1}):Promise<HTMLCanvasElement|null>{
    stop();let cancel:()=>void;const cancelled=new Promise<null>(resolve=>{cancel=()=>resolve(null);}),job:PhotoJob={stopped:false,disposed:false,cancel:cancel!,cancelled};active=job;
    const current=()=>active===job&&!job.stopped&&isCurrent();
    try{
      if(!current())return null;
      if(!file||file.size<=0||file.size>20*1024*1024||!/^image\/(jpeg|png|webp|avif|heic|heif|bmp)$/i.test(file.type))throw new ScanPhotoError('file');
      // Compressed input itself is bounded to 20MB. Reading all bytes ensures
      // late AVIF/HEIF spatial properties cannot evade the dimensions guard.
      const buffer=await Promise.race([file.slice(0,20*1024*1024).arrayBuffer(),job.cancelled]);if(!buffer||!current())return null;
      const dimensions=readScanImageDimensions(new Uint8Array(buffer));if(!dimensions)throw new ScanPhotoError('header');if(!withinSourceBudget(dimensions))throw new ScanPhotoError('dimensions');
      const image=createImage();job.image=image;job.url=createObjectURL(file);image.src=job.url;
      await Promise.race([image.decode(),job.cancelled]);if(!current())return null;
      const actual={width:image.naturalWidth,height:image.naturalHeight};if(!withinSourceBudget(actual)||actual.width<=0||actual.height<=0)throw new ScanPhotoError('dimensions');
      const region=normalizeScanRegion(requested);if(!region)throw new ScanPhotoError('dimensions');
      const crop={left:region.left*actual.width,top:region.top*actual.height,width:region.width*actual.width,height:region.height*actual.height},size=scanCanvasSize(crop.width,crop.height),canvas=createCanvas();job.canvas=canvas;
      canvas.width=size.width;canvas.height=size.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,crop.left,crop.top,crop.width,crop.height,0,0,canvas.width,canvas.height);
      if(!current())return null;job.canvas=null;return canvas;
    }catch(error){if(!current())return null;if(error instanceof ScanPhotoError)throw error;throw new ScanPhotoError('decode');}
    finally{dispose(job);if(active===job)active=null;}
  }
  return {read,stop};
}
