import {mkdirSync,readFileSync,writeFileSync,lstatSync,chmodSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {InputError} from '../shared/model.js';

export function createSecrets(dataDir:string){
  const directory=join(dataDir,'secrets');
  const path=(purpose:'mfa'|'smtp'|'oidc'|'customer-share')=>join(directory,`${purpose}.key`);
  function key(purpose:'mfa'|'smtp'|'oidc'|'customer-share',create=false):Buffer{
    try{
      try{const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error();}
      catch(error:any){if(error.code!=='ENOENT'||!create)throw error;mkdirSync(directory,{mode:0o700});}
      if(create){try{writeFileSync(path(purpose),randomBytes(32),{flag:'wx',mode:0o600});}catch(error:any){if(error.code!=='EEXIST')throw error;}}
      const stat=lstatSync(path(purpose));if(!stat.isFile()||stat.isSymbolicLink())throw new Error();
      const value=readFileSync(path(purpose));if(value.length!==32)throw new Error();
      if(process.platform!=='win32'){chmodSync(directory,0o700);chmodSync(path(purpose),0o600);}
      return value;
    }catch{throw new InputError('Verschlüsselungsschlüssel fehlt oder ist ungültig. Schlüssel aus der separaten Sicherung wiederherstellen oder Recoverycode verwenden.',503);}
  }
  return {
    resetOidcKey(){
      try{mkdirSync(directory,{mode:0o700});}catch(error:any){if(error.code!=='EEXIST')throw error;}
      const directoryStat=lstatSync(directory);if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink())throw new InputError('SSO-Schlüsselverzeichnis ist ungültig.',503);
      try{const old=lstatSync(path('oidc'));if(!old.isFile()||old.isSymbolicLink())throw new Error('Invalid OIDC key file');}catch(error:any){if(error.code!=='ENOENT')throw new InputError('SSO-Schlüsseldatei ist ungültig.',503);}
      const temporary=join(directory,`oidc-${randomBytes(12).toString('hex')}.part`);
      try{writeFileSync(temporary,randomBytes(32),{flag:'wx',mode:0o600});renameSync(temporary,path('oidc'));}
      finally{try{unlinkSync(temporary);}catch(error:any){if(error.code!=='ENOENT')throw error;}}
    },
    path,has(purpose:'mfa'|'smtp'|'oidc'|'customer-share'){try{key(purpose);return true;}catch{return false;}},
    encrypt(purpose:'mfa'|'smtp'|'oidc'|'customer-share',owner:string,value:string,allowCreate=false){
      const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(purpose,allowCreate),nonce);
      cipher.setAAD(Buffer.from(`${purpose}:${owner}`));
      const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
      return Buffer.concat([nonce,cipher.getAuthTag(),data]).toString('base64');
    },
    decrypt(purpose:'mfa'|'smtp'|'oidc'|'customer-share',owner:string,value:string){
      const encryptionKey=key(purpose);
      try{const data=Buffer.from(value,'base64');if(data.length<29)throw new Error();const cipher=createDecipheriv('aes-256-gcm',encryptionKey,data.subarray(0,12));cipher.setAAD(Buffer.from(`${purpose}:${owner}`));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');}
      catch{throw new InputError('Verschlüsselte Daten können mit diesem Schlüssel nicht gelesen werden.',503);}
    }
  };
}
