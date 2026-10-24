// Local trusted updater/recovery snapshots only. Uploaded archives never reach pg_restore.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,writeFileSync,lstatSync,rmSync,existsSync,renameSync,chmodSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {openDatabase,assertInternalSchema} from './connection.js';
import {sha256File} from '../../shared/backup-contract.js';
import type {DatabaseConfig} from './types.js';
type Metadata={format:'pg-custom-v1';schema:string;serverVersion:number;sha256:string};
type Options={config:DatabaseConfig;schema?:string;file:string;binDir?:string};
const execute=promisify(execFile);
async function tools<T>({config,schema='retourenboard',file,binDir}:Options,job:(tool:(name:string,args:string[])=>Promise<string>,version:number,path:string)=>Promise<T>):Promise<T>{
 assertInternalSchema(schema);file=resolve(file);const dir=dirname(file),stat=lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Ungültiger technischer Sicherungsordner.');const db=await openDatabase(config,schema),version=db.serverVersion;await db.close();const major=Math.floor(version/10000),bin=binDir??process.env.PG_BIN_DIR??(process.platform==='linux'?'/usr/lib/postgresql/'+major+'/bin':'');if(!bin)throw Error('Passende PostgreSQL-Werkzeuge fehlen. PG_BIN_DIR setzen.');
 const work=mkdtempSync(join(dir,'.pg-credentials-'));try{
  const url=new URL(config.connectionString),values={host:url.hostname.replace(/^\[|\]$/g,''),port:url.port||'5432',dbname:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password)};
  for(const value of Object.values(values))if(/[\r\n\0]/.test(value)||value!==value.trim())throw Error('PostgreSQL-Zugangsdaten werden von den Sicherungswerkzeugen nicht unterstützt.');
  const ca=join(work,'ca.pem');if(config.tls?.ca)writeFileSync(ca,config.tls.ca,{mode:0o600,flag:'wx'});
  const service=join(work,'service.conf'),pass=join(work,'password');writeFileSync(service,'[retourenboard]\n'+Object.entries({host:values.host,port:values.port,dbname:values.dbname,user:values.user,connect_timeout:Math.ceil(config.connectTimeoutMs/1000),sslmode:config.tls?'verify-full':'disable',...(config.tls?{sslrootcert:config.tls.ca?ca:'system'}:{}),options:'-c statement_timeout='+config.queryTimeoutMs+' -c lock_timeout=5000'}).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(pass,[values.host,values.port,values.dbname,values.user,values.password].map(v=>v.replace(/[\\:]/g,c=>'\\'+c)).join(':')+'\n',{mode:0o600,flag:'wx'});
  const environment:NodeJS.ProcessEnv=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('PG')));Object.assign(environment,{PGSERVICE:'retourenboard',PGSERVICEFILE:service,PGPASSFILE:pass});
  async function tool(name:string,args:string[]){try{return (await execute(join(bin,name+(process.platform==='win32'?'.exe':'')),args,{env:environment,windowsHide:true,timeout:120000,maxBuffer:128*1024})).stdout;}catch{throw Error('PostgreSQL-Werkzeug fehlgeschlagen. Verbindung, Werkzeugversion und Dienstprotokoll prüfen.');}}
  for(const name of ['pg_dump','pg_restore'])if(!(await tool(name,['--version'])).match(new RegExp('\\b'+major+'\\.')))throw Error('PostgreSQL-Werkzeugversion passt nicht zur Datenbank.');
  return await job(tool,version,file);
 }finally{rmSync(work,{recursive:true,force:true});}
}
export async function verifyTechnicalTools(options:Options){return tools(options,async()=>{});}
export async function technicalSnapshot(options:Options):Promise<Metadata>{return tools(options,async(tool,serverVersion,file)=>{if(existsSync(file))throw Error('Technische Sicherung darf keine vorhandene Datei überschreiben.');const temp=file+'.part';try{await tool('pg_dump',['--format=custom','--no-owner','--no-privileges','--schema='+assertInternalSchema(options.schema??'retourenboard'),'--file='+temp,'--no-password']);chmodSync(temp,0o600);renameSync(temp,file);return {format:'pg-custom-v1',schema:options.schema??'retourenboard',serverVersion,sha256:await sha256File(file)};}finally{rmSync(temp,{force:true});}});}
export async function restoreTechnicalSnapshot(options:Options&{metadata:Metadata}){return tools(options,async(tool,version,file)=>{const metadata=options.metadata;if(metadata.format!=='pg-custom-v1'||metadata.schema!==(options.schema??'retourenboard')||Math.floor(metadata.serverVersion/10000)!==Math.floor(version/10000)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink()||await sha256File(file)!==metadata.sha256)throw Error('Technische PostgreSQL-Sicherung ist ungültig.');await tool('pg_restore',['--dbname=service=retourenboard','--clean','--if-exists','--exit-on-error','--single-transaction','--no-owner','--no-privileges','--schema='+metadata.schema,'--no-password',file]);});}
