import type {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {TOTP,Secret} from '../vendor/totp.js';
import {qrDataUrl} from '../vendor/qr.js';
import {InputError} from '../shared/model.js';
import type {createSecrets} from './secrets.js';
export type MfaProof={userId:number,scope:'account'|'reset-enrollment',id:string};
const randomId=()=>randomBytes(32).toString('hex');
const digest=(code:string)=>createHash('sha256').update(code.replaceAll('-','').toUpperCase()).digest('hex');
const codes=()=>Array.from({length:10},()=>randomBytes(16).toString('hex').toUpperCase().match(/.{1,8}/g)!.join('-'));
export function totpStep(secret:string,code:string,time:number):number|null{
  if(!/^\d{6}$/.test(code))return null;
  const totp=new TOTP({secret:Secret.fromBase32(secret),algorithm:'SHA1',digits:6,period:30});
  const delta=totp.validate({token:code,timestamp:time,window:1});
  return delta===null?null:Math.floor(time/30000)+delta;
}
export function createMfa({db,users,clock,secrets,record=()=>{}}:{db:DatabaseSync,users:any,clock:{now():number},secrets:ReturnType<typeof createSecrets>,record?:(change:any)=>void}){
  const challenges=new Map<string,{userId:number,version:number,ip:string,expiresAt:number,failures:number,enrollment:boolean}>();
  const attempts=new Map<string,{count:number,expiresAt:number}>();
  const now=()=>clock.now(),row=(userId:number)=>db.prepare('SELECT * FROM user_mfa WHERE userId=?').get(userId) as any;
  function prune(){const time=now();for(const [id,c]of challenges)if(c.expiresAt<=time)challenges.delete(id);for(const [key,a]of attempts)if(a.expiresAt<=time)attempts.delete(key);db.prepare('DELETE FROM mfa_enrollments WHERE expiresAt<=?').run(time);}
  const attemptKeys=(userId:number,ip:string)=>[`u:${userId}`,JSON.stringify(['client',userId,ip])];
  function limit(userId:number,ip:string){prune();for(const key of attemptKeys(userId,ip))if((attempts.get(key)?.count??0)>=10)throw new InputError('Zu viele 2FA-Fehlversuche. Bitte nach 15 Minuten erneut versuchen.',429);}
  function fail(userId:number,ip:string){for(const key of attemptKeys(userId,ip)){const a=attempts.get(key)??{count:0,expiresAt:now()+900000};a.count++;attempts.set(key,a);}if(attempts.size>10000)attempts.delete(attempts.keys().next().value!);}
  function transaction<T>(job:()=>T):T{const nested=db.isTransaction;if(!nested)db.exec('BEGIN IMMEDIATE');try{const result=job();if(!nested)db.exec('COMMIT');return result;}catch(error){if(!nested&&db.isTransaction)db.exec('ROLLBACK');throw error;}}
  function bump(userId:number){db.prepare('UPDATE users SET authVersion=authVersion+1,updatedAt=? WHERE id=?').run(new Date(now()).toISOString(),userId);invalidate(userId);}
  function invalidate(userId:number){for(const [id,c]of challenges)if(c.userId===userId)challenges.delete(id);db.prepare('DELETE FROM mfa_enrollments WHERE userId=?').run(userId);}
  function challenge(id:string,ip:string,enrollment:boolean){prune();const c=challenges.get(id),account=c?users.credentialsById(c.userId):null;if(!c||c.ip!==ip||c.enrollment!==enrollment||!account?.active||account.authVersion!==c.version){challenges.delete(id);throw new InputError('Anmeldeschritt abgelaufen. Bitte erneut anmelden.',401);}limit(c.userId,ip);return c;}
  function verifyFactor(userId:number,code:string,ip='account'){
    limit(userId,ip);
    const factor=row(userId);if(!factor?.secretEnc)throw new InputError('2FA ist nicht eingerichtet.',401);
    if(typeof code!=='string'||code.length>100){fail(userId,ip);throw new InputError('2FA-Code ist ungültig. Bitte einen neuen Code oder Recoverycode eingeben.',401);}
    const consumed=db.prepare('UPDATE recovery_codes SET usedAt=? WHERE userId=? AND hash=? AND usedAt IS NULL').run(new Date(now()).toISOString(),userId,digest(code));
    if(consumed.changes===1)return;
    const step=totpStep(secrets.decrypt('mfa',String(userId),factor.secretEnc),code,now());
    if(step!==null&&step>factor.lastStep&&db.prepare('UPDATE user_mfa SET lastStep=? WHERE userId=? AND lastStep<?').run(step,userId,step).changes===1)return;
    fail(userId,ip);throw new InputError('2FA-Code ist ungültig oder bereits verwendet. Bitte den nächsten App-Code abwarten oder einen Recoverycode eingeben.',401);
  }
  function needed(userId:number){const factor=row(userId);return !!factor?.secretEnc||!!factor?.forceEnrollment;}
  return {
    needed,verifyFactor,invalidate,
    status(userId:number){const r=row(userId);return {enabled:!!r?.secretEnc,enrollmentRequired:!!r?.forceEnrollment,keyAvailable:secrets.has('mfa'),recoveryCodesRemaining:Number(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE userId=? AND usedAt IS NULL').get(userId)!.n)};},
    beginChallenge(userId:number,ip:string){limit(userId,ip);const account=users.credentialsById(userId);if(!account?.active)throw new InputError('Konto ist nicht verfügbar.',401);const id=randomId(),enrollment=!!row(userId)?.forceEnrollment,expiresAt=now()+300000;challenges.set(id,{userId,version:account.authVersion,ip,expiresAt,failures:0,enrollment});if(challenges.size>1000)challenges.delete(challenges.keys().next().value!);return {challengeId:id,expiresAt,...(enrollment?{enrollmentRequired:true}:{mfaRequired:true})};},
    proofForEnrollment(id:string,ip:string):MfaProof{const c=challenge(id,ip,true);return {userId:c.userId,scope:'reset-enrollment',id};},
    verifyChallenge(id:string,code:string,ip:string){const c=challenge(id,ip,false);try{verifyFactor(c.userId,code,ip);}catch(error){if(++c.failures>=5)challenges.delete(id);throw error;}challenges.delete(id);return {userId:c.userId};},
    async beginEnrollment(proof:MfaProof){
      prune();const secret=new Secret({size:20}).base32;
      const enrolled=Number(db.prepare('SELECT COUNT(*) AS n FROM user_mfa WHERE secretEnc IS NOT NULL').get()!.n)>0;
      const enc=secrets.encrypt('mfa',String(proof.userId),secret,!enrolled),id=randomId(),expiresAt=Math.min(now()+600000,proof.scope==='reset-enrollment'?challenges.get(proof.id)?.expiresAt??0:Infinity);
      const uri=new TOTP({issuer:'retourenboard.',label:users.get(proof.userId).username,secret:Secret.fromBase32(secret),digits:6,period:30,algorithm:'SHA1'}).toString();
      const qr=await qrDataUrl(uri);
      if(expiresAt<=now())throw new InputError('Einrichtung abgelaufen.',401);
      db.prepare('DELETE FROM mfa_enrollments WHERE userId=? AND scopeId=?').run(proof.userId,proof.id);
      db.prepare('INSERT INTO mfa_enrollments(id,userId,scopeId,scope,secretEnc,expiresAt) VALUES(?,?,?,?,?,?)').run(id,proof.userId,proof.id,proof.scope,enc,expiresAt);
      return {enrollmentId:id,secret,qrDataUrl:qr,expiresAt};
    },
    verifyEnrollment(proof:MfaProof,id:string,code:string){
      prune();const p=db.prepare('SELECT * FROM mfa_enrollments WHERE id=? AND userId=? AND scopeId=? AND scope=?').get(id,proof.userId,proof.id,proof.scope) as any;
      if(!p||p.confirmationId)throw new InputError('Einrichtung abgelaufen oder bereits bestätigt. Bitte neu beginnen.',401);
      limit(proof.userId,proof.id);
      const step=totpStep(secrets.decrypt('mfa',String(proof.userId),p.secretEnc),code,now());
      if(step===null){fail(proof.userId,proof.id);throw new InputError('App-Code ist ungültig.',401);}
      const recoveryCodes=codes(),confirmationId=randomId();
      db.prepare('UPDATE mfa_enrollments SET confirmationId=?,hashes=? WHERE id=?').run(confirmationId,JSON.stringify({step,hashes:recoveryCodes.map(digest)}),id);
      return {confirmationId,recoveryCodes};
    },
    confirmEnrollment(proof:MfaProof,id:string,saved:boolean){
      prune();if(saved!==true)throw new InputError('Bitte zuerst die Sicherung der Recoverycodes bestätigen.');
      return transaction(()=>{const p=db.prepare('SELECT * FROM mfa_enrollments WHERE confirmationId=? AND userId=? AND scopeId=? AND scope=?').get(id,proof.userId,proof.id,proof.scope) as any;if(!p)throw new InputError('Einrichtung abgelaufen.',401);const value=JSON.parse(p.hashes);
        db.prepare('INSERT INTO user_mfa(userId,secretEnc,lastStep,forceEnrollment) VALUES(?,?,?,0) ON CONFLICT(userId) DO UPDATE SET secretEnc=excluded.secretEnc,lastStep=excluded.lastStep,forceEnrollment=0').run(proof.userId,p.secretEnc,value.step);
        db.prepare('DELETE FROM recovery_codes WHERE userId=?').run(proof.userId);for(const hash of value.hashes)db.prepare('INSERT INTO recovery_codes(userId,hash) VALUES(?,?)').run(proof.userId,hash);bump(proof.userId);record({entity:'mfa',id:proof.userId,action:'enable',after:{enabled:true}});return {userId:proof.userId,enabled:true};});
    },
    replaceRecoveryCodes(userId:number){return transaction(()=>{const values=codes();db.prepare('DELETE FROM recovery_codes WHERE userId=?').run(userId);for(const code of values)db.prepare('INSERT INTO recovery_codes(userId,hash) VALUES(?,?)').run(userId,digest(code));record({entity:'mfa',id:userId,action:'recoveryCodes'});return values;});},
    disable(userId:number){transaction(()=>{db.prepare('DELETE FROM user_mfa WHERE userId=?').run(userId);db.prepare('DELETE FROM recovery_codes WHERE userId=?').run(userId);bump(userId);record({entity:'mfa',id:userId,action:'disable',after:{enabled:false}});});},
    reset(userId:number){transaction(()=>{db.prepare('INSERT INTO user_mfa(userId,secretEnc,lastStep,forceEnrollment) VALUES(?,NULL,-1,1) ON CONFLICT(userId) DO UPDATE SET secretEnc=NULL,lastStep=-1,forceEnrollment=1').run(userId);db.prepare('DELETE FROM recovery_codes WHERE userId=?').run(userId);bump(userId);record({entity:'mfa',id:userId,action:'reset'});});}
  };
}
