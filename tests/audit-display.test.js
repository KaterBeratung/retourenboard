import test from 'node:test';
import assert from 'node:assert/strict';
import * as audit from '../dist/public/admin-audit.js';

test('long audit entries retain all changes behind a compact disclosure',()=>{
  assert.equal(typeof audit.renderAuditChanges,'function');
  const changes=Object.fromEntries(Array.from({length:8},(_,i)=>['field'+i,{before:'old'+i,after:'new'+i}]));
  const html=audit.renderAuditChanges(changes);
  assert.match(html,/<details/);
  assert.match(html,/8 geänderte Felder/);
  for(let i=0;i<8;i++)assert.ok(html.includes('new'+i));
});

test('audit disclosure safely renders untrusted names and values',()=>{
  assert.equal(typeof audit.renderAuditChanges,'function');
  const html=audit.renderAuditChanges({'<img onerror=evil()>':{before:null,after:'<script>evil()</script>'}});
  assert.doesNotMatch(html,/<script|<img|<details/);
  assert.match(html,/&lt;script&gt;/);
  assert.equal(audit.renderAuditChanges({}),'Sicherheits- oder Verwaltungsaktion');
});
