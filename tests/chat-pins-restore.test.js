import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';

import {createStore} from '../dist/server/legacy-sqlite/store.js';
import {createUsers} from '../dist/server/legacy-sqlite/users.js';
import {ensureLegacyTables} from '../dist/server/legacy-sqlite/upgrade.js';
import {assertRestoreSchema} from '../dist/server/legacy-sqlite/restore-validation.js';
function fixture(t){const store=createStore(':memory:'),users=createUsers(store);ensureLegacyTables(store.db);t.after(()=>store.close());return {store,db:store.db,users};}
test('official backup schemas with message pins and older schemas without pins are accepted',t=>{
  const f=fixture(t);assert.doesNotThrow(()=>assertRestoreSchema(f.db));f.db.exec('DROP TABLE chat_message_pins');assert.doesNotThrow(()=>assertRestoreSchema(f.db));
});

test('an older backup gains pin storage safely inside an existing migration transaction',t=>{
  const f=fixture(t);f.db.exec('DROP TABLE chat_message_pins');let migrated;
  f.store.transaction(()=>{ensureLegacyTables(f.db);assert.doesNotThrow(()=>assertRestoreSchema(f.db));assert.equal(f.db.isTransaction,true);});
assert.equal(f.db.prepare("SELECT name FROM sqlite_schema WHERE name='chat_message_pins'").get().name,'chat_message_pins');
});

for(const [label,sql]of [
  ['unexpected columns','ALTER TABLE chat_message_pins ADD COLUMN executable TEXT'],
  ['triggers','CREATE TRIGGER malicious_pin AFTER INSERT ON chat_message_pins BEGIN DELETE FROM chat_messages; END'],
  ['generated columns',"ALTER TABLE chat_message_pins ADD COLUMN computed TEXT GENERATED ALWAYS AS ('secret') VIRTUAL"],
  ['expression indexes','CREATE INDEX malicious_pin_expression ON chat_message_pins(length(pinnedAt))'],
  ['extra tables','CREATE TABLE malicious_pin_data(secret TEXT)'],
  ['wrong foreign keys',"DROP TABLE chat_message_pins; CREATE TABLE chat_message_pins(messageId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,pinnedById INTEGER REFERENCES users(id) ON DELETE SET NULL,pinnedAt TEXT NOT NULL)"],
  ['wrong defaults',"DROP TABLE chat_message_pins; CREATE TABLE chat_message_pins(messageId INTEGER PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,pinnedById INTEGER REFERENCES users(id) ON DELETE SET NULL,pinnedAt TEXT NOT NULL DEFAULT 'untrusted')"]
])test(`message pin schema does not allow ${label}`,t=>{
  const f=fixture(t);f.db.exec(sql);assert.throws(()=>assertRestoreSchema(f.db),/unzulässiges Datenbankschema/);
});
