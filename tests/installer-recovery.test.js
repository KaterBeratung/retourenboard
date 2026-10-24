import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseEnv} from 'node:util';

test('retry preserves desired PostgreSQL config after recovering a precommit SQLite rollback',async()=>{
 const moduleURL=new URL('../scripts/install-recovery.mjs',import.meta.url);assert.ok(existsSync(moduleURL),'retry needs to preserve the configured PostgreSQL candidate across recovery');
 const {preserveInstallCandidate}=await import(moduleURL.href),dir=mkdtempSync(join(tmpdir(),'retourenboard-candidate-'));
 try{const configFile=join(dir,'current.env'),unitFile=join(dir,'current.service'),previousConfigFile=join(dir,'previous.env'),previousUnitFile=join(dir,'previous.service');const candidate='DATA_DIR=/var/lib/retourenboard\nDATABASE_URL_FILE=/etc/retourenboard/database-url\nHOST=0.0.0.0\n',legacy='DB_PATH=/var/lib/retourenboard/retouren.sqlite\n';writeFileSync(configFile,candidate);writeFileSync(unitFile,'partially activated PG service');writeFileSync(previousConfigFile,'stale shell snapshot');writeFileSync(previousUnitFile,'stale unit');
 const previous=await preserveInstallCandidate({configFile,unitFile,previousConfigFile,previousUnitFile,recover:async()=>{writeFileSync(configFile,legacy);writeFileSync(unitFile,'recovered SQLite service');return true;}});
 assert.equal(parseEnv(readFileSync(configFile,'utf8')).DATABASE_URL_FILE,'/etc/retourenboard/database-url');assert.equal(readFileSync(configFile,'utf8'),candidate);assert.equal(previous.config.toString(),legacy);assert.equal(previous.unit.toString(),'recovered SQLite service');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('retry retains its candidate when recovery removes a config that did not exist before installation',async()=>{
 const {preserveInstallCandidate}=await import('../scripts/install-recovery.mjs'),dir=mkdtempSync(join(tmpdir(),'retourenboard-new-candidate-'));
 try{const configFile=join(dir,'config.env'),unitFile=join(dir,'service');writeFileSync(configFile,'DATABASE_URL_FILE=/etc/retourenboard/database-url\n');
 const old=await preserveInstallCandidate({configFile,unitFile,recover:async()=>{unlinkSync(configFile);return true;}});assert.equal(old.config,undefined);assert.equal(old.unit,undefined);assert.equal(parseEnv(readFileSync(configFile,'utf8')).DATABASE_URL_FILE,'/etc/retourenboard/database-url');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
