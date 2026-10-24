import {dirname,isAbsolute,resolve} from 'node:path';
import {createApp as actualApp} from '../../dist/server/app.js';
import {createStore as actualStore} from '../../dist/server/store.js';
import {createRuntime as actualRuntime} from '../../dist/server/runtime.js';
import {openDatabase} from '../../dist/server/database/connection.js';
import {postgresFixture} from './postgres.js';
import {currentTestOwner} from './postgres-context.js';
const resources=new WeakMap();let memory=0;
async function resource(path=':memory:',owner=currentTestOwner()){
 let cache=resources.get(owner);if(!cache){cache=new Map();resources.set(owner,cache);}
 const key=path===':memory:'?'memory:'+(++memory):resolve(path);
 if(!cache.has(key))cache.set(key,postgresFixture(owner));return cache.get(key);
}
export async function createStore(path=':memory:',owner=currentTestOwner()){
 if(path&&typeof path==='object')return actualStore(path);
 const f=await resource(path,owner),database=await openDatabase(f.config,f.schema);f.beforeCleanup(()=>database.close());
 return actualStore({database});
}
function fileOptions(options,f){
 const {dbPath,...rest}=options;const dataDir=rest.dataDir??(dbPath&&dbPath!==':memory:'&&isAbsolute(dbPath)?dirname(dbPath):f.dataDir);
 return {...rest,dataDir,databaseConfig:f.config,internalSchema:f.schema};
}
export async function createApp(options={},owner=currentTestOwner()){
 if(options.databaseConfig)return actualApp(options);
 const f=await resource(options.dbPath??':memory:',owner);let app;f.beforeCleanup(async()=>{await app?.close();});
 app=await actualApp(fileOptions(options,f));return app;
}
export async function createRuntime(options={},owner=currentTestOwner()){
 if(options.databaseConfig)return actualRuntime(options);
 const f=await resource(options.dbPath??':memory:',owner);let runtime;f.beforeCleanup(async()=>{await runtime?.close();});
 runtime=actualRuntime(fileOptions(options,f));return runtime;
}
