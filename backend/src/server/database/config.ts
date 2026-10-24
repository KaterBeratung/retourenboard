import {readFileSync,lstatSync} from 'node:fs';
import type {DatabaseConfig} from './types.js';

type Environment=Record<string,string|undefined>;
function fail():never{throw new Error('PostgreSQL-Datenbankkonfiguration ungültig. DATABASE_URL oder DATABASE_URL_FILE prüfen. Bestehende SQLite-Installationen zuerst migrieren.');}
function secretFile(path:string):string{
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)fail();
 return readFileSync(path,'utf8');
}
export function readDatabaseConfig(env:Environment=process.env,readSecretFile:(path:string)=>string=secretFile):DatabaseConfig{
 try{
  if(Boolean(env.DATABASE_URL)===Boolean(env.DATABASE_URL_FILE))fail();
  const value=String(env.DATABASE_URL??readSecretFile(env.DATABASE_URL_FILE!)).trim();
  if(value.length>16384)fail();
  const url=new URL(value);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!/^\/[^/]+$/.test(url.pathname)||url.hash)fail();
  const modes=url.searchParams.getAll('sslmode');if(modes.length>1)fail();
  for(const key of url.searchParams.keys())if(key!=='sslmode')fail();
  const mode=modes[0];if(mode&&!['disable','require','verify-full','verify-ca'].includes(mode))fail();
  const loopback=['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname);
  let tls:DatabaseConfig['tls']=mode==='disable'||!mode&&loopback?undefined:{};
  if(env.DATABASE_CA_FILE){if(!tls)fail();const ca=readSecretFile(env.DATABASE_CA_FILE);if(!ca||ca.length>65536)fail();tls={ca};}
  url.search='';
  function number(key:string,defaultValue:number,min:number,max:number){const raw=env[key];if(raw===undefined||raw==='')return defaultValue;if(!/^\d+$/.test(raw))fail();const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max)fail();return n;}
  return {connectionString:url.href,tls,poolMax:number('DATABASE_POOL_MAX',10,1,50),connectTimeoutMs:number('DATABASE_CONNECT_TIMEOUT_MS',5000,100,120000),queryTimeoutMs:number('DATABASE_QUERY_TIMEOUT_MS',30000,100,120000)};
 }catch{fail();}
}
