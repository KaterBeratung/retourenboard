import {createReadStream,lstatSync,mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {list,extract} from '../vendor/archive.js';
import {compareVersions} from './version-check.js';
const roots=new Set(['package.json','package-lock.json','README.md','Dockerfile','.env.example','.dockerignore','dist','server','shared','public','scripts','deploy','tests','frontend','backend','website','previews','docs']);
function safePath(path:string){return path.length<350&&/^[\w.@+/-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>p==='..'||p==='.'||p==='')&&roots.has(path.split('/')[0]);}
function smallJson(path:string){if(lstatSync(path).size>65536)throw Error('Paketmetadaten sind zu groß.');return JSON.parse(readFileSync(path,'utf8'));}
export async function validateUpdatePackage({archive,target,version}:{archive:string;target:string;version:string}){
    compareVersions(version,version);const s=lstatSync(archive);if(!s.isFile()||s.isSymbolicLink()||s.size>128*1024*1024)throw Error('Ungültiges Updatearchiv.');
    try{if(lstatSync(target).isSymbolicLink()||readdirSync(target).length)throw Error('Updateziel muss leer sein.');}catch(error:any){if(error.code!=='ENOENT')throw error;}
    const members=new Set<string>();let total=0;
    await new Promise<void>((resolve,reject)=>{
        const source=createReadStream(archive);let timer:ReturnType<typeof setTimeout>;
        const parser:any=list({strict:true,maxDecompressionRatio:200,onReadEntry:(e:any)=>{
            const p=e.path.replace(/\/$/,'');total+=e.size;
            if(!safePath(p)||!['File','Directory'].includes(e.type)||members.has(p)||!Number.isSafeInteger(e.size)||e.size<0||e.size>128*1024*1024||total>512*1024*1024||members.size>=8000)parser.abort(Error('Archiv enthält unzulässige Links, Pfade oder Größen.'));
            else members.add(p);e.resume();
        }});
        const fail=(error:Error)=>{clearTimeout(timer);source.destroy();reject(error);};
        parser.on('error',fail);source.on('error',fail);parser.on('end',()=>{clearTimeout(timer);resolve();});timer=setTimeout(()=>parser.abort(Error('Zeitlimit der Archivprüfung überschritten.')),30000);source.pipe(parser);
    });
    for(const required of ['package.json','dist/package.json','dist/server/index.js','dist/server/app.js','dist/public/index.html','deploy/runtime-files.txt','deploy/compiled-runtime-files.txt'])if(!members.has(required))throw Error('Vollständiger kompilierter Build fehlt im Updatepaket.');
    mkdirSync(target,{recursive:true,mode:0o700});await extract({file:archive,cwd:target,strict:true,preserveOwner:false,noChmod:true,noMtime:true,maxDecompressionRatio:200});
    const pkg=smallJson(join(target,'package.json')),compiled=smallJson(join(target,'dist/package.json'));
    if(pkg.name!=='retourenboard'||compiled.name!=='retourenboard'||pkg.version!==version||compiled.version!==version||pkg.type!=='module'||compiled.type!=='module')throw Error('Paket und Release haben unterschiedliche Versionsmetadaten.');
    const engine=typeof pkg.engines?.node==='string'?pkg.engines.node.match(/^>=(\d+)\.(\d+)\.(\d+)$/):null;
    if(!engine||compareVersions(process.versions.node,engine.slice(1).join('.'))<0)throw Error('Das Release benötigt eine neuere Node.js-Laufzeit. Bitte manuell aktualisieren.');
    for(const manifest of ['runtime-files.txt','compiled-runtime-files.txt']){
        const file=join(target,'deploy',manifest);if(lstatSync(file).size>65536)throw Error('Laufzeitmanifest ist zu groß.');
        for(const name of readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean)){
            const path='dist/'+name.replace(/\/$/,'');if(!safePath(path)||!members.has(path))throw Error('Laufzeitdatei im Updatepaket fehlt oder ist ungültig.');
            const stat=lstatSync(join(target,path));if(name.endsWith('/')?!stat.isDirectory():!stat.isFile())throw Error('Laufzeitdatei im Updatepaket hat einen ungültigen Typ.');
        }
    }
    return target;
}
