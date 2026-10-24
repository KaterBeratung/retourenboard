import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {postgresFixture} from './helpers/postgres.js';
import * as contracts from '../dist/server/database/schema.js';
import {migratePostgres} from '../dist/server/database/migrations.js';
import {exportData,importData} from '../dist/server/database/data-transfer.js';

test('existing PostgreSQL schema1 upgrades additively while preserving the baseline checksum and product',async t=>{
 const f=await postgresFixture(t),base=contracts.BASELINE_TABLE_CONTRACTS??contracts.TABLE_CONTRACTS,sql=[...base.map(row=>row.createSql),...contracts.INDEX_STATEMENTS],checksum=createHash('sha256').update(JSON.stringify(sql)).digest('hex');
 await f.database.query('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,appliedAt TEXT NOT NULL)');
 for(const statement of sql)await f.database.query(statement);
 await f.database.query('INSERT INTO schema_migrations VALUES(1,$1,$2,$3)',['postgresql-baseline',checksum,new Date().toISOString()]);
 await f.database.query("INSERT INTO products(name,sku,ean,manufacturer,supplier,category,priceCents,description,active,createdAt,updatedAt) VALUES('Keep','KEEP','','','','',100,'',1,'2026-10-15','2026-10-15')");
 await migratePostgres(f.database);await migratePostgres(f.database);
 assert.deepEqual((await f.database.query('SELECT version FROM schema_migrations ORDER BY version')).rows,[{version:1},{version:2},{version:3},{version:4},{version:5}]);
 assert.equal((await f.database.query('SELECT checksum FROM schema_migrations WHERE version=1')).rows[0].checksum,checksum);
 assert.equal((await f.database.query("SELECT name FROM products WHERE sku='KEEP'")).rows[0].name,'Keep');
 assert.equal((await f.database.query('SELECT COUNT(*) AS n FROM disposals')).rows[0].n,0);
});

test('historical schema1 streams remain importable into the current schema with empty disposal tables',async t=>{
 const source=await postgresFixture(t),target=await postgresFixture(t);await migratePostgres(source.database);
 const path=join(source.dataDir,'backup.jsonl');await exportData(source.database,path);
 const lines=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse),extras=new Set(['disposals','disposal_events','product_versions','return_versions','sso_providers','sso_identities','sso_access_requests']);
 lines[0].schema=1;for(const key of extras)delete lines[0].sequences[key];lines.at(-1).tables=lines.at(-1).tables.filter(t=>!extras.has(t.name));
 writeFileSync(path,lines.filter(row=>!extras.has(row.table)).map(row=>JSON.stringify(row)).join('\n')+'\n');
 await importData(target.database,path);
 assert.equal((await target.database.query('SELECT COUNT(*) AS n FROM disposals')).rows[0].n,0);
 assert.equal((await target.database.query('SELECT COUNT(*) AS n FROM disposal_events')).rows[0].n,0);
 assert.equal((await target.database.query('SELECT COUNT(*) AS n FROM masterdata')).rows[0].n,20);
});
