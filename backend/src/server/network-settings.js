import {readDatabaseConfig} from './database/config.js';
import {openDatabase} from './database/connection.js';
import {createSettings} from './settings.js';
const db=await openDatabase(readDatabaseConfig());
try{
 const settings=await createSettings(db,{port:Number(process.env.PORT??3000),publicOrigin:process.env.PUBLIC_ORIGIN??'',secureCookies:process.env.SECURE_COOKIES==='true'}).network();
 console.log('PORT='+settings.port+'\nPUBLIC_ORIGIN='+settings.publicOrigin);
}finally{await db.close();}
