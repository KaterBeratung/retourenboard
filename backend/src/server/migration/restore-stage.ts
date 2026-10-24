import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../database/connection.js';
import {importData} from '../database/data-transfer.js';
import {validateTransferredData} from '../database/validate-data.js';
import {migrateLegacySnapshot} from './legacy-transfer.js';
import type {DatabaseConfig,SqlDatabase} from '../database/types.js';
export async function stageRestore({config,preparedDir,old,activeNetwork,now=Date.now}:{config:DatabaseConfig;preparedDir:string;old:any;activeNetwork:any;now?:()=>number}){
 const schema='rb_stage_'+randomBytes(16).toString('hex'),admin=await openDatabase(config);let db:SqlDatabase|undefined;
 try{await admin.query('CREATE SCHEMA "'+schema+'"');db=await openDatabase(config,schema);let files=preparedDir;
  if(existsSync(join(preparedDir,'data.jsonl')))await importData(db,join(preparedDir,'data.jsonl'));else{const workDir=join(preparedDir,'pg-transfer');await migrateLegacySnapshot({source:join(preparedDir,'retouren.sqlite'),dataDir:preparedDir,workDir,database:db});files=join(workDir,'files');}
  const target=db;await target.query('DELETE FROM mfa_enrollments');await validateTransferredData(target,files);await target.transaction(async()=>{
   const row=(await target.query('SELECT value FROM server_settings WHERE id=1')).rows[0],settings=row?JSON.parse(row.value):{};settings.port=activeNetwork.port;if(activeNetwork.publicOrigin)settings.publicOrigin=activeNetwork.publicOrigin;else delete settings.publicOrigin;
   await target.query('INSERT INTO server_settings(id,value) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET value=excluded.value',[JSON.stringify(settings)]);
   await target.query("UPDATE backup_jobs SET state='unavailable',filename=NULL WHERE state='complete'");
   for(const job of(await old.store.db.query('SELECT * FROM backup_jobs')).rows)await target.query('INSERT INTO backup_jobs(id,mode,state,createdAt,finishedAt,filename,size,error,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET state=excluded.state,finishedAt=excluded.finishedAt,filename=excluded.filename,size=excluded.size,error=excluded.error,metadata=excluded.metadata',[job.id,job.mode,job.state,job.createdAt,job.finishedAt,job.filename,job.size,job.error,job.metadata]);
   for(const factor of(await old.store.db.query('SELECT m.*,u.usernameKey FROM user_mfa m JOIN users u ON u.id=m.userId WHERE secretEnc IS NOT NULL')).rows){const restored=(await target.query('SELECT m.*,u.usernameKey FROM user_mfa m JOIN users u ON u.id=m.userId WHERE m.userId=$1',[factor.userId])).rows[0];if(!restored||restored.secretEnc!==factor.secretEnc||restored.usernameKey!==factor.usernameKey)continue;await target.query('UPDATE user_mfa SET lastStep=GREATEST(lastStep,$1) WHERE userId=$2',[factor.lastStep,factor.userId]);const current=new Map((await old.store.db.query('SELECT hash,usedAt FROM recovery_codes WHERE userId=$1',[factor.userId])).rows.map((r:any)=>[r.hash,r.usedAt]));for(const code of(await target.query('SELECT hash,usedAt FROM recovery_codes WHERE userId=$1',[factor.userId])).rows){const usedAt=!current.has(code.hash)?new Date(now()).toISOString():current.get(code.hash);if(usedAt)await target.query('UPDATE recovery_codes SET usedAt=COALESCE(usedAt,$1) WHERE userId=$2 AND hash=$3',[String(usedAt),factor.userId,code.hash]);}}
   await target.query('DELETE FROM mfa_enrollments');await target.query("DELETE FROM app_preferences WHERE section='notifications'");await target.query("UPDATE mail_outbox SET state='cancelled' WHERE state IN ('pending','sending')");await target.query("UPDATE backup_jobs SET state='unavailable',filename=NULL WHERE state='complete' AND id NOT IN (SELECT id FROM backup_jobs WHERE filename IS NOT NULL)");
  });return {schema,files};
 }catch(error){await db?.close();await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE').catch(()=>{});throw error;}finally{await db?.close();await admin.close();}
}
