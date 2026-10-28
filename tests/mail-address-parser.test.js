import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

// Public upstream regression inputs, using reserved example domains only.
// GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h.
const cases = [
 ['nested address comments', 'Recipient (x(y) <other@outside.example>) <recipient@allowed.example>', 'recipient@allowed.example'],
 ['semicolon inside a group comment', 'G: (a; <other@outside.example>) <recipient@allowed.example>;', 'recipient@allowed.example'],
 ['angle bracket inside a quoted local part', '<"a@outside.example>"@allowed.example>', '"a@outside.example>"@allowed.example'],
];
for (const [name, address, expected] of cases) {
 test(`mail envelope preserves intended recipient with ${name}`, async () => {
  const transport = nodemailer.createTransport({jsonTransport:true});
  try {
   const result = await transport.sendMail({from:'board@example.test',bcc:address,subject:'Local parser check',text:'Synthetic fixture only.'});
   assert.equal(result.envelope.to.length,1);
   // Envelope serialization may normalize quoted local parts; the security
   // boundary is that display text never changes the destination domain.
   assert.equal(result.envelope.to[0].slice(result.envelope.to[0].lastIndexOf('@')+1),'allowed.example');
   if (!address.startsWith('<')) assert.deepEqual(result.envelope.to,[expected]);
  } finally { transport.close(); }
 });
}
