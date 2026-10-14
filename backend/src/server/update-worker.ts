import {compareVersions} from './version-check.js';
export type UpdateJob = {id?:string;version?:string;previousVersion?:string;state:string;startedAt?:string;finishedAt?:string;message?:string;rolledBack?:boolean;recoveryRequired?:boolean};
export const updateBusy = (state:string) => ['queued','downloading','validating','backingUp','installing','restarting','rollingBack'].includes(state);
export function createUpdateWorker({adapter,download,saveState,initialState={state:'idle'},now=Date.now}:{adapter:any;download:(version:string,id:string)=>Promise<string>;saveState:(value:UpdateJob)=>void;initialState?:UpdateJob;now?:()=>number}){
    let state:UpdateJob={...initialState},pending:Promise<void>|null=null;
    const status=()=>({...state});
    function step(next:string){state={...state,state:next};saveState(status());}
    async function run(version:string,id:string){
        try{
            step('downloading');const file=await download(version,id);
            step('validating');await adapter.prepare(file,version,id);
            step('backingUp');await adapter.snapshot(id);
            step('installing');await adapter.activate(id);
            step('restarting');await adapter.restart(version);
            await adapter.commit(id);
            state={...state,state:'complete',finishedAt:new Date(now()).toISOString(),message:'Update erfolgreich installiert.'};saveState(status());adapter.unlock();
        }catch{
            let rolledBack=false,recoveryRequired=false;
            try{step('rollingBack');rolledBack=await adapter.rollback(id);}catch{recoveryRequired=true;}
            state={...state,state:'failed',finishedAt:new Date(now()).toISOString(),rolledBack,recoveryRequired,message:recoveryRequired?'Automatische Wiederherstellung fehlgeschlagen. Dienstprotokoll prüfen; Wartungsmodus bleibt aktiv.':rolledBack?'Update fehlgeschlagen. Vorherige Version und Daten wurden wiederhergestellt.':'Update fehlgeschlagen. Die bestehende Installation bleibt erhalten.'};
            try{saveState(status());}catch{state.recoveryRequired=true;}
            if(!state.recoveryRequired)adapter.unlock();
        }
    }
    return {status,wait:async()=>{await pending;},start({id,version}:{id:string;version:string}){
        if(state.recoveryRequired)throw Error('Eine manuelle Wiederherstellung ist erforderlich.');
        if(pending||updateBusy(state.state))throw Error('Ein Update läuft bereits.');
        if(typeof id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw Error('Ungültiger Updateauftrag.');
        const previousVersion=adapter.installed();if(compareVersions(previousVersion,version)>=0)throw Error('Nur eine neuere stabile Version kann installiert werden.');
        state={id,version,previousVersion,state:'queued',startedAt:new Date(now()).toISOString()};
        let locked=false;try{adapter.lock(id);locked=true;saveState(status());}catch(error){if(locked)adapter.unlock();state={state:'idle'};throw error;}
        const accepted=status();pending=run(version,id).finally(()=>{pending=null;});return accepted;
    }};
}
