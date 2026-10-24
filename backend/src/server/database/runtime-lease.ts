import {Pool,type PoolClient} from '../../vendor/postgres.js';
import {assertInternalSchema} from './connection.js';
import type {DatabaseConfig} from './types.js';
export async function acquireRuntimeLease(config:DatabaseConfig,schema:string,onLost:()=>void=()=>{}){
 assertInternalSchema(schema);const key='retourenboard:runtime:'+schema;
 const pool=new Pool({connectionString:config.connectionString,ssl:config.tls?{rejectUnauthorized:true,...config.tls}:false,max:1,connectionTimeoutMillis:config.connectTimeoutMs,query_timeout:config.queryTimeoutMs,application_name:'retourenboard-runtime-lease'});
 let client:PoolClient|undefined,held=false,closed=false,closing:Promise<void>|undefined;
 const lost=()=>{if(!held||closed)return;held=false;try{onLost();}catch{console.error('PostgreSQL-Anwendungslease wurde verloren.');}};
 try{
  client=await pool.connect();client.on('error',lost);client.on('end',lost);
  held=!!(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS held',[key])).rows[0].held;
  if(!held)throw new Error('Eine andere retourenboard-Instanz verwendet diese Datenbank bereits.');
 }catch(error){closed=true;client?.release(true);await pool.end();if(error instanceof Error&&error.message==='Eine andere retourenboard-Instanz verwendet diese Datenbank bereits.')throw error;throw new Error('PostgreSQL-Anwendungslease konnte nicht eingerichtet werden. Datenbankverbindung prüfen.');}
 return {get held(){return held&&!closed;},close(){return closing??=(async()=>{const healthy=held;closed=true;held=false;let bad=!healthy;try{if(healthy)await client!.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}catch{bad=true;}finally{client!.release(bad);await pool.end();}})();}};
}
