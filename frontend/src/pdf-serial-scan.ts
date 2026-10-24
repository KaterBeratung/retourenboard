import {scanCanvasSize,mapScanBounds,type ScanBounds} from './scan-preview.js';
type PdfTextItem={str?:string;transform?:number[];width?:number;height?:number;hasEOL?:boolean};
type PdfTextPage={pageNumber:number;items:PdfTextItem[]};
type TextRun={text:string;x:number;y:number;width:number;height:number};
export type PdfSerialLocation={pageNumber:number;bounds:ScanBounds;pdf?:boolean};
export type PdfSerialCandidate={value:string;pages:number[];source:'label'|'layout'|'barcode'|'ocr';confidence?:number;locations?:PdfSerialLocation[]};
export type PdfSerialResult={candidates:PdfSerialCandidate[];pagesRead:number;totalPages:number;truncated:boolean;hasText:boolean;candidatesLimited:boolean;ocrUnavailable?:boolean};
const MAX_FILE_BYTES=20*1024*1024,MAX_PAGES=20,MAX_CANDIDATES=500;
const serialLabel=/\b(?:serien[ -]?(?:nummern?|nr)|serial(?:[ -]*(?:numbers?|no|nr))?|s\s*[\/.-]?\s*nr?|service[ -]*tag)\b(?=\s|[.:#=]|$)\.?\s*[:#=]?\s*/gi;
const otherField=/^(?:modell?|product|produkt|sku|article|artikel|part|bestell(?:ung|nummer)?|auftrag(?:snummer)?|order|invoice|rechnung|ean|gtin|upc|datum|date)(?:\s*(?:number|no\.?|nr\.?))?(?:\s*[:#=]|$)/i;

function cleanValue(value:unknown):string|null{
  if(typeof value!=='string')return null;
  const text=value.trim();return text.length>0&&text.length<=500&&!/[\u0000-\u001f\u007f]/.test(text)?text:null;
}
function serialToken(value:string){
  return value.length<=128&&/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)&&!/^\d{4}-\d{2}-\d{2}$/.test(value)&&!/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(value);
}
function unlabelledSerial(value:string){
  return serialToken(value)&&/^[A-Z0-9_-]{6,32}$/.test(value)&&/[0-9]/.test(value)&&(value.match(/[A-Z]/g)?.length??0)>=3
    &&contextualSerial(value);
}
function contextualSerial(value:string){
  return serialToken(value)&&value.length>=5&&value.length<=32&&/[0-9]/.test(value)
    &&!/^\d+(?:GB|TB|MB|MHZ|GHZ|MAH|HZ|MM|CM)$/i.test(value)
    &&!/^(?:XPS|OPTIPLEX|LATITUDE|THINKPAD|IDEAPAD|PROBOOK|ELITEBOOK|RTX|GTX|DDR|ORDER|ORD|SKU|EAN|UPC)\d/i.test(value);
}
function productHeading(value:string){
  const text=value.replace(/^(?:product|produkt)\s*[:#=]\s*/i,'');
  return !otherField.test(text)&&text.split(/\s+/).length>=2
    &&/\b(?:desktop|notebook|laptop|computer|pc|server|workstation|monitor|tablet|phone|printer|scanner|optiplex|latitude|thinkpad|ideapad|probook|elitebook)\b/i.test(text);
}
function labelledValues(text:string){
  const values:string[]=[];
  for(const segment of text.split(/[,;]+/)){
    const tokens:string[]=[];
    for(const token of segment.trim().split(/\s+/)){if(otherField.test(token))break;tokens.push(token);}
    // A label followed by prose is not a list, even if one word resembles a code.
    if(tokens.length&&tokens.every(value=>serialToken(value)&&(/[0-9]/.test(value)||/^[A-Z]{3,}$/.test(value))))values.push(...tokens);
  }
  return values;
}
/** PDF stream order and hasEOL flags can cross sticker columns. Use baselines and gaps. */
function textRuns(items:PdfTextItem[]):TextRun[]{
  const pieces=items.filter(item=>typeof item.str==='string'&&item.str.trim()).map((item,index)=>({
    text:item.str.replace(/[\u00a0\u2000-\u200a\u202f]/g,' ').trim(),
    x:Number.isFinite(item.transform?.[4])?item.transform[4]:0,
    y:Number.isFinite(item.transform?.[5])?item.transform[5]:-index*12,
    width:Math.max(0,item.width??0),height:Math.max(1,Math.abs(item.height||item.transform?.[3]||10)),
  })).sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows:TextRun[][]=[];
  for(const piece of pieces){const row=rows.at(-1);if(row&&Math.abs(row[0].y-piece.y)<=Math.max(1,Math.min(row[0].height,piece.height)*.28))row.push(piece);else rows.push([piece]);}
  const runs:TextRun[]=[];
  for(const row of rows){
    row.sort((a,b)=>a.x-b.x);let run:TextRun=null;
    for(const piece of row){
      const gap=run?piece.x-run.x-run.width:Infinity;
      // Ordinary word gaps join fragments; larger gaps separate sticker/table
      // columns. A label can own its immediately adjacent value across a tab.
      const labelAtEnd=run&&[...run.text.matchAll(new RegExp(serialLabel.source,'gi'))].some(label=>label.index+label[0].length===run.text.length);
      const maxGap=labelAtEnd?Math.max(15,piece.height*3):Math.max(3,Math.min(run?.height??piece.height,piece.height)*1.25);
      if(!run||gap>maxGap){run={...piece};runs.push(run);}
      else{run.text+=(gap>Math.min(run.height,piece.height)*.2?' ':'')+piece.text;run.width=Math.max(run.width,piece.x+piece.width-run.x);run.height=Math.max(run.height,piece.height);}
    }
  }
  return runs;
}
function precedingRun(run:TextRun,runs:TextRun[]){
  return runs.filter(above=>above!==run&&above.y>run.y&&above.y-run.y<=Math.max(24,run.height*3)&&Math.abs(above.x-run.x)<=Math.max(12,run.height*2)).sort((a,b)=>a.y-b.y)[0];
}
function mergeCandidates(candidates:PdfSerialCandidate[]){
  const unique=new Map<string,PdfSerialCandidate>();
  for(const candidate of candidates){
    const old=unique.get(candidate.value);
    if(old){for(const page of candidate.pages)if(!old.pages.includes(page))old.pages.push(page);if(candidate.source==='label')old.source='label';if(candidate.locations?.length)old.locations=[...(old.locations??[]),...candidate.locations];if(old.confidence===undefined&&candidate.confidence!==undefined)old.confidence=candidate.confidence;}
    else unique.set(candidate.value,{...candidate,pages:[...candidate.pages]});
  }
  return [...unique.values()];
}
/** Conservative guesses stay candidates: the dialog always requires a user selection. */
export function extractPdfSerialCandidates(pages:PdfTextPage[],includeBounds=false):PdfSerialCandidate[]{
  const found:Array<PdfSerialCandidate&{header?:string;context?:boolean}>=[];
  for(const page of pages){
    const runs=textRuns(page.items),pageFound:Array<PdfSerialCandidate&{header?:string;context?:boolean;x:number;y:number}>=[];
    const add=(value:string,run:TextRun,source:'label'|'layout',extra:{header?:string;context?:boolean}={})=>pageFound.push({value,pages:[page.pageNumber],source,x:run.x,y:run.y,...extra});
    for(const run of runs){
      const labels=[...run.text.matchAll(new RegExp(serialLabel.source,'gi'))];
      if(labels.length){
        for(let index=0;index<labels.length;index++){
          const label=labels[index],end=index+1<labels.length?labels[index+1].index:run.text.length;
          const tail=run.text.slice(label.index+label[0].length,end).replace(/^[\s.:#=-]+/,'').trim();
          const values=labelledValues(tail);
          for(const value of values)add(value,run,'label');
          // Empty headings define a column; plural headings can introduce a
          // list continued on later lines. Stop at a new field or prose.
          if(index===labels.length-1&&(!tail||(/numbers|nummern/i.test(label[0])&&values.length))){
            const tolerance=Math.max(12,run.height*2);
            const neighbour=runs.find(next=>next!==run&&Math.abs(next.y-run.y)<=Math.max(1,run.height*.28)&&next.x>run.x);
            const right=neighbour?.x??run.x+Math.max(run.width,tolerance);
            let previous=run,wrapped=/^serial\s*[:#=]?$/i.test(run.text);
            for(const below of runs.filter(next=>next.y<run.y&&next.x>=run.x-tolerance&&next.x<right)){
              if(previous.y-below.y>Math.max(24,Math.max(previous.height,below.height)*3))break;
              if(wrapped&&/^(?:numbers?|no|nr)\.?\s*[:#=]?$/i.test(below.text)){previous=below;wrapped=false;continue;}
              wrapped=false;
              if(otherField.test(below.text)||new RegExp(serialLabel.source,'i').test(below.text))break;
              const nextValues=labelledValues(below.text);if(!nextValues.length)break;
              for(const value of nextValues)add(value,below,'label');
              previous=below;
            }
          }
        }
      }else if(contextualSerial(run.text)){
        const above=precedingRun(run,runs);
        const context=!!above&&productHeading(above.text);
        if(context||((!above||!otherField.test(above.text))&&unlabelledSerial(run.text)))add(run.text,run,'layout',{header:above?.text,context});
      }
    }
    found.push(...pageFound.sort((a,b)=>b.y-a.y||a.x-b.x).map(({x,y,...candidate})=>candidate));
  }
  // An isolated unidentified product code is insufficient. A repeated sticker
  // heading or several distinct serial-like values establishes a useful list.
  const shapes=new Map<number,Set<string>>(),headings=new Map<string,number>();
  for(const candidate of found)if(candidate.source==='layout'){
    const group=shapes.get(candidate.value.length)??new Set();group.add(candidate.value);shapes.set(candidate.value.length,group);
    if(candidate.header)headings.set(candidate.header,(headings.get(candidate.header)??0)+1);
  }
  return mergeCandidates(found.filter(candidate=>candidate.source==='label'||candidate.context||(shapes.get(candidate.value.length)?.size??0)>1||(headings.get(candidate.header)??0)>1).map(({header,context,...candidate})=>{
    if(!includeBounds)return candidate;
    // Whole text items are defensible; a character offset in proportional PDF
    // text is not. Mixed label/value items intentionally have no highlight.
    // The axis-aligned box below supports upright horizontal text only. A
    // rotated, sheared or mirrored transform needs glyph geometry we do not
    // have; retain its candidate and let the dialog show its comparison hint.
    const locations=pages.filter(page=>candidate.pages.includes(page.pageNumber)).flatMap(page=>page.items.filter(item=>item.str?.trim()===candidate.value&&item.transform?.length>=6&&item.transform.every(Number.isFinite)&&item.transform[0]>0&&item.transform[1]===0&&item.transform[2]===0&&item.transform[3]>0&&item.width>0&&item.height>0).map(item=>({pageNumber:page.pageNumber,pdf:true,bounds:{left:item.transform[4],top:item.transform[5]-item.height*.2,width:item.width,height:item.height}})));
    return {...candidate,...(locations.length?{locations}:{})};
  }));
}

export class PdfSerialScanError extends Error{
  constructor(public code:'size'|'type'|'password'|'invalid'|'unavailable'){super(code);this.name='PdfSerialScanError';}
}
let pdfLibrary:Promise<any>|null=null;
function loadPdfJs(){
  pdfLibrary??=import('/vendor/pdfjs/pdf.min.mjs').catch(error=>{pdfLibrary=null;throw error;});return pdfLibrary;
}
type PdfSessionOptions={loadPdfJs?:()=>Promise<any>;decodeBarcode?:(canvas:HTMLCanvasElement)=>unknown;recognizeText?:(canvas:HTMLCanvasElement)=>Promise<Array<{value:string;confidence?:number;bounds?:ScanBounds[]}>|null>;onProgress?:(page:number,total:number)=>void;createCanvas?:()=>HTMLCanvasElement;isCurrent?:()=>boolean;includeBounds?:boolean};
type PdfJob={stopped:boolean;disposed:boolean;loadingTask?:any;renderTask?:any;canvas?:HTMLCanvasElement};
/** Own each document/render separately so late work cannot outlive a new file or dialog. */
export function createPdfSerialSession({loadPdfJs:load=loadPdfJs,decodeBarcode,recognizeText,onProgress,createCanvas=()=>document.createElement('canvas'),isCurrent=()=>true,includeBounds=false}:PdfSessionOptions={}){
  let active:PdfJob|null=null;
  function dispose(job:PdfJob){
    if(job.disposed)return;job.disposed=true;
    try{job.renderTask?.cancel();}catch{}job.renderTask=null;
    try{Promise.resolve(job.loadingTask?.destroy()).catch(()=>{});}catch{}
    if(job.canvas){job.canvas.width=0;job.canvas.height=0;job.canvas=null;}
  }
  function stop(){if(active){active.stopped=true;dispose(active);active=null;}}
  async function read(file:File):Promise<PdfSerialResult|null>{
    stop();const job:PdfJob={stopped:false,disposed:false};active=job;
    const current=()=>active===job&&!job.stopped&&isCurrent();
    try{
      if(!file||file.size<=0||file.size>MAX_FILE_BYTES)throw new PdfSerialScanError('size');
      if(file.type!=='application/pdf'&&(!(file.type===''||file.type==='application/octet-stream')||!/\.pdf$/i.test(file.name)))throw new PdfSerialScanError('type');
      const data=new Uint8Array(await file.arrayBuffer());if(!current())return null;
      if(!new TextDecoder('latin1').decode(data.subarray(0,1024)).includes('%PDF-'))throw new PdfSerialScanError('invalid');
      let lib:any;try{lib=await load();}catch{throw new PdfSerialScanError('unavailable');}if(!current())return null;
      lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';
      job.loadingTask=lib.getDocument({data,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',isEvalSupported:false,enableXfa:false,canvasMaxAreaInBytes:8_000_000*4});
      const pdf=await job.loadingTask.promise;if(!current())return null;
      const pagesRead=Math.min(pdf.numPages,MAX_PAGES),pages:PdfTextPage[]=[],barcodes:PdfSerialCandidate[]=[];let hasText=false,ocrUnavailable=false;
      for(let number=1;number<=pagesRead;number++){
        const page=await pdf.getPage(number);if(!current())return null;
        onProgress?.(number,pagesRead);
        const text=await page.getTextContent();if(!current())return null;
        const hasPageText=text.items.some((item:PdfTextItem)=>item.str?.trim());hasText||=hasPageText;
        pages.push({pageNumber:number,items:text.items});
        const textCandidates=extractPdfSerialCandidates([{pageNumber:number,items:text.items}]);
        if(decodeBarcode||(recognizeText&&!textCandidates.length)){
          try{
            const view=page.getViewport({scale:1}),scale=Math.min(4,3200/Math.max(view.width,view.height),Math.sqrt(8_000_000/(view.width*view.height)));
            if(!Number.isFinite(scale)||scale<=0)throw new PdfSerialScanError('invalid');
            const viewport=page.getViewport({scale}),canvas=createCanvas();job.canvas=canvas;
            canvas.width=Math.max(1,Math.min(3200,Math.floor(viewport.width)));canvas.height=Math.max(1,Math.min(3200,Math.floor(viewport.height)));
            job.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:0});
            await job.renderTask.promise;job.renderTask=null;if(!current())return null;
            if(decodeBarcode){
              try{const decoded=await decodeBarcode(canvas);if(!current())return null;for(const raw of Array.isArray(decoded)?decoded:[decoded]){const value=cleanValue(raw);if(value)barcodes.push({value,pages:[number],source:'barcode'});}}catch{}
            }
            if(recognizeText&&!textCandidates.length){
              try{const decoded=await recognizeText(canvas);if(!current())return null;for(const raw of decoded??[]){const value=cleanValue(raw.value);const locations=includeBounds?(raw.bounds??[]).map(bounds=>mapScanBounds(bounds,canvas.width,canvas.height)).filter((bounds):bounds is ScanBounds=>!!bounds).map(bounds=>({pageNumber:number,bounds})):[];if(value)barcodes.push({value,pages:[number],source:'ocr',...(Number.isFinite(raw.confidence)?{confidence:Math.max(0,Math.min(100,raw.confidence))}:{}),...(locations.length?{locations}:{})});}}catch{ocrUnavailable=true;}
            }
          }catch(error){if(!current())return null;if(!textCandidates.length)throw error;}
          finally{if(job.canvas){job.canvas.width=0;job.canvas.height=0;job.canvas=null;}}
        }
        page.cleanup?.();
      }
      if(!current())return null;
      const candidates=mergeCandidates([...extractPdfSerialCandidates(pages,includeBounds),...barcodes]);
      return {candidates:candidates.slice(0,MAX_CANDIDATES),pagesRead,totalPages:pdf.numPages,truncated:pdf.numPages>MAX_PAGES,hasText,candidatesLimited:candidates.length>MAX_CANDIDATES,...(ocrUnavailable?{ocrUnavailable:true}:{})};
    }catch(error){
      if(!current())return null;
      if(error instanceof PdfSerialScanError)throw error;
      throw new PdfSerialScanError(error?.name==='PasswordException'?'password':'invalid');
    }finally{dispose(job);if(active===job)active=null;}
  }
  return {read,stop};
}

type PdfPreviewOptions={loadPdfJs?:()=>Promise<any>;createCanvas?:()=>HTMLCanvasElement;isCurrent?:()=>boolean;onPreview:(canvas:HTMLCanvasElement,pageNumber:number,totalPages:number,viewport:any)=>void};
type PdfPreviewJob=PdfJob&{cancel:()=>void;cancelled:Promise<null>};
/** Render one requested original page. The receiver copies pixels synchronously;
 * all page/document resources are then freed, including cancelled work. */
export function createPdfPreviewSession({loadPdfJs:load=loadPdfJs,createCanvas=()=>document.createElement('canvas'),isCurrent=()=>true,onPreview}:PdfPreviewOptions){
  let active:PdfPreviewJob|null=null;
  function dispose(job:PdfJob){if(job.disposed)return;job.disposed=true;try{job.renderTask?.cancel();}catch{}try{Promise.resolve(job.loadingTask?.destroy()).catch(()=>{});}catch{}if(job.canvas){job.canvas.width=0;job.canvas.height=0;job.canvas=null;}}
  function stop(){if(active){active.stopped=true;active.cancel();dispose(active);active=null;}}
  async function read(file:File,pageNumber=1):Promise<boolean>{
    stop();let cancel:()=>void;const cancelled=new Promise<null>(resolve=>{cancel=()=>resolve(null);});const job:PdfPreviewJob={stopped:false,disposed:false,cancel:cancel!,cancelled};active=job;
    const current=()=>active===job&&!job.stopped&&isCurrent();
    try{
      if(!current())return false;
      if(!file||file.size<=0||file.size>MAX_FILE_BYTES)throw new PdfSerialScanError('size');
      if(file.type!=='application/pdf'&&(!(file.type===''||file.type==='application/octet-stream')||!/\.pdf$/i.test(file.name)))throw new PdfSerialScanError('type');
      const bytes=await Promise.race([file.arrayBuffer(),job.cancelled]);if(!bytes||!current())return false;const data=new Uint8Array(bytes);
      if(!new TextDecoder('latin1').decode(data.subarray(0,1024)).includes('%PDF-'))throw new PdfSerialScanError('invalid');
      const lib=await Promise.race([load(),job.cancelled]);if(!lib||!current())return false;lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';
      job.loadingTask=lib.getDocument({data,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',isEvalSupported:false,enableXfa:false,canvasMaxAreaInBytes:8_000_000*4});
      const pdf=await Promise.race([job.loadingTask.promise,job.cancelled]);if(!pdf||!current())return false;
      const number=Math.max(1,Math.min(pdf.numPages,Number.isSafeInteger(pageNumber)?pageNumber:1)),page=await Promise.race([pdf.getPage(number),job.cancelled]);if(!page||!current())return false;
      const view=page.getViewport({scale:1}),size=scanCanvasSize(view.width*4,view.height*4),scale=Math.min(size.width/view.width,size.height/view.height),viewport=page.getViewport({scale});
      const canvas=createCanvas();job.canvas=canvas;canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
      job.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,annotationMode:0});await Promise.race([job.renderTask.promise,job.cancelled]);job.renderTask=null;if(!current())return false;
      onPreview(canvas,number,pdf.numPages,viewport);page.cleanup?.();return true;
    }finally{dispose(job);if(active===job)active=null;}
  }
  return {read,stop};
}
