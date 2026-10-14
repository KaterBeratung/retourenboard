import type {DatabaseSync} from 'node:sqlite';
import {InputError} from '../shared/model.js';
import {verifyPassword} from './users.js';
import type {createMfa} from './mfa.js';
export function createAccountSettings(db:DatabaseSync,users:any,mfa:ReturnType<typeof createMfa>,{now=Date.now}:{now?:()=>number}={}){
  const attempts=new Map<number,{count:number,expiresAt:number}>();
  function reserve(userId:number){
    const time=now();for(const [id,attempt]of attempts)if(attempt.expiresAt<=time)attempts.delete(id);
    const attempt=attempts.get(userId)??{count:0,expiresAt:time+900000};
    if(attempt.count>=10)throw new InputError('Zu viele Bestätigungsversuche. Bitte nach 15 Minuten erneut versuchen.',429);
    attempt.count++;attempts.set(userId,attempt);
  }
  return {
    profile(userId:number,input?:any){if(input){if(Object.keys(input).some(k=>k!=='displayName')||typeof input.displayName!=='string'||!input.displayName.trim()||input.displayName.length>100)throw new InputError('Bitte einen Anzeigenamen mit höchstens 100 Zeichen eingeben.');db.prepare('UPDATE users SET displayName=?,updatedAt=? WHERE id=?').run(input.displayName.trim(),new Date().toISOString(),userId);}return users.get(userId);},
    preferences(userId:number,input?:any){const old=db.prepare('SELECT value FROM account_preferences WHERE userId=?').get(userId),value={theme:'system',reduceMotion:false,...(old?JSON.parse(String(old.value)):{}),...input};if(input){if(Object.keys(input).some(k=>!['theme','reduceMotion'].includes(k))||!['system','light','dark'].includes(value.theme)||typeof value.reduceMotion!=='boolean')throw new InputError('Ungültige Kontodarstellung.');db.prepare('INSERT INTO account_preferences(userId,value) VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET value=excluded.value').run(userId,JSON.stringify(value));}return value;},
    async verifyIdentity(userId:number,password:string,factor:string,beforeCommit:()=>void){reserve(userId);const account=users.credentialsById(userId);if(!account?.active||!await verifyPassword(password,account))throw new InputError('Aktuelles Passwort ist nicht korrekt.',401);beforeCommit();const current=users.credentialsById(userId);if(!current?.active||current.authVersion!==account.authVersion)throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.',401);if(mfa.status(userId).enabled)mfa.verifyFactor(userId,factor);attempts.delete(userId);}
  };
}
