import {AsyncLocalStorage} from 'node:async_hooks';
import {Pool,types,type PoolClient} from '../../vendor/postgres.js';
import type {DatabaseConfig,Hook,QueryResult,SqlDatabase,SqlValue} from './types.js';
import {normalizeDatabaseRow} from './row-contract.js';

type Scope={client:PoolClient;commit:Hook[];rollback:Hook[];closed:boolean};
export function assertInternalSchema(schema:string):string{
 if(schema!=='retourenboard'&&!/^rb_(?:stage|test)_[a-f0-9]{32}$/.test(schema))throw new Error('Ungültiges Anwendungsschema.');
 return schema;
}
function safeInteger(value:string){const n=Number(value);if(!Number.isSafeInteger(n)){const error:any=new Error('Datenbankwert überschreitet den sicheren Zahlenbereich.');error.code='22003';throw error;}return n;}
function publicError(error:any):Error{
 if(error?.code==='22003')return error;
 const result:any=new Error('PostgreSQL-Datenbankzugriff fehlgeschlagen. Verbindung und Datenbankdienst prüfen.');
 if(typeof error?.code==='string'&&/^[A-Z0-9_]{2,30}$/.test(error.code))result.code=error.code;
 return result;
}
export async function openDatabase(config:DatabaseConfig,internalSchema='retourenboard'):Promise<SqlDatabase>{
 const schema=assertInternalSchema(internalSchema),scope=new AsyncLocalStorage<Scope>(),authorization=new AsyncLocalStorage<{check:()=>Promise<void>;pending?:Promise<void>}>();let closed=false,savepoint=0;
 const pool=new Pool({connectionString:config.connectionString,ssl:config.tls?{rejectUnauthorized:true,...config.tls}:false,max:config.poolMax,connectionTimeoutMillis:config.connectTimeoutMs,query_timeout:config.queryTimeoutMs,idleTimeoutMillis:30000,application_name:'retourenboard',options:`-c search_path=${schema},pg_catalog -c statement_timeout=${config.queryTimeoutMs} -c lock_timeout=5000 -c idle_in_transaction_session_timeout=60000`,types:{getTypeParser:(oid:number,format?:any)=>oid===20?safeInteger:types.getTypeParser(oid,format)}});
 pool.on('error',()=>{console.error('PostgreSQL-Verbindung im Pool wurde beendet.');});
 async function hooks(jobs:Hook[],reverse=false){for(const job of reverse?[...jobs].reverse():jobs)try{await job();}catch{console.error('Dateibereinigung nach Datenbanktransaktion fehlgeschlagen.');}}
 let serverVersion:number;
 try{const result=await pool.query("SELECT current_setting('server_version_num') AS version");serverVersion=Number(result.rows[0].version);if(serverVersion<160000||serverVersion>=190000)throw new Error('PostgreSQL 16, 17 oder 18 erforderlich.');}
 catch(error){await pool.end();if(error instanceof Error&&error.message==='PostgreSQL 16, 17 oder 18 erforderlich.')throw error;throw publicError(error);}
 const db:SqlDatabase={schema,serverVersion,
  async query<Row>(sql:string,values:readonly SqlValue[]=[]):Promise<QueryResult<Row>>{
   if(closed)throw new Error('Datenbankverbindung wurde beendet.');
   const current=scope.getStore();if(current?.closed)throw new Error('Transaktion wurde bereits beendet.');
   // Reauthorize immediately before the first write, after hashing/validation.
   // The guard takes a row lock on this transaction's client and holds it through COMMIT.
   const guard=authorization.getStore();
   if(guard&&!/^\s*(?:SELECT|SAVEPOINT|RELEASE|ROLLBACK|SET|DECLARE|FETCH|CLOSE)\b/i.test(sql))await(guard.pending??=guard.check());
   try{const result=await(current?.client??pool).query(sql,[...values]);
    if(Array.isArray(result))throw new Error('Mehrere SQL-Anweisungen mit Rückgabewerten sind nicht erlaubt.');
    return {rows:result.rows.map(row=>normalizeDatabaseRow<Row>(row)),rowCount:result.rowCount??0};
   }catch(error){throw publicError(error);}
  },
  async authorizeMutations<T>(check:()=>Promise<void>,job:()=>T|Promise<T>):Promise<T>{if(!scope.getStore())throw Error('Autorisierung benötigt eine Transaktion.');return authorization.run({check},job);},
  async transaction<T>(job:()=>T|Promise<T>):Promise<T>{
   if(closed)throw new Error('Datenbankverbindung wurde beendet.');
   const parent=scope.getStore();if(parent?.closed)throw new Error('Transaktion wurde bereits beendet.');
   if(parent){
    const guard=authorization.getStore(),previousAuthorization=guard?.pending;
    const name='rb_sp_'+(++savepoint),nested:Scope={client:parent.client,commit:[],rollback:[],closed:false};
    await db.query('SAVEPOINT '+name);
    try{const result=await scope.run(nested,job);await db.query('RELEASE SAVEPOINT '+name);nested.closed=true;parent.commit.push(...nested.commit);parent.rollback.push(...nested.rollback);return result;}
    catch(error){nested.closed=true;await db.query('ROLLBACK TO SAVEPOINT '+name);if(guard)guard.pending=previousAuthorization;await db.query('RELEASE SAVEPOINT '+name);await hooks(nested.rollback,true);throw error;}
   }
   let client:PoolClient;try{client=await pool.connect();}catch(error){throw publicError(error);}
   const current:Scope={client,commit:[],rollback:[],closed:false};let begun=false,committing=false,bad=false;
   try{
    await client.query('BEGIN');begun=true;
    const result=await scope.run(current,job);committing=true;await client.query('COMMIT');current.closed=true;
    await hooks(current.commit);return result;
   }catch(error){
    current.closed=true;
    if(begun)try{await client.query('ROLLBACK');if(!committing)await hooks(current.rollback,true);}catch{bad=true;}
    if(committing)bad=true;
    throw error;
   }finally{current.closed=true;client.release(bad);}
  },
  onCommit(job:Hook){const current=scope.getStore();if(!current||current.closed)throw new Error('Transaktion erforderlich.');current.commit.push(job);},
  onRollback(job:Hook){const current=scope.getStore();if(!current||current.closed)throw new Error('Transaktion erforderlich.');current.rollback.push(job);},
  async close(){if(closed)return;closed=true;await pool.end();scope.disable();authorization.disable();}
 };
 return db;
}
