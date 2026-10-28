import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {runtimeFixture} from './helpers/runtime.js';
import {postgresFixture} from './helpers/postgres.js';
import {exportData,importData} from '../dist/server/database/data-transfer.js';
import {prepareBackup} from '../dist/server/backup-restore.js';

test('SSO backup contains encrypted providers and bindings and can be restored without copying its secret key',async t=>{
 const f=await runtimeFixture(t),{data}=await f.setup(),accounts=f.app.ssoAccounts;
 const p=await accounts.saveProvider(null,{type:'oidc',label:'Company',issuer:'https://sso.example',clientId:'board',clientSecret:'private-client-secret',active:true,authMethod:'client_secret_basic',allowedOrigins:[]});await accounts.setEnabled(true);
 const request=await accounts.requestAccess(p.id,{iss:'https://sso.example',sub:'employee'});await accounts.decide(request.id,{approve:true,userId:data.user.id,revision:request.revision});
 const backup=await f.app.backups.create({id:data.user.id,name:'Test Admin',source:'user'}),file=(await f.app.backups.file(backup.id)).path,target=join(f.dataDir,'restore-check');
 const summary=await prepareBackup({archive:file,target,databaseConfig:f.databaseConfig});assert.equal(summary.administratorAccess,true);
 const portable=readFileSync(join(target,'data.jsonl'),'utf8');assert.equal(JSON.parse(portable.split('\n')[0]).schema,5);assert.equal(portable.includes('private-client-secret'),false);
 assert.match(portable,/sso_providers/);assert.match(portable,/sso_identities/);
 const restored=await postgresFixture(t);await importData(restored.database,join(target,'data.jsonl'));
 assert.equal((await restored.database.query('SELECT COUNT(*) AS n FROM sso_identities')).rows[0].n,1);
});

test('portable schema 3 stays importable with empty SSO tables',async t=>{
 const f=await runtimeFixture(t);await f.setup();const file=join(f.dataDir,'old.jsonl');await exportData(f.app.store.db,file);
 const records=readFileSync(file,'utf8').trim().split('\n').map(JSON.parse),header=records[0],footer=records.at(-1);header.schema=3;delete header.sequences.disposal_comments;
 footer.tables=footer.tables.filter(r=>!r.name.startsWith('sso_')&&r.name!=='disposal_comments');
 writeFileSync(file,records.filter(r=>!r.table?.startsWith('sso_')&&r.table!=='disposal_comments').map(r=>JSON.stringify(r)).join('\n')+'\n');
 const restored=await postgresFixture(t);await importData(restored.database,file);
 assert.equal((await restored.database.query('SELECT COUNT(*) AS n FROM users')).rows[0].n,1);
 assert.equal((await restored.database.query('SELECT COUNT(*) AS n FROM sso_providers')).rows[0].n,0);
});
