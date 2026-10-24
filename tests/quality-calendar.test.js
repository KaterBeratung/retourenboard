import test from 'node:test';
import assert from 'node:assert/strict';

test('repeated calendar conversions reuse formatters across local dates and zones',async t=>{
  const Original=Intl.DateTimeFormat;
  let allocations=0;
  t.mock.method(Intl,'DateTimeFormat',function(...args){allocations++;return new Original(...args);});
  const {calendarDate}=await import('../dist/server/return-rules.js?calendar-reuse');
  const midnight=Date.parse('2026-10-06T23:30:00Z');
  for(let i=0;i<1000;i++){
    assert.equal(calendarDate(midnight,'Europe/Berlin'),'2026-10-07');
    assert.equal(calendarDate(midnight,'America/New_York'),'2026-10-06');
  }
  assert.ok(allocations<=2,`2000 conversions of two zones allocated ${allocations} formatters`);
});

test('calendar formatter reuse preserves midnight, leap days and timezone changes',async()=>{
  const {calendarDate}=await import('../dist/server/return-rules.js?calendar-boundaries');
  const cases=[
    ['2024-02-28T23:30:00Z','Europe/Berlin','2024-02-29'],
    ['2024-02-28T23:30:00Z','America/New_York','2024-02-28'],
    ['2024-02-29T23:30:00Z','Europe/Berlin','2024-03-01'],
    ['2024-02-29T23:30:00Z','America/New_York','2024-02-29'],
    ['2026-12-31T10:30:00Z','Pacific/Kiritimati','2027-01-01'],
    ['2026-12-31T10:30:00Z','Pacific/Honolulu','2026-12-31'],
    ['2026-03-29T00:59:00Z','Europe/Berlin','2026-03-29'],
    ['2026-03-29T01:00:00Z','Europe/Berlin','2026-03-29'],
    ['2026-10-25T00:59:00Z','Europe/Berlin','2026-10-25'],
    ['2026-10-25T01:00:00Z','Europe/Berlin','2026-10-25'],
    ['2024-02-28T23:30:00Z','Europe/Berlin','2024-02-29'],
  ];
  for(const [instant,zone,expected] of cases)assert.equal(calendarDate(Date.parse(instant),zone),expected,`${instant} in ${zone}`);
  assert.throws(()=>calendarDate(Date.now(),'Invalid/Timezone'),RangeError);
});

test('one-off timezones do not retain an unlimited collection of formatters',async t=>{
  const Original=Intl.DateTimeFormat;
  let allocations=0;
  t.mock.method(Intl,'DateTimeFormat',function(...args){allocations++;return new Original(...args);});
  const {calendarDate}=await import('../dist/server/return-rules.js?calendar-capacity');
  const zones=Intl.supportedValuesOf('timeZone').slice(0,128),instant=Date.parse('2026-10-06T12:00:00Z');
  const firstDate=calendarDate(instant,zones[0]);
  for(const zone of zones.slice(1))assert.match(calendarDate(instant,zone),/^2026-10-0[67]$/);
  const beforeRevisit=allocations;
  assert.equal(calendarDate(instant,zones[0]),firstDate);
  assert.equal(allocations,beforeRevisit+1,'a cold timezone should be released after many one-off zones');
});
