import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {createApp} from './postgres-fixtures.js';
import {readDatabaseConfig} from '../../dist/server/database/config.js';

export const testPassword='Testkonto-Passwort!';
export async function runtimeFixture(t,options={}){
  const dataDir=mkdtempSync(join(tmpdir(),'retourenboard-features-'));
  const app=await createApp({dbPath:join(dataDir,'retouren.sqlite'),...options},t);
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await app.close(); const rel=relative(tmpdir(),dataDir); if(isAbsolute(rel)||rel.startsWith('..')||!rel.startsWith('retourenboard-features-'))throw new Error('Unsicheres Testverzeichnis');rmSync(dataDir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=(path,method='GET',body,auth={},extra={})=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...auth,...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const authFrom=(res,data)=>({Cookie:res.headers.get('set-cookie')?.split(';')[0]??'', 'X-CSRF-Token':data.csrfToken??''});
  async function setup(){const res=await request('/api/setup','POST',{username:'Admin',password:testPassword,displayName:'Test Admin'});const data=await res.json();return {res,data,auth:authFrom(res,data)};}
  async function login(username,password=testPassword){const res=await request('/api/login','POST',{username,password});const data=await res.json();return {res,data,auth:authFrom(res,data)};}
  return {app,dataDir,base,request,setup,login,authFrom,databaseConfig:readDatabaseConfig({DATABASE_URL:process.env.RETOURENBOARD_TEST_DATABASE_URL})};
}
