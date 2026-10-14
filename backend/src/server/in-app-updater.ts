import {randomUUID} from 'node:crypto';
import {compareVersions} from './version-check.js';
import {InputError} from '../shared/model.js';
export function createInAppUpdater({version,updater,coordinator,backups,verifyIdentity,now=Date.now}:{version:string;updater:any;coordinator:any;backups:any;verifyIdentity:any;now?:()=>number}){
    let busy=false;const attempts=new Map<number,{n:number;until:number}>();
    return {async start(input:any,{owner,beginMaintenance,cancelled,record}:any){
        if(input.confirmed!==true)throw new InputError('Update bitte ausdrücklich bestätigen.');
        try{if(compareVersions(version,input.version)>=0)throw Error();}catch{throw new InputError('Bitte eine neuere stabile Releaseversion auswählen.');}
        if(busy)throw new InputError('Ein Update wird bereits vorbereitet.',409);busy=true;let release=()=>{};
        try{
            const current=owner(),available=await updater.status();owner();if(!available.available)throw new InputError(available.message||'Updaterdienst ist nicht verfügbar.',503);if(available.recoveryRequired||!['idle','complete','failed'].includes(available.state))throw new InputError('Ein Update läuft bereits oder benötigt Wiederherstellung.',409);
            await coordinator.run(async()=>{
                owner();let item=attempts.get(current.user.id);if(!item||item.until<=now()){item={n:0,until:now()+900000};attempts.set(current.user.id,item);}if(++item.n>10)throw new InputError('Zu viele Bestätigungsversuche. Bitte in 15 Minuten erneut versuchen.',429);
                await verifyIdentity(current.user.id,input.password,input.factor,owner);owner();release=beginMaintenance();
            });
            const backup=await backups.create({id:current.user.id,name:current.user.displayName,source:'user'},'manual',owner);owner();if(cancelled())throw new InputError('Updatebestätigung wurde abgebrochen.',409);
            const id=randomUUID();await coordinator.run(()=>{owner();record({id,version:input.version,backupId:backup.id});});owner();
            try{return {...await updater.start({id,version:input.version}),backupId:backup.id,accepted:true};}catch(error){if(error instanceof InputError)throw error;throw new InputError('Update konnte nicht an den Updaterdienst übergeben werden.',503);}
        }finally{release();busy=false;}
    }};
}
