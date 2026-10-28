import {readFile,stat} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {gzip,constants} from 'node:zlib';
import {promisify} from 'node:util';

const zip=promisify(gzip);
type Entry={stamp:string;plain:Buffer;gzip?:Buffer;pending?:Promise<void>;checked:boolean;weight:number};
type Options={maxCacheBytes?:number;readFile?:(path:string)=>Promise<Buffer>;stat?:(path:string)=>Promise<BigIntStats>;compress?:(bytes:Buffer)=>Promise<Buffer>};

export function acceptsGzip(header:string|string[]|undefined):boolean{
 let explicit:number|undefined,wildcard:number|undefined;
 for(const part of (Array.isArray(header)?header.join(','):header??'').split(',')){
  const [token,...parameters]=part.trim().toLowerCase().split(';'),name=token.trim();
  if(name!=='gzip'&&name!=='*')continue;
  const quality=parameters.map(p=>p.trim()).filter(p=>/^q\s*=/.test(p));
  const raw=quality[0]?.replace(/^q\s*=\s*/,'');
  const q=!quality.length?1:quality.length===1&&/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw??'')?Number(raw):0;
  if(name==='gzip')explicit=explicit===undefined?q:Math.min(explicit,q);
  else wildcard=wildcard===undefined?q:Math.min(wildcard,q);
 }
 return (explicit??wildcard??0)>0;
}

// Only immutable application assets belong here, never API or uploaded data.
// Every HTTP request still performs its original authorization checks.
export function createStaticAssetReader(options:Options={}){
 const max=options.maxCacheBytes??16*1024*1024,read=options.readFile??readFile;
 const inspect=options.stat??(path=>stat(path,{bigint:true}));
 const compress=options.compress??(bytes=>zip(bytes,{level:constants.Z_BEST_SPEED}));
 const cache=new Map<string,Entry>(),loads=new Map<string,{stamp:string;promise:Promise<Entry>}>();let retained=0;
 function drop(path:string){const entry=cache.get(path);if(entry){retained-=entry.weight;cache.delete(path);}}
 function retain(path:string,entry:Entry){
  drop(path);entry.weight=entry.plain.length+(entry.gzip?.length??0);
  if(entry.weight>max||max<=0)return;
  cache.set(path,entry);retained+=entry.weight;
  while(retained>max||cache.size>128)drop(cache.keys().next().value!);
 }
 async function load(path:string):Promise<Entry>{
  const meta=await inspect(path),stamp=[meta.dev,meta.ino,meta.size,meta.mtimeNs,meta.ctimeNs].join(':');
  const hit=cache.get(path);
  if(hit?.stamp===stamp){cache.delete(path);cache.set(path,hit);return hit;}
  if(hit)drop(path);
  const pending=loads.get(path);if(pending?.stamp===stamp)return pending.promise;
  const current={stamp,promise:undefined as unknown as Promise<Entry>};
  current.promise=(async()=>{
   try{
    const entry:Entry={stamp,plain:await read(path),checked:false,weight:0};
    // A slower old read cannot replace an entry loaded after a file change.
    if(loads.get(path)===current)retain(path,entry);
    return entry;
   }finally{if(loads.get(path)===current)loads.delete(path);}
  })();
  loads.set(path,current);return current.promise;
 }
 return {async read(path:string,gzipAllowed=false):Promise<{body:Buffer;encoding?:'gzip'}>{
  const entry=await load(path);
  if(gzipAllowed&&entry.plain.length>=1024&&!entry.checked){
   entry.pending??=(async()=>{
    try{const zipped=await compress(entry.plain);if(zipped.length<entry.plain.length)entry.gzip=zipped;}
    catch{/* Encoding is optional; a failed compressor must not break the asset. */}
    finally{entry.checked=true;entry.pending=undefined;if(cache.get(path)===entry)retain(path,entry);}
   })();
   await entry.pending;
  }
  return gzipAllowed&&entry.gzip?{body:entry.gzip,encoding:'gzip'}:{body:entry.plain};
 }};
}
