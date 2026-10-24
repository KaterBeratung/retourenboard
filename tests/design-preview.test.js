import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('dashboard links select the corresponding return scope and active products', async () => {
  const { parseDesignRoute, matchesReturnScope } = await import('../dist/public/design.js');
  assert.deepEqual(parseDesignRoute('#returns?scope=open'), { view: 'returns', scope: 'open' });
  assert.deepEqual(parseDesignRoute('#returns?scope=checking'), { view: 'returns', scope: 'checking' });
  assert.deepEqual(parseDesignRoute('#products?scope=active'), { view: 'products', scope: 'active' });
  assert.deepEqual(parseDesignRoute('#returns?scope=invalid'), { view: 'returns', scope: '' });
  assert.deepEqual(parseDesignRoute('#unknown'), { view: 'overview', scope: '' });
  const rows = [
    { isClosed: false, statusTone: 'received' },
    { isClosed: false, statusTone: 'checking' },
    { isClosed: false, statusTone: 'working' },
    { isClosed: true, statusTone: 'done' }
  ];
  assert.equal(rows.filter(row => matchesReturnScope(row, 'open')).length, 3);
  assert.equal(rows.filter(row => matchesReturnScope(row, 'checking')).length, 1);
  assert.equal(rows.filter(row => matchesReturnScope(row, 'closed')).length, 1);
  assert.equal(rows.filter(row => matchesReturnScope(row, '')).length, 4);
});

test('the design preview uses disposable seeded data and retains authentication and CSRF checks', { timeout: 20000 }, async () => {
  const project = fileURLToPath(new URL('../', import.meta.url));
  const child = spawn(process.execPath, ['scripts/design-preview.mjs', '--port', '0'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '', errors = '', dataDir;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  const exit = once(child, 'exit');
  try {
    const ready = await Promise.race([
      once(child, 'message').then(([message]) => message),
      exit.then(() => { throw new Error(`Preview exited early: ${errors}`); })
    ]);
    assert.equal(ready.type, 'ready');
    dataDir = ready.dataDir;
    assert.match(dataDir, /retourenboard-design-/);
    const base = `http://127.0.0.1:${ready.port}`, origin = { Origin: base };
    const session = await (await fetch(base + '/api/session')).json();
    assert.equal(session.unlocked, false);
    assert.equal(session.setupRequired, false);
    assert.equal(session.version, JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
    assert.equal((await fetch(base + '/api/products')).status, 401);
    const html = await (await fetch(base)).text();
    assert.match(html, /data-design-preview/);
    assert.match(html, /design\.css/);
    const css = await fetch(base + '/design.css');
    assert.equal(css.status, 200);
    assert.equal(css.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(css.headers.get('content-security-policy').includes("script-src 'self'"));
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { ...origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'demo', password: 'RetourenboardDemo2026!' }) });
    assert.equal(login.status, 200);
    const auth = await login.json(), cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { ...origin, Cookie: cookie, 'Content-Type': 'application/json' };
    const products = await (await fetch(base + '/api/products', { headers })).json();
    const returns = await (await fetch(base + '/api/returns', { headers })).json();
    assert.ok(products.length >= 5);
    assert.ok(returns.length >= 8);
    assert.ok(returns.some(row => row.isClosed));
    assert.ok(returns.some(row => row.statusTone === 'checking'));
    const input = { name: 'Vorschau-Testprodukt', sku: 'TEST-ONLY' };
    assert.equal((await fetch(base + '/api/products', { method: 'POST', headers, body: JSON.stringify(input) })).status, 403);
    assert.equal((await fetch(base + '/api/products', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': auth.csrfToken }, body: JSON.stringify(input) })).status, 201);
  } finally {
    if (child.exitCode === null) child.send('stop');
    await exit;
    if (dataDir) assert.equal(existsSync(dataDir), false, 'Only the temporary preview data should be removed on exit.');
    assert.equal(child.exitCode, 0, errors || output);
  }
});
