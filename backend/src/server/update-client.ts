import {request} from 'node:http';
import {InputError} from '../shared/model.js';
import {UPDATE_SOCKET} from './update-linux.js';
export function createUpdateClient({socketPath=UPDATE_SOCKET,platform=process.platform}:{socketPath?:string;platform?:string}={}){
    function call(path:string,body?:any){return new Promise<any>((resolve,reject)=>{
        const req=request({socketPath,path,method:body?'POST':'GET',headers:{'Content-Type':'application/json'}},res=>{
            let size=0;const chunks:Buffer[]=[];res.on('data',chunk=>{size+=chunk.length;if(size>(path==='/server/logs'?256*1024:16384)){res.destroy();reject(Error('Ungültige Serverdienstantwort.'));}else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200&&res.statusCode!==202)throw new InputError(value.error||'Serverauftrag konnte nicht angenommen werden.',res.statusCode||503);resolve(value);}catch(error){reject(error);}});
        });req.setTimeout(path==='/server/logs'?7000:5000,()=>req.destroy(Error('Serverdienst antwortet nicht.')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
    });}
    return {async status(){if(platform!=='linux')return {available:false,state:'idle',message:'Der In-App-Updater benötigt eine Debian-/Ubuntu-Installation mit systemd.'};try{return {...await call('/status'),available:true};}catch{return {available:false,state:'idle',message:'Der Updaterdienst ist nicht erreichbar. Das aktuelle Linux-Installskript einmal auf dem Server ausführen.'};}},
        async start(input:{id:string;version:string}){if(platform!=='linux')throw new InputError('Updates sind nur in der verwalteten Linuxinstallation verfügbar.',503);try{return await call('/start',input);}catch(error){if(error instanceof InputError)throw error;throw new InputError('Der Updaterdienst ist nicht erreichbar. Status im Adminbereich prüfen.',503);}},
        async serverStatus(){if(platform!=='linux')return {available:false,state:'idle'};try{return await call('/server/status');}catch{return {available:false,state:'idle',message:'Serverdienst nicht erreichbar. Das aktuelle Linux-Installskript einmal ausführen.'};}},
        logs:()=>call('/server/logs'),prepareRestart:()=>call('/server/restart/prepare',{}),commitRestart:(id:string)=>call('/server/restart/commit',{id}),cancelRestart:(id:string)=>call('/server/restart/cancel',{id})
    };
}
