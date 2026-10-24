import test from 'node:test';
import assert from 'node:assert/strict';
const timeline=await import('../dist/public/return-timeline.js').catch(()=>({}));
test('timeline markup retains event order and escapes opaque people, comments and filenames',()=>{
 assert.equal(typeof timeline.renderTimelineItems,'function');
 const markup=String(timeline.renderTimelineItems([{id:'comment:1',type:'comment',at:'2026-10-12T12:00:00Z',actorName:'<Alex>',text:'<script>no</script>'},{id:'file:1',type:'attachment',at:'2026-10-11T12:00:00Z',actorName:'Max',text:'beleg<1>.pdf'}],{}));
 assert.ok(markup.indexOf('&lt;Alex&gt;')<markup.indexOf('beleg&lt;1&gt;.pdf'));
 assert.match(markup,/&lt;script&gt;no&lt;\/script&gt;/);assert.doesNotMatch(markup,/<script>/);
 assert.match(markup,/datetime="2026-10-12T12:00:00Z"/);
});
