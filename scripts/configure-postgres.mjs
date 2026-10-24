import {existsSync,lstatSync,readFileSync,writeFileSync,mkdirSync,chmodSync,chownSync,renameSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readDatabaseConfig} from '../dist/server/database/config.js';
import {openDatabase} from '../dist/server/database/connection.js';

function read(path,secret=false){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.size>65536||secret&&process.platform!=='win32'&&(s.mode&0o027))throw Error('Private Konfigurationsdatei fehlt oder hat unsichere Rechte.');return readFileSync(path,'utf8');}
function atomic(path,text,mode=0o600,gid=0){if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('Links sind als Konfigurationsziel nicht erlaubt.');const temp=path+'.'+randomUUID()+'.part';try{writeFileSync(temp,text,{flag:'wx',mode});if(process.platform!=='win32'){chmodSync(temp,mode);if(process.getuid()===0)chownSync(temp,0,gid);}const fd=openSync(temp,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);if(process.platform!=='win32'){const folder=openSync(dirname(path),'r');try{fsyncSync(folder);}finally{closeSync(folder);}}}finally{/* Failed private .part files remain available for operator recovery. */}}
function configEnv(file){return existsSync(file)?parseEnv(read(file)):{};}
function currentURL(env){if(env.DATABASE_URL&&env.DATABASE_URL_FILE)throw Error('Nur eine PostgreSQL-Verbindungsquelle verwenden.');return env.DATABASE_URL??(env.DATABASE_URL_FILE?read(env.DATABASE_URL_FILE,true).trim():'');}
function sqlLocal(text){try{return execFileSync('runuser',['-u','postgres','--','/usr/lib/postgresql/18/bin/psql','--port','55432','--dbname','postgres','--no-psqlrc','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();}catch{throw Error('Lokale PostgreSQL-Einrichtung fehlgeschlagen. Datenbankdienst und private Einrichtung prüfen.');}}
export async function configurePostgres({configFile,dataDir,secretDir='/etc/retourenboard',mode='existing',inputURLFile,caFile,groupId=0}){
 configFile=resolve(configFile);dataDir=resolve(dataDir);secretDir=resolve(secretDir);const env=configEnv(configFile),oldURL=currentURL(env);if(!['local','external','existing'].includes(mode))throw Error('Unbekannte Datenbankeinrichtung.');
 if(!Number.isSafeInteger(groupId)||groupId<0||groupId>4294967294)throw Error('Ungültige Anwendungsgruppe.');
 mkdirSync(secretDir,{recursive:true,mode:0o750});if(lstatSync(secretDir).isSymbolicLink())throw Error('Ungültiger Geheimnisordner.');if(process.platform!=='win32'){chmodSync(secretDir,0o750);if(process.getuid()===0)chownSync(secretDir,0,groupId);}
 const file=join(secretDir,'database-url'),marker=join(secretDir,'local-postgres.json');let value;
 if(mode==='local'){
  if(oldURL){const old=new URL(oldURL);if(old.hostname!=='127.0.0.1'||old.port!=='55432'||old.pathname!=='/retourenboard')throw Error('Eine bestehende PostgreSQL-Verbindung wird nicht auf eine andere Datenbank umgestellt.');}
  if(!existsSync(file)){if(sqlLocal("SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='retourenboard') OR EXISTS(SELECT 1 FROM pg_database WHERE datname='retourenboard') THEN 1 ELSE 0 END;\n")!=='0')throw Error('Lokaler Datenbankbestand ohne passende private Konfiguration gefunden. Zugang wiederherstellen; keine Kennwörter werden zurückgesetzt.');value='postgresql://retourenboard:'+randomBytes(32).toString('hex')+'@127.0.0.1:55432/retourenboard?sslmode=disable';atomic(file,value+'\n',0o640,groupId);atomic(marker,JSON.stringify({format:1,phase:'prepared',port:55432})+'\n',0o600);}
  else value=read(file,true).trim();
  const parsed=new URL(value);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55432'||parsed.pathname!=='/retourenboard'||parsed.username!=='retourenboard'||!/^[a-f0-9]{64}$/.test(parsed.password))throw Error('Lokale PostgreSQL-Zugangskonfiguration ist ungültig.');
  if(existsSync(marker)&&JSON.parse(read(marker)).phase==='prepared'){
   const role=sqlLocal("SELECT COUNT(*) FROM pg_roles WHERE rolname='retourenboard';\n");if(role==='0')sqlLocal("CREATE ROLE retourenboard LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '"+parsed.password+"';\n");
   if(sqlLocal("SELECT COUNT(*) FROM pg_database WHERE datname='retourenboard';\n")==='0')sqlLocal('CREATE DATABASE retourenboard OWNER retourenboard;\nREVOKE ALL ON DATABASE retourenboard FROM PUBLIC;\n');
  }
 }else value=inputURLFile?read(resolve(inputURLFile),true).trim():oldURL;
 if(!value)throw Error('Private PostgreSQL-Verbindungsdatei erforderlich.');if(oldURL&&new URL(oldURL).href!==new URL(value).href)throw Error('Eine bestehende PostgreSQL-Verbindung wird nicht auf eine andere Datenbank umgestellt.');
 const caSource=caFile??env.DATABASE_CA_FILE;let caPath,caText;if(caSource){caPath=join(secretDir,'database-ca.pem');caText=read(resolve(caSource));}
 const connection=readDatabaseConfig({DATABASE_URL:value,...(caPath?{DATABASE_CA_FILE:caPath}:{})},()=>caText),db=await openDatabase(connection);
 let major;try{major=Math.floor(db.serverVersion/10000);const role=(await db.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];if(role.rolsuper||role.rolcreatedb||role.rolcreaterole)throw Error('Für die Anwendung einen eigenen PostgreSQL-Benutzer ohne Superuser-, Rollen- oder Datenbankverwaltung verwenden.');if(mode==='local'&&(await db.query('SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=current_database()')).rows[0].owned!==true)throw Error('Lokale Anwendungsdatenbank hat einen fremden Eigentümer.');}finally{await db.close();}
 if(caPath)atomic(caPath,caText,0o640,groupId);atomic(file,value+'\n',0o640,groupId);const lines=(existsSync(configFile)?read(configFile):'').split(/\r?\n/).filter(line=>!/^\s*(?:DATA_DIR|DATABASE_URL|DATABASE_URL_FILE|DATABASE_CA_FILE|PG_BIN_DIR)=/.test(line));while(lines.at(-1)==='')lines.pop();lines.push('DATA_DIR='+dataDir,'DATABASE_URL_FILE='+file,'PG_BIN_DIR=/usr/lib/postgresql/'+major+'/bin');if(caPath)lines.push('DATABASE_CA_FILE='+caPath);atomic(configFile,lines.join('\n')+'\n');if(mode==='local')atomic(marker,JSON.stringify({format:1,phase:'complete',port:55432})+'\n');return {database:'postgresql',serverMajor:major,local:mode==='local'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),values={};let inspect=false;
  while(args.length){const flag=args.shift();if(flag==='--inspect'){inspect=true;continue;}const value=args.shift();if(!value||value.startsWith('--')||!['--config','--data-dir','--mode','--url-file','--ca-file','--group-id'].includes(flag))throw Error('Ungültige Einrichtungsoption.');values[flag]=value;}
  const configFile=values['--config'];if(!configFile)throw Error('Konfigurationspfad fehlt.');
  if(inspect){const env=configEnv(configFile),url=currentURL(env);console.log(JSON.stringify({postgresql:!!url,sqlite:env.DB_PATH??join(values['--data-dir']??'/var/lib/retourenboard','retouren.sqlite')}));}
  else console.log(JSON.stringify(await configurePostgres({configFile,dataDir:values['--data-dir'],mode:values['--mode'],inputURLFile:values['--url-file'],caFile:values['--ca-file'],groupId:Number(values['--group-id']??0)})));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
