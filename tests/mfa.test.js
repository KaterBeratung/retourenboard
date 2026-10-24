import test from 'node:test';
import assert from 'node:assert/strict';

test('six digit TOTP verifies RFC vectors and rejects steps outside the small window',async()=>{
  const mod=await import('../dist/server/mfa.js').catch(()=>({}));assert.equal(typeof mod.totpStep,'function');
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(mod.totpStep(secret,'287082',59000),1);
  assert.equal(mod.totpStep(secret,'081804',1111111109000),37037036);
  assert.equal(mod.totpStep(secret,'287082',90000),null);
  assert.equal(mod.totpStep(secret,'12x456',59000),null);
});
