import assert from 'node:assert/strict';
import {TOTP,Secret} from '../../dist/vendor/totp.js';
import {testPassword} from './runtime.js';
export const appCode=(secret,time)=>new TOTP({secret:Secret.fromBase32(secret),algorithm:'SHA1',digits:6,period:30}).generate({timestamp:time});
export async function enableMfa(f,auth,time){
  const begin=await f.request('/api/account/mfa/setup','POST',{password:testPassword},auth);assert.equal(begin.status,200);
  const pending=await begin.json();assert.match(pending.qrDataUrl,/^data:image\/png;base64,/);
  const verify=await f.request('/api/account/mfa/verify','POST',{enrollmentId:pending.enrollmentId,code:appCode(pending.secret,time)},auth);assert.equal(verify.status,200);
  const confirmed=await verify.json();assert.equal(confirmed.recoveryCodes.length,10);
  assert.equal((await(await f.request('/api/account/mfa','GET',undefined,auth)).json()).enabled,false);
  const done=await f.request('/api/account/mfa/confirm','POST',{confirmationId:confirmed.confirmationId,saved:true},auth);assert.equal(done.status,200);
  const session=await done.json();
  return {...pending,...confirmed,auth:f.authFrom(done,session),session};
}
