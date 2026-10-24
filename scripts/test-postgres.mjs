import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {existsSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';

const execute=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
export async function createTestPostgres(){
 const configured=process.env.RETOURENBOARD_TEST_DATABASE_URL;
 if(configured){if(configured===process.env.DATABASE_URL)throw Error('Reguläre Datenbank ist kein zulässiges Testziel.');return {url:configured,stop:async()=>{}};}
 const suffix=process.platform==='win32'?'.exe':'',bin=process.env.RETOURENBOARD_TEST_PG_BIN||(process.platform==='linux'?'/usr/lib/postgresql/18/bin':join(root,'.qa','postgres-runtime','18','pgsql','bin'));
 if(!existsSync(join(bin,'initdb'+suffix)))throw Error('PostgreSQL-Testserver fehlt. RETOURENBOARD_TEST_PG_BIN oder eine eigene RETOURENBOARD_TEST_DATABASE_URL konfigurieren.');
 const work=mkdtempSync(join(tmpdir(),'retourenboard-pg-cluster-')),data=join(work,'data'),pw=join(work,'password'),secret=randomBytes(32).toString('hex');
 writeFileSync(pw,secret,{mode:0o600});
 const address=createServer();await new Promise((r,j)=>{address.once('error',j);address.listen(0,'127.0.0.1',r);});const port=address.address().port;await new Promise(r=>address.close(r));
 const startupMs=Number(process.env.RETOURENBOARD_TEST_START_TIMEOUT_MS??45000);if(!Number.isInteger(startupMs)||startupMs<1000||startupMs>300000)throw Error('Ungültiges Test-Startzeitlimit.');
 let started=false,stopped=false,phase='initdb';
 async function stop(){if(stopped)return;stopped=true;try{if(started||existsSync(join(data,'postmaster.pid')))await execute(join(bin,'pg_ctl'+suffix),['-D',data,'-w','-t','30','-m','immediate','stop'],{windowsHide:true,timeout:35000});}finally{if(!existsSync(join(data,'postmaster.pid')))rmSync(work,{recursive:true,force:true});}}
 try{
  await execute(join(bin,'initdb'+suffix),['-D',data,'-U','retourenboard_test','--encoding=UTF8','--locale=C','--auth=scram-sha-256','--pwfile='+pw,'--no-sync'],{windowsHide:true,timeout:startupMs,maxBuffer:1024*1024});phase='pg_ctl';
  await execute(join(bin,'pg_ctl'+suffix),['-D',data,'-l',join(work,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c fsync=off -c full_page_writes=off -c unix_socket_directories=`,'-w','-t',String(Math.ceil(startupMs/1000)),'start'],{windowsHide:true,timeout:startupMs+5000,maxBuffer:1024*1024});started=true;
  return {url:`postgresql://retourenboard_test:${secret}@127.0.0.1:${port}/postgres?sslmode=disable`,binDir:bin,work,stop};
 }catch(error){const diagnostic=existsSync(join(work,'server.log'))?readFileSync(join(work,'server.log'),'utf8').slice(-4096):String(error.stderr??'').slice(-2048);await stop();throw Error('Isolierter PostgreSQL-Testserver konnte nicht gestartet werden ('+phase+', '+(error.code??error.signal??'Fehler')+'). '+diagnostic);}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 let cluster,child;
 try{
  cluster=await createTestPostgres();const files=process.argv.slice(2);if(!files.length)files.push('tests/*.test.js');
  child=spawn(process.execPath,['--test','--test-concurrency=4','--test-timeout=120000',...files],{cwd:root,env:{...process.env,RETOURENBOARD_TEST_DATABASE_URL:cluster.url},stdio:'inherit',windowsHide:true});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
  const [code]=await once(child,'exit');process.exitCode=code??1;
 }catch(error){console.error(error.message);process.exitCode=1;}
 finally{await cluster?.stop();}
}
