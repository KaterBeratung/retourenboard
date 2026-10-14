import {dirname,join} from 'node:path';import {lstatSync,readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {createApp} from './app.js';import {createRestoreController,type PreparedRestore,type RestoreOwner} from './restore-controller.js';import {createRestoreTransaction} from './restore-transaction.js';import {InputError} from '../shared/model.js';
import {assertRestoreSchema,assertRestoreFiles} from './restore-validation.js';
import {createServerLog} from './server-log.js';import {createUpdateClient} from './update-client.js';import {randomUUID} from 'node:crypto';
export function createRuntime(options:any){
 const dataDir=dirname(options.dbPath),transaction=createRestoreTransaction({dataDir,dbPath:options.dbPath});let app:any,closed=false,activation:Promise<void>|null=null,lastActivation:Promise<void>=Promise.resolve(),lastFailure='';
 const attempts=new Map<string,{n:number,until:number}>();
 const clock={now:options.now??Date.now};
 const serverLog=createServerLog({now:clock.now}),service=options.updateService??createUpdateClient();
 const managedService=options.managedService??(process.platform==='linux'&&options.dbPath==='/var/lib/retourenverwaltung/retouren.sqlite');
 let restartState:any={state:'idle'},lastRestart:Promise<void>=Promise.resolve();
 async function controlStatus(){const remote=await service.serverStatus?.();if(managedService)return {...remote,available:remote?.available===true,mode:'service',message:remote?.message||(!remote?.available?'Serverdienst nicht erreichbar. Aktuelles Linux-Installskript ausführen.':undefined)};if(restartState.state==='prepared'&&restartState.expiresAt<=clock.now())restartState={state:'idle'};return {available:!closed,mode:'application',...restartState,message:restartState.message||'Startet die Anwendung neu. Der Node.js-Prozess bleibt aktiv.'};}
 const serverControl={status:controlStatus,
  async logs(){if(managedService){const status=await controlStatus();if(status.available)return await service.logs();return {...serverLog.read(),message:'Dienstprotokoll nicht erreichbar. Es werden nur Anwendungsereignisse angezeigt.'};}return serverLog.read();},
  async prepareRestart(){if(closed||activation)throw new InputError('Eine Serverwartung läuft bereits.',409);const status=await controlStatus();if(!status.available)throw new InputError(status.message,503);if(['prepared','restarting'].includes(status.state))throw new InputError('Ein Neustart läuft bereits.',409);if(managedService)return service.prepareRestart();const update=await service.status?.();if(update?.recoveryRequired||update&& !['idle','complete','failed'].includes(update.state))throw new InputError('Ein Update läuft oder benötigt Wiederherstellung.',409);restartState={id:randomUUID(),state:'prepared',expiresAt:clock.now()+15000};return {mode:'application',...restartState};},
  async cancelRestart(id:string){if(managedService)return service.cancelRestart(id);if(restartState.state==='prepared'&&restartState.id===id)restartState={state:'idle'};},
  async commitRestart(id:string){
   if(managedService){await service.commitRestart(id);for(let i=0;i<120;i++){const status=await service.serverStatus();if(status.state==='complete')return;if(status.state==='failed'||!status.available)throw Error('Dienstneustart fehlgeschlagen.');await new Promise(r=>setTimeout(r,500));}throw Error('Dienstneustart dauert zu lange.');}
   if((await controlStatus()).state!=='prepared'||restartState.id!==id||activation||closed)throw new InputError('Ungültiger oder abgelaufener Neustartauftrag.',409);
   restartState={id,state:'restarting'};activation=(async()=>{const old=app,activeNetwork={...old.network},actualPort=old.server.address().port;let desired:any;
    try{desired=old.settings.network();await old.jobs.close();await old.backups.close();await old.mail.close();await old.close();await listen(undefined,desired.port===0?actualPort:undefined);restartState={id,state:'complete',message:'Neustart abgeschlossen.'};serverLog.write('info','Neustart abgeschlossen. Erneute Anmeldung erforderlich.');}
    catch(error){await app?.close();await listen(activeNetwork,actualPort);restartState={id,state:'failed',message:'Neustart fehlgeschlagen. Die vorherige Verbindung wurde wieder aktiviert.'};serverLog.write('error',restartState.message);throw error;}
   })();lastRestart=activation;try{await activation;}finally{activation=null;}
  }
 };
 const controller=createRestoreController({dataDir,clock,currentMfaKey:()=>{try{const path=join(dataDir,'secrets','mfa.key');if(lstatSync(join(dataDir,'secrets')).isSymbolicLink()||lstatSync(path).isSymbolicLink())return;const value=readFileSync(path);if(value.length===32)return value;}catch{}return;}});
 const adapter={controller,
  limitIdentity(owner:RestoreOwner){const key=String(owner.userId);let item=attempts.get(key);if(!item||item.until<=clock.now()){if(attempts.size>1000)for(const [k,v]of attempts)if(v.until<=clock.now())attempts.delete(k);item={n:0,until:clock.now()+900000};attempts.set(key,item);}if(++item.n>10)throw new InputError('Zu viele Bestätigungsversuche. Bitte in 15 Minuten erneut versuchen.',429);},
  activateRestore:(prepared:PreparedRestore)=>activateRestore(prepared),recordFailure:(_error:unknown)=>{lastFailure='Wiederherstellung fehlgeschlagen; der vorherige Bestand wurde wieder aktiviert.';console.error(lastFailure);}
 };
 async function listen(activeNetwork?:any,listenerPort?:number){
  app=createApp({...options,updateService:service,serverControl,serverLog,activeNetwork,runtime:adapter});try{options.onApp?.(app);await new Promise<void>((resolve,reject)=>{app.server.once('error',reject);app.server.listen(listenerPort??activeNetwork?.port??app.network.port,options.host??'127.0.0.1',()=>{app.server.removeListener('error',reject);resolve();});});serverLog.write('info',`Anwendungsserver gestartet. Interner Port ${app.server.address().port}.`);}catch(error){await app.close();throw error;}
 }
 function carryState(prepared:PreparedRestore,old:any,activeNetwork:any){
  const db=new DatabaseSync(join(prepared.preparedDir,'retouren.sqlite'));try{
   assertRestoreSchema(db);assertRestoreFiles(db,prepared.preparedDir);
   db.exec('BEGIN IMMEDIATE');
   // Preserve the actual listener; a saved pending port/domain change must not take effect during restore.
   db.exec('CREATE TABLE IF NOT EXISTS server_settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)');const row=db.prepare('SELECT value FROM server_settings WHERE id=1').get(),settings=row?JSON.parse(String(row.value)):{};settings.port=activeNetwork.port;if(activeNetwork.publicOrigin)settings.publicOrigin=activeNetwork.publicOrigin;else delete settings.publicOrigin;db.prepare('INSERT INTO server_settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(settings));
   for(const job of old.store.db.prepare('SELECT * FROM backup_jobs').all())db.prepare('INSERT OR REPLACE INTO backup_jobs(id,mode,state,createdAt,finishedAt,filename,size,error,metadata) VALUES(?,?,?,?,?,?,?,?,?)').run(job.id,job.mode,job.state,job.createdAt,job.finishedAt,job.filename,job.size,job.error,job.metadata);
   // Monotonic use markers prevent a restore of the same factor from making one-time codes usable again.
   for(const factor of old.store.db.prepare('SELECT m.*,u.usernameKey,u.passwordHash,u.passwordSalt FROM user_mfa m JOIN users u ON u.id=m.userId WHERE secretEnc IS NOT NULL').all()){
    const restored=db.prepare('SELECT m.*,u.usernameKey,u.passwordHash,u.passwordSalt FROM user_mfa m JOIN users u ON u.id=m.userId WHERE m.userId=?').get(factor.userId);
    if(!restored||restored.secretEnc!==factor.secretEnc||restored.usernameKey!==factor.usernameKey)continue;
    db.prepare('UPDATE user_mfa SET lastStep=MAX(lastStep,?) WHERE userId=?').run(factor.lastStep,factor.userId);
    const currentCodes=new Map((old.store.db.prepare('SELECT hash,usedAt FROM recovery_codes WHERE userId=?').all(factor.userId) as any[]).map(r=>[r.hash,r.usedAt]));
    for(const code of db.prepare('SELECT hash,usedAt FROM recovery_codes WHERE userId=?').all(factor.userId))if(!currentCodes.has(code.hash))db.prepare('UPDATE recovery_codes SET usedAt=COALESCE(usedAt,?) WHERE userId=? AND hash=?').run(new Date(clock.now()).toISOString(),factor.userId,code.hash);else if(currentCodes.get(code.hash))db.prepare('UPDATE recovery_codes SET usedAt=COALESCE(usedAt,?) WHERE userId=? AND hash=?').run(currentCodes.get(code.hash) as string,factor.userId,code.hash);
   }
   db.exec('DELETE FROM mfa_enrollments');assertRestoreSchema(db);assertRestoreFiles(db,prepared.preparedDir);db.exec('COMMIT');
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}finally{db.close();}
 }
 async function activateRestore(prepared:PreparedRestore){
  if(activation)throw new InputError('Eine Wiederherstellung läuft bereits.',409);if(closed)throw new InputError('Server wird beendet.',503);
  activation=(async()=>{
   const old=app,activeNetwork={...old.network,port:old.server.address().port};
   try{
    // Stop background work before carrying final account security and backup-catalog state.
    await old.jobs.close();await old.backups.close();await old.mail.close();await old.coordinator.run(()=>carryState(prepared,old,activeNetwork));await old.close();
    await transaction.activate(prepared.preparedDir,prepared.id);await listen(activeNetwork);await transaction.commit();lastFailure='';
   }catch(error){
    await app?.close();await transaction.rollback();await listen(activeNetwork);throw error;
   }
  })();
  lastActivation=activation;try{await activation;}finally{controller.discard(prepared.id);activation=null;}
 }
 return {async start(){await transaction.recover();await listen();},current:()=>app,activateRestore,waitForRestore:async()=>{await lastActivation;},waitForRestart:async()=>{await lastRestart;},lastFailure:()=>lastFailure,
  async close(){closed=true;try{await activation;}catch{}await controller.close();await app?.close();}
 };
}
