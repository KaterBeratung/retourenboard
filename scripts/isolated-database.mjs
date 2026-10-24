import {randomBytes} from 'node:crypto';
import {createTestPostgres} from './test-postgres.mjs';
import {openDatabase} from '../dist/server/database/connection.js';
import {readDatabaseConfig} from '../dist/server/database/config.js';

// Only the explicit test connection is accepted; DATABASE_URL is never a default.
export async function isolatedDatabase(){
  const cluster=await createTestPostgres();
  const config=readDatabaseConfig({DATABASE_URL:cluster.url});
  const schema='rb_test_'+randomBytes(16).toString('hex');
  let admin,closed=false;
  try{
    admin=await openDatabase(config);
    await admin.query('CREATE SCHEMA "'+schema+'"');
    return {config,schema,async close(){if(closed)return;closed=true;try{await admin.query('DROP SCHEMA "'+schema+'" CASCADE');}finally{await admin.close();await cluster.stop();}}};
  }catch(error){await admin?.close();await cluster.stop();throw error;}
}
