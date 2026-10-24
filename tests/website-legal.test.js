import test from 'node:test';
import assert from 'node:assert/strict';
import {renderWebsiteLegal} from '../scripts/website-legal.mjs';

const template='@@LEGAL_STATUS@@<section>@@OPERATOR@@@@HOSTING@@@@LOG_RETENTION@@@@ADDITIONAL_LEGAL@@</section>';
const operator={operatorName:'Demo & Partner',address:['Musterweg 1','12345 Beispielstadt'],email:'demo@example.test',hostingProvider:'Demo Host',hostingCountry:'Deutschland',logRetention:'7 Tage',additionalLegalInformation:''};
test('missing operator information remains a visible draft without fabricated identities',()=>{
 const result=renderWebsiteLegal(template,{});assert.equal(result.complete,false);assert.match(result.html,/Entwurf/);assert.match(result.html,/Noch nicht hinterlegt/);assert.doesNotMatch(result.html,/@{2}[A-Z_]+@{2}/);
});
test('operator configuration is escaped before insertion into public legal pages',()=>{
 const result=renderWebsiteLegal(template,{...operator,operatorName:'<img src=x onerror=alert(1)>',additionalLegalInformation:'<script>alert(1)</script>'});
 assert.equal(result.complete,true);assert.doesNotMatch(result.html,/<img|<script/);assert.match(result.html,/&lt;img/);assert.match(result.html,/mailto:demo@example.test/);
});
test('invalid operator email and malformed configuration cannot silently build public legal pages',()=>{
 for(const config of [null,[],{...operator,email:'bad\nemail'},{...operator,address:'address'},{...operator,hostingProvider:42}])assert.throws(()=>renderWebsiteLegal(template,config));
});
