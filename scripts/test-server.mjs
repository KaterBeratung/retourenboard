import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir,networkInterfaces} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isIP} from 'node:net';
import {selectRuntime} from './runtime-layout.mjs';
import {isolatedDatabase} from './isolated-database.mjs';

const args=process.argv.slice(2);let port=3001,lan=false,once=false;
while(args.length){const option=args.shift();if(option==='--port')port=Number(args.shift());else if(option==='--lan')lan=true;else if(option==='--once')once=true;else throw new Error(`Unbekannte Testoption: ${option}`);}
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Ungültiger Testport.');
const project=new URL('../',import.meta.url),runtime=selectRuntime(fileURLToPath(project)),{version}=runtime;
const {createRuntime}=await import(new URL((runtime.compiled?'dist/':'')+'server/runtime.js',project).href);
const dataDir=mkdtempSync(join(tmpdir(),'retourenboard-test-'));
let app,serverRuntime,closing,database;
function close(){
  return closing??=(async()=>{try{if(serverRuntime)await serverRuntime.close();}finally{await database?.close();rmSync(dataDir,{recursive:true,force:true});if(process.connected)process.disconnect();}})();
}
try{
  database=await isolatedDatabase();
  serverRuntime=createRuntime({databaseConfig:database.config,internalSchema:database.schema,dataDir,port,host:lan?'0.0.0.0':'127.0.0.1',publicOrigin:'',secureCookies:false,production:false});
  await serverRuntime.start();app=serverRuntime.current();
  const actualPort=app.server.address().port,local=`http://127.0.0.1:${actualPort}`;
  const selected=process.env.RETOURENBOARD_TEST_ADDRESS||'';
  const validAddress=value=>isIP(value)===4&&!/^(0\.|127\.|169\.254\.)/.test(value)&&Number(value.split('.')[0])<224;
  const address=lan?(validAddress(selected)?selected:Object.values(networkInterfaces()).flat().find(item=>item?.family==='IPv4'&&!item.internal&&validAddress(item.address))?.address):null;
  const browserUrl=`http://${address||'127.0.0.1'}:${actualPort}`;
  console.log(`TEST_URL=${browserUrl}\nTEST_DATA=${dataDir}\nretourenboard. ${version} – temporärer Testbetrieb`);
  console.log(`Im Browser öffnen: ${browserUrl}`);
  console.log('Frische Testdatenbank: ersten Testadministrator im Browser anlegen. Keine bestehenden Konten oder Daten werden verwendet.');
  console.log('Mit Strg+C beenden. Alle Testdaten und Anhänge werden danach entfernt. Kein systemd-Dienst wird angelegt.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void close().catch(error=>{console.error(error.message);process.exitCode=1;});});
  if(process.send)process.on('message',message=>{if(message==='stop')void close();});
  if(once){
    const health=await fetch(local+'/health'),session=await(await fetch(local+'/api/session')).json();
    if(!health.ok||!session.setupRequired||session.unlocked||(await fetch(local+'/api/products')).status!==401)throw new Error('Automatischer Test fehlgeschlagen.');
    console.log('TEST_OK: Server erreichbar, neue Testdatenbank und Anmeldungsschutz geprüft.');await close();
  }
}catch(error){await close();console.error(error.code==='EADDRINUSE'?`Port ${port} ist bereits belegt. Mit --port einen freien Testport wählen.`:error.message);process.exitCode=1;}
