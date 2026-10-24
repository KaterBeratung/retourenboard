import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../dist/server/legacy-sqlite/store.js';
import {assertRestoreSchema} from '../dist/server/restore-validation.js';

test('existing masterdata migration marks only original seed identities and preserves database records',()=>{
  const dir=mkdtempSync(join(tmpdir(),'retouren-builtin-migration-')),path=join(dir,'data.sqlite');
  let s=createStore(path);
  try{
    const p=s.createProduct({sku:'BESTAND',name:'Bestandsprodukt'});
    s.createReturn({serialNumber:'BESTAND-SN',productId:p.id,reasonId:2,conditionId:7,statusId:12,resolutionId:16});
    s.updateMasterData(2,{name:'Eigener Grund'});
    s.updateMasterData(3,{name:'nicht gefallen'});
    s.deleteMasterData(4);
    const recreated=s.createMasterData('reasons',{name:'Transportschaden'});
    const supplier=s.createMasterData('suppliers',{name:'Defekt'});
    s.close();
    const db=new DatabaseSync(path);
    db.prepare("UPDATE masterdata SET kind='suppliers' WHERE id=5").run();
    if(db.prepare('PRAGMA table_info(masterdata)').all().some(column=>column.name==='builtinKey'))
      db.exec('ALTER TABLE masterdata DROP COLUMN builtinKey');
    db.prepare('DELETE FROM migrations WHERE name=?').run('masterdata-builtins-v1');
    const before={masterdata:db.prepare('SELECT * FROM masterdata ORDER BY id').all(),products:db.prepare('SELECT * FROM products').all(),returns:db.prepare('SELECT * FROM returns').all()};
    db.close();
    s=createStore(path);
    const data=s.listMasterData();
    assert.equal(s.masters.get(1).builtinKey,'reasons.defective');
    assert.equal(s.masters.get(2).builtinKey,'');
    assert.equal(s.masters.get(3).builtinKey,'');
    assert.equal(s.masters.get(5).builtinKey,'');
    assert.equal(s.masters.get(7).builtinKey,'conditions.unchecked');
    assert.equal(s.masters.get(12).builtinKey,'statuses.received');
    assert.equal(s.masters.get(16).builtinKey,'resolutions.pending');
    assert.equal(s.masters.get(recreated.id).builtinKey,'');
    assert.equal(s.masters.get(supplier.id).builtinKey,'');
    assert.deepEqual(s.db.prepare('SELECT * FROM masterdata ORDER BY id').all().map(({builtinKey,...row})=>({...row})),before.masterdata.map(row=>({...row})));
    assert.deepEqual(s.db.prepare('SELECT * FROM products').all(),before.products);
    assert.deepEqual(s.db.prepare('SELECT * FROM returns').all(),before.returns);
    assert.equal(s.getReturn(1).reasonId,2);
    assert.equal(s.getReturn(1).reason,'Eigener Grund');
    assert.doesNotThrow(()=>assertRestoreSchema(s.db));
    assert.equal(Object.values(data).flat().length,before.masterdata.length);
    s.close();s=createStore(path);
    assert.equal(s.masters.get(1).builtinKey,'reasons.defective');
    assert.equal(s.masters.get(recreated.id).builtinKey,'');
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM migrations WHERE name=?').get('masterdata-builtins-v1').n,1);
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('reopening a database never restores a standard identity after its name was changed back',()=>{
  const dir=mkdtempSync(join(tmpdir(),'retouren-renamed-builtin-')),path=join(dir,'data.sqlite');
  let s=createStore(path);
  try{
    s.updateMasterData(1,{name:'Kundengrund'});
    s.updateMasterData(1,{name:'Defekt'});
    s.close();s=createStore(path);
    assert.equal(s.masters.get(1).builtinKey,'');
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('V1 database migration preserves records and never reapplies supplier defaults',()=>{
  const dir=mkdtempSync(join(tmpdir(),'retouren-migration-')),path=join(dir,'data.sqlite');
  const db=new DatabaseSync(path);
  db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,sku TEXT UNIQUE,ean TEXT,manufacturer TEXT,supplier TEXT,category TEXT,priceCents INTEGER,description TEXT,active INTEGER,createdAt TEXT,updatedAt TEXT);
  CREATE TABLE returns(id INTEGER PRIMARY KEY AUTOINCREMENT,productId INTEGER,returnNumber TEXT UNIQUE,serialNumber TEXT,orderNumber TEXT,receiptDate TEXT,quantity INTEGER,reason TEXT,condition TEXT,status TEXT,resolution TEXT,notes TEXT,createdAt TEXT,updatedAt TEXT);
  INSERT INTO products VALUES(1,'Altprodukt','ALT','','Marke','Altlieferant','Altgruppe',500,'',1,'2026-10-05','2026-10-05');
  INSERT INTO returns VALUES(1,1,'R-ALT','','','2026-10-05',1,'Sonstiges','Ungeprüft','Abgeschlossen','Noch offen','','2026-10-05','2026-10-05');`);db.close();
  let s=createStore(path);
  try{
    assert.equal(s.listProducts().length,1);assert.equal(s.listReturns().length,1);
    assert.equal(s.getReturn(1).supplier,'Altlieferant');assert.equal(s.getReturn(1).isClosed,true);
    s.updateReturn(1,{...s.getReturn(1),supplierId:null});
    const before=s.listMasterData().suppliers.length;s.close();s=createStore(path);
    assert.equal(s.getReturn(1).supplier,'');assert.equal(s.listMasterData().suppliers.length,before);
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
