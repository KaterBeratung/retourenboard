import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRuntime} from './postgres-fixtures.js';import {testPassword} from './runtime.js';
export async function restoreFixture(t,options={}){
 const dataDir=mkdtempSync(join(tmpdir(),'retourenboard-restore-test-')),runtime=await createRuntime({dbPath:join(dataDir,'retouren.sqlite'),port:0,host:'127.0.0.1',...options},t);t.after(async()=>{await runtime.close();rmSync(dataDir,{recursive:true,force:true});});await runtime.start();const base=`http://127.0.0.1:${runtime.current().server.address().port}`;
 const request=(path,method='GET',body,auth={},extra={})=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...auth,...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const authFrom=(res,data)=>({Cookie:res.headers.get('set-cookie')?.split(';')[0]??'','X-CSRF-Token':data.csrfToken??''});
 async function setup(){const res=await request('/api/setup','POST',{username:'Admin',password:testPassword,displayName:'Test Admin'}),data=await res.json();return {auth:authFrom(res,data),data};}
 async function login(username,password=testPassword){const res=await request('/api/login','POST',{username,password}),data=await res.json();return {res,data,auth:authFrom(res,data)};}
 return {get app(){return runtime.current();},dataDir,runtime,base,request,setup,login,authFrom};
}
