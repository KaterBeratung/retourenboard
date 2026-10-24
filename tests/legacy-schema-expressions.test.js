import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {assertRestoreSchema} from '../dist/server/legacy-sqlite/restore-validation.js';
import {LEGACY_TABLES} from '../dist/server/legacy-sqlite/catalog.js';

function fixture(t,sql){const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(sql);return db;}
for(const [label,sql]of [
 ['CHECK allocation','CREATE TABLE products(id INTEGER PRIMARY KEY,CHECK(length(randomblob(1024))>0)); INSERT INTO products VALUES(1)'],
 ['alternate allocation','CREATE TABLE products(id INTEGER PRIMARY KEY,CHECK(length(zeroblob(1024))>0))'],
 ['commented CHECK','CREATE TABLE products(id INTEGER CHECK /* comment */ (length(randomblob(1024))>0))'],
 ['nested CHECK',"CREATE TABLE users(role TEXT CHECK(role IN ('admin','member','viewer') OR length(randomblob(1024))>0))"],
 ['default function','CREATE TABLE products(id INTEGER,name TEXT DEFAULT (hex(randomblob(16))))'],
 ['default expression',"CREATE TABLE products(id INTEGER,name TEXT DEFAULT (printf('%01024d',1)))"],
 ['dynamic default','CREATE TABLE products(id INTEGER,name TEXT DEFAULT CURRENT_TIMESTAMP)'],
 ['quoted function',"CREATE TABLE products(id INTEGER CHECK(\"length\"(randomblob(1024))>0))"],
 ['constant expression','CREATE TABLE products(id INTEGER CHECK(1+1=2))']
])test(`legacy schema rejects untrusted ${label} before evaluation`,t=>{
 const db=fixture(t,sql);
 assert.throws(()=>assertRestoreSchema(db),/unzulässiges Datenbankschema/);
});
test('all official legacy constraints and defaults remain accepted',t=>{
 const db=fixture(t,'');for(const table of LEGACY_TABLES)db.exec(table.sql);
 assert.doesNotThrow(()=>assertRestoreSchema(db));
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('old two-role accounts and missing optional tables remain accepted',t=>{
 const db=fixture(t,"CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT CHECK(role IN ('admin','member')),active INTEGER DEFAULT 1); INSERT INTO users VALUES(7,'admin',1)");
 assert.doesNotThrow(()=>assertRestoreSchema(db));assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
test('literal defaults containing SQL words, quotes and comments remain data',t=>{
 const db=fixture(t,"CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT DEFAULT 'CHECK(randomblob(1024)) -- it''s literal',priceCents INTEGER DEFAULT -1,description TEXT DEFAULT (NULL)); INSERT INTO products(id) VALUES(1)");
 assert.doesNotThrow(()=>assertRestoreSchema(db));assert.equal(db.prepare('SELECT name FROM products').get().name,"CHECK(randomblob(1024)) -- it's literal");
});
