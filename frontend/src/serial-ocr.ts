import {extractPdfSerialCandidates} from './pdf-serial-scan.js';
import {type ScanBounds} from './scan-preview.js';

export type SerialOcrCandidate={value:string;confidence?:number;bounds?:ScanBounds[]};
type OcrBox={x0:number;y0:number;x1:number;y1:number};
type OcrWord={text?:string;confidence?:number;bbox?:OcrBox};
type OcrLine={text?:string;confidence?:number;bbox?:OcrBox;words?:OcrWord[]};
type OcrData={text?:string;confidence?:number;blocks?:Array<{paragraphs?:Array<{lines?:OcrLine[]}>}>};
type OcrWorker={setParameters:(parameters:Record<string,string>)=>Promise<unknown>;recognize:(canvas:any,options:object,output:object)=>Promise<{data:OcrData}>;terminate:()=>unknown};
type OcrWorkerOptions={workerPath:string;corePath:string;langPath:string;workerBlobURL:boolean;cacheMethod:string;gzip:boolean;logger:(message:{status?:string;progress?:number})=>void;errorHandler:(error:unknown)=>void;signal:AbortSignal};
type CreateOcrWorker=(languages:string[],oem:number,options:OcrWorkerOptions)=>Promise<OcrWorker>;
type SerialOcrOptions={isCurrent?:()=>boolean;onProgress?:(fraction:number)=>void;createWorker?:CreateOcrWorker;includeBounds?:boolean};
type WorkerResource={worker:OcrWorker|null;promise:Promise<OcrWorker|null>|null;disposed:boolean;terminated:boolean;controller:AbortController};
type OcrJob={stopped:boolean;cancel:()=>void;cancelled:Promise<null>};
type ConfidenceLine={text:string;confidence?:number};

async function createLocalWorker(languages:string[],oem:number,options:OcrWorkerOptions):Promise<OcrWorker>{
  const library=await import('/vendor/ocr/tesseract.esm.min.js');
  return library.createWorker(languages,oem,options);
}
function confidence(value:unknown):number|undefined{
  return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):undefined;
}
function positioned(box:OcrBox|undefined):box is OcrBox{
  return !!box&&[box.x0,box.y0,box.x1,box.y1].every(Number.isFinite)&&box.x1>=box.x0&&box.y1>box.y0;
}
/** Reuse the PDF parser's field/context rules; OCR never corrects ambiguous characters. */
function candidatesFromData(data:OcrData,includeBounds=false):SerialOcrCandidate[]{
  const items:Array<{str:string;transform:number[];width:number;height:number}>=[],lines:ConfidenceLine[]=[];
  const observedWords:Array<{text:string;box:OcrBox}>=[];
  const addLine=(line:OcrLine,index:number)=>{
    const words=(line.words??[]).filter(word=>typeof word.text==='string'&&word.text.trim());
    const text=typeof line.text==='string'&&line.text.trim()?line.text.trim():words.map(word=>word.text).join(' ');
    if(!text)return;
    if(includeBounds){
      for(const word of words)if(positioned(word.bbox))observedWords.push({text:word.text!.trim(),box:word.bbox});
      if(!words.length&&positioned(line.bbox))observedWords.push({text,box:line.bbox});
    }
    const lineConfidence=confidence(line.confidence)??confidence(data.confidence);
    lines.push({text,confidence:lineConfidence});
    const box=positioned(line.bbox)?line.bbox:{x0:0,y0:index*24,x1:text.length*8,y1:index*24+16};
    const height=Math.max(1,box.y1-box.y0);
    const add=(str:string,x:number,width:number)=>items.push({str,transform:[height,0,0,height,x,-box.y1],height,width});
    // Words share a line baseline even when their individual boxes have
    // descenders; their horizontal gaps keep neighboring stickers separate.
    if(words.length&&words.every(word=>positioned(word.bbox)))for(const word of words)add(word.text!,word.bbox!.x0,word.bbox!.x1-word.bbox!.x0);
    else add(text,box.x0,box.x1-box.x0);
  };
  for(const block of data.blocks??[])for(const paragraph of block.paragraphs??[])for(const line of paragraph.lines??[])addLine(line,lines.length);
  if(!items.length&&typeof data.text==='string')for(const text of data.text.split(/\r?\n/))addLine({text,confidence:data.confidence},lines.length);
  return extractPdfSerialCandidates([{pageNumber:1,items}]).map(candidate=>{
    const escaped=candidate.value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const token=new RegExp('(?:^|[^A-Za-z0-9._/-])'+escaped+'(?:$|[^A-Za-z0-9._/-])');
    const observed=lines.filter(line=>token.test(line.text)).map(line=>line.confidence).filter((value):value is number=>value!==undefined);
    const bounds=observedWords.filter(word=>word.text===candidate.value).map(({box})=>({left:box.x0,top:box.y0,width:box.x1-box.x0,height:box.y1-box.y0}));
    return {value:candidate.value,...(observed.length?{confidence:Math.min(...observed)}:{}),...(bounds.length?{bounds}: {})};
  });
}

/** One local worker per session; sequential PDF pages share its loaded models. */
export function createSerialOcrSession({isCurrent=()=>true,onProgress=()=>{},createWorker=createLocalWorker,includeBounds=false}:SerialOcrOptions={}){
  let resource:WorkerResource|null=null,active:OcrJob|null=null;
  const current=(job:OcrJob)=>active===job&&!job.stopped&&isCurrent();
  function dispose(entry:WorkerResource|null){
    if(!entry)return;entry.disposed=true;entry.controller.abort();
    if(entry.worker&&!entry.terminated){entry.terminated=true;try{Promise.resolve(entry.worker.terminate()).catch(()=>{});}catch{}}
  }
  function stop(){
    if(active){active.stopped=true;active.cancel();active=null;}
    dispose(resource);resource=null;
  }
  function loadWorker(){
    if(resource)return resource;
    const entry:WorkerResource={worker:null,promise:null,disposed:false,terminated:false,controller:new AbortController()};resource=entry;
    const usable=()=>resource===entry&&!entry.disposed&&isCurrent();
    entry.promise=(async()=>{
      try{
        const worker=await createWorker(['eng','deu'],1,{
          workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr/core',langPath:'/vendor/ocr/lang',
          workerBlobURL:false,cacheMethod:'none',gzip:true,
          signal:entry.controller.signal,
          // Rejected jobs already reject their promise; suppress the library's
          // additional uncaught throw from its worker-message callback.
          errorHandler:()=>{},
          logger:message=>{if(usable()&&active&&current(active)&&message.status==='recognizing text'&&Number.isFinite(message.progress))onProgress(Math.max(0,Math.min(1,message.progress)));},
        });
        entry.worker=worker;
        if(!usable()){dispose(entry);return null;}
        await worker.setParameters({tessedit_pageseg_mode:'11',user_defined_dpi:'300',preserve_interword_spaces:'1'});
        if(!usable()){dispose(entry);return null;}return worker;
      }catch(error){dispose(entry);throw error;}
    })();
    return entry;
  }
  async function read(canvas:any):Promise<SerialOcrCandidate[]|null>{
    // A new image may supersede recognition, but idle workers stay reusable.
    if(active)stop();
    let cancel:()=>void;const cancelled=new Promise<null>(resolve=>{cancel=()=>resolve(null);});
    const job:OcrJob={stopped:false,cancel:cancel!,cancelled};active=job;
    if(!current(job)){stop();return null;}
    let entry:WorkerResource|null=null;
    try{
      onProgress(0);entry=loadWorker();
      const worker=await Promise.race([entry.promise!,job.cancelled]);
      if(!worker||!current(job))return null;
      // Tesseract termination does not reject all outstanding jobs. Race our
      // cancellation signal so closing a dialog releases its caller at once.
      const recognized=await Promise.race([worker.recognize(canvas,{},{blocks:true,text:true}),job.cancelled]);
      if(!recognized||!current(job))return null;
      const candidates=candidatesFromData(recognized.data,includeBounds);if(!current(job))return null;
      onProgress(1);return candidates;
    }catch(error){
      if(!current(job))return null;
      dispose(entry);if(resource===entry)resource=null;throw error;
    }finally{
      if(active===job){if(!current(job)){dispose(entry);if(resource===entry)resource=null;}active=null;}
    }
  }
  return {read,stop};
}
