import {mkdirSync,mkdtempSync,openSync,writeSync,closeSync,readFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {compareVersions,VERSION_RELEASE_URL} from './version-check.js';
const allowedHosts=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
async function response(url:string,fetcher:typeof fetch,timeout:number){
    const signal=AbortSignal.timeout(timeout);
    for(let hop=0;hop<4;hop++){
        const r=await fetcher(url,{redirect:'manual',signal,headers:{Accept:url===VERSION_RELEASE_URL?'application/vnd.github+json':'application/octet-stream','User-Agent':'retourenboard-updater','X-GitHub-Api-Version':'2026-03-10'}});
        if([301,302,303,307,308].includes(r.status)){
            await r.body?.cancel();const next=new URL(r.headers.get('location')||'',url);
            if(url===VERSION_RELEASE_URL||next.protocol!=='https:'||!allowedHosts.has(next.hostname)||next.username||next.password||next.port&&next.port!=='443')throw Error('Unzulässige GitHub-Weiterleitung.');
            url=next.href;continue;
        }
        if(!r.ok){await r.body?.cancel();throw Error('GitHub-Download ist nicht verfügbar.');}return r;
    }
    throw Error('Zu viele GitHub-Weiterleitungen.');
}
async function save(url:string,file:string,max:number,fetcher:typeof fetch,timeout=120000){
    const r=await response(url,fetcher,timeout),reader=r.body?.getReader();if(!reader)throw Error('Leerer GitHub-Download.');
    const fd=openSync(file,'wx',0o600),hash=createHash('sha256');let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('GitHub-Antwort ist zu groß.');}hash.update(value);let offset=0;while(offset<value.byteLength)offset+=writeSync(fd,value,offset,value.byteLength-offset);}return hash.digest('hex');}
    catch(error){try{unlinkSync(file);}catch{}throw error;}finally{closeSync(fd);reader.releaseLock();}
}
export async function downloadUpdate(version:string,dir:string,{fetcher=fetch}:{fetcher?:typeof fetch}={}){
    compareVersions(version,version);mkdirSync(dir,{recursive:true,mode:0o700});const work=mkdtempSync(join(dir,'download-'));
    const metadata=join(work,'release.json');await save(VERSION_RELEASE_URL,metadata,128*1024,fetcher,8000);const release=JSON.parse(readFileSync(metadata,'utf8'));
    if(!release||release.draft||release.prerelease||!Array.isArray(release.assets)||!new RegExp(`^v?${version.replaceAll('.','\\.')}$`).test(release.tag_name))throw Error('Nur das neueste stabile GitHub-Release kann installiert werden.');
    const name=`retourenboard-linux-${version}.tar.gz`;for(const expected of [name,name+'.sha256'])if(!release.assets.some((asset:any)=>asset?.name===expected))throw Error('Das Release enthält kein vollständiges Linuxpaket mit Prüfsumme.');
    const source=`https://github.com/KaterBeratung/retourenboard/releases/download/${release.tag_name}/`,checksum=join(work,'checksum');await save(source+name+'.sha256',checksum,1024,fetcher,15000);
    const match=readFileSync(checksum,'utf8').match(/^([a-fA-F0-9]{64})[ \t]+\*?([^\r\n]+)\r?\n?$/);if(!match||match[2]!==name)throw Error('Die Release-Prüfsumme ist ungültig.');
    const file=join(work,name),digest=await save(source+name,file,128*1024*1024,fetcher);if(digest!==match[1].toLowerCase()){unlinkSync(file);throw Error('Prüfsumme des Linuxpakets stimmt nicht.');}return file;
}
