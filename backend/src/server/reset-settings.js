import {readDatabaseConfig} from './database/config.js';
import {openDatabase} from './database/connection.js';
import {acquireRuntimeLease} from './database/runtime-lease.js';
import {createSettings} from './settings.js';
if(!process.argv.includes('--service-stopped')||!process.argv.includes('--confirm'))throw Error('Dienst stoppen; --service-stopped --confirm sind erforderlich.');
const config=readDatabaseConfig(),lease=await acquireRuntimeLease(config,'retourenboard');let db;
try{
 db=await openDatabase(config);
 await createSettings(db,{port:Number(process.env.PORT??3000),publicOrigin:process.env.PUBLIC_ORIGIN??'',secureCookies:process.env.SECURE_COOKIES==='true'}).resetNetwork();
 console.log('Gespeicherte Netzwerkeinstellungen entfernt. Nach dem Neustart gelten die Werte der Umgebungskonfiguration.');
}finally{await db?.close();await lease.close();}
