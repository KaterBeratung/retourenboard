import {randomBytes} from 'node:crypto';
import {mkdirSync,lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {readDatabaseConfig} from '../dist/server/database/config.js';
try{
 const args=process.argv.slice(2);let directory=resolve('deploy/docker'),external;
 while(args.length){const flag=args.shift(),value=args.shift();if(!value||value.startsWith('--'))throw Error('Verwendung: setup-docker.mjs [--directory ORDNER] [--external-url-file DATEI]');if(flag==='--directory')directory=resolve(value);else if(flag==='--external-url-file')external=resolve(value);else throw Error('Unbekannte Option.');}
 mkdirSync(directory,{recursive:true,mode:0o700});if(lstatSync(directory).isSymbolicLink())throw Error('Ungültiger Zielordner.');let content='';
 if(external){const s=lstatSync(external);if(!s.isFile()||s.isSymbolicLink()||s.size>16384)throw Error('Ungültige Verbindungsdatei.');const url=readFileSync(external,'utf8').trim();readDatabaseConfig({DATABASE_URL:url});content="DATABASE_URL='"+url.replaceAll('$','%24').replaceAll("'",'%27')+"'\n";}
 else{const app=randomBytes(32).toString('hex'),admin=randomBytes(32).toString('hex');content='POSTGRES_APP_PASSWORD='+app+'\nPOSTGRES_ADMIN_PASSWORD='+admin+'\nDATABASE_URL=postgresql://retourenboard:'+app+'@database:5432/retourenboard?sslmode=disable\n';}
 writeFileSync(join(directory,'.env'),content+'RETOURENBOARD_HTTP_PORT=3000\n',{mode:0o600,flag:'wx'});console.log('Private Docker-Konfiguration angelegt. Die Datei .env für weitere Starts beibehalten.');
}catch(error){console.error(error.code==='EEXIST'?'Vorhandene Docker-Konfiguration wird nicht überschrieben.':error.message);process.exitCode=1;}
