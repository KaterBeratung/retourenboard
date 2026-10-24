import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { createApp } from './helpers/postgres-fixtures.js';
test('the normal application serves the adopted design without demo credentials or seeded accounts', async (t) => {
    const app = await createApp({ dbPath: ':memory:' });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => app.close());
    const base = `http://127.0.0.1:${app.server.address().port}`;
    for (const route of ['/', '/admin']) {
        const html = await (await fetch(base + route)).text();
        assert.match(html, /data-ui="board"/);
        assert.equal((html.match(/id="nav-toggle"/g) || []).length, 0);
        assert.match(html, /data-page="login"/);
        assert.doesNotMatch(html, /RetourenboardDemo2026|Designvorschau|Testdaten/);
    }
    for (const route of ['/design.css', '/motion.css', '/bootstrap.js']) {
        const response = await fetch(base + route);
        assert.equal(response.status, 200, route);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    const session = await (await fetch(base + '/api/session')).json();
    const supportIcon=await fetch(base+'/kofi.avif');
    assert.equal(supportIcon.status,200,'The public support icon must also load on the login page');
    assert.match(supportIcon.headers.get('content-type'),/^image\/avif/);
    assert.ok((await supportIcon.arrayBuffer()).byteLength>0);
    assert.equal(session.setupRequired, true);
    assert.equal((await fetch(base + '/api/returns')).status, 401);
    for (const route of ['/app.js', '/design.js', '/switches.js'])
        assert.equal((await fetch(base + route)).status, 401);
    const setup = await fetch(base + '/api/setup', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Tester', password: 'Test-Password123!' }) });
    assert.equal(setup.status, 201);
    const Cookie = setup.headers.get('set-cookie').split(';')[0];
    for (const route of ['/', '/admin']) {
        const html = await (await fetch(base + route, { headers: { Cookie } })).text();
        assert.equal((html.match(/id="nav-toggle"/g) || []).length, 1);
        assert.doesNotMatch(html, /RetourenboardDemo2026|Designvorschau|Testdaten/);
    }
    for (const route of ['/app.js', '/design.js', '/switches.js']) {
        const response = await fetch(base + route, { headers: { Cookie } });
        assert.equal(response.status, 200);
        assert.doesNotMatch(await response.text(), /RetourenboardDemo2026/);
    }
});
test('quick search input is grouped and a cancelled search cannot affect the next page', async (t) => {
    const { createDebouncedTask } = await import('../dist/public/design.js');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    const task = createDebouncedTask(() => calls++, 100);
    task.run();
    t.mock.timers.tick(60);
    task.run();
    t.mock.timers.tick(60);
    assert.equal(calls, 0);
    t.mock.timers.tick(40);
    assert.equal(calls, 1);
    task.run();
    task.cancel();
    t.mock.timers.tick(200);
    assert.equal(calls, 1);
});
test('background updates redraw only when inventory or master data changes', async () => {
    const { inventoryChanged } = await import('../dist/public/design.js');
    const previous = { products: [{ id: 1, name: 'Monitor', active: true }], returns: [{ id: 1, status: 'Eingegangen', notes: '' }], masterdata: { suppliers: [{ id: 1, name: 'Handel', active: true }] } };
    assert.equal(inventoryChanged(previous, structuredClone(previous)), false);
    for (const change of [
        snapshot => { snapshot.returns[0].notes = 'Geprüft'; },
        snapshot => { snapshot.returns[0].status = 'In Prüfung'; },
        snapshot => { snapshot.products[0].active = false; },
        snapshot => { snapshot.masterdata.suppliers[0].name = 'Neuer Name'; },
        snapshot => { snapshot.returns = []; }
    ]) {
        const next = structuredClone(previous);
        change(next);
        assert.equal(inventoryChanged(previous, next), true);
    }
});
test('typing during an in-flight refresh defers its result until a safe refresh', async () => {
    const { readWhenIdle } = await import('../dist/public/design.js');
    let busy = false, resolveRead, reads = 0;
    const first = readWhenIdle(() => { reads++; return new Promise(resolve => { resolveRead = resolve; }); }, () => busy);
    busy = true;
    resolveRead({ notes: 'Updated by another user' });
    assert.equal(await first, undefined, 'An in-flight result must not replace a field that gained focus.');
    await readWhenIdle(async () => { reads++; return Promise.resolve({ notes: 'Blocked' }); }, () => busy);
    assert.equal(reads, 1, 'An already active field should prevent unnecessary reads.');
    busy = false;
    assert.deepEqual(await readWhenIdle(async () => { reads++; return Promise.resolve({ notes: 'Updated by another user' }); }, () => busy), { notes: 'Updated by another user' });
    assert.equal(reads, 2);
});
