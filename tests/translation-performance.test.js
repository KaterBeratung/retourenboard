import test from 'node:test';
import assert from 'node:assert/strict';
import {t,addTranslations,setLanguage} from '../frontend/src/i18n.js';

test('translation lookup avoids a full catalog enumeration for each unknown UI fragment',()=>{
 addTranslations({'Perf sentinel':'Perf marker'});
 const original=Object.keys;let enumerations=0;
 Object.keys=value=>{if(value?.['Perf sentinel']==='Perf marker')enumerations++;return original(value);};
 try { for(let i=0;i<250;i++)assert.equal(String(t('not-translated-'+i)),'not-translated-'+i); }
 finally {Object.keys=original;}
 assert.ok(enumerations<=1,`Repeated catalog scans: ${enumerations}`);
});

test('reverse translations preserve duplicate priority and invalidate overwritten aliases',()=>{
 addTranslations({'Perf erster':'Perf same alias','Perf zweiter':'Perf same alias'});
 assert.equal(t('Perf same alias').de,'Perf erster');
 addTranslations({'Perf erster':'Perf replacement alias'});
 assert.equal(t('Perf same alias').de,'Perf zweiter');
 assert.equal(t('Perf replacement alias').de,'Perf erster');
 addTranslations({'1':'Perf same alias'});
 assert.equal(t('Perf same alias').de,'1','Numeric keys retain the existing enumeration priority');
});

test('late dictionaries still update untranslated localized objects and preserve unknown user text',()=>{
 const label=t('Perf spaeter');addTranslations({'Perf spaeter':'Perf later'});setLanguage('en');
 try {assert.equal(String(label),'Perf later');assert.equal(String(t('customer <name> & serial 001')),'customer <name> & serial 001');}
 finally {setLanguage('de');}
});
