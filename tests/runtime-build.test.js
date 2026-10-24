import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createApp } from './helpers/postgres-fixtures.js';
import { selectRuntime } from '../scripts/runtime-layout.mjs';
// A stale compatibility entry must not omit the actual application's admin UI.
test('compatibility entry serves the same private admin page as the main runtime', async (t) => {
    const app = await createApp({ dbPath: ':memory:' });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    t.after(async () => app.close());
    const base = `http://127.0.0.1:${app.server.address().port}`;
    assert.equal((await fetch(base + '/admin', { redirect: 'manual' })).status, 302);
    const created = await fetch(base + '/api/setup', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Admin', password: 'Runtime-Testpasswort!' }) });
    assert.equal(created.status, 201);
    const Cookie = created.headers.get('set-cookie').split(';')[0];
    const page = await fetch(base + '/admin', { headers: { Cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /data-page="admin"/);
    assert.equal((await fetch(base + '/api/products')).status, 401);
});
test('release validation refuses missing security or interface modules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'retourenboard-runtime-contract-'));
    const modules = ['server/client-address.js', 'server/request-access.js', 'server/stored-files.js', 'server/restore-validation.js', 'server/server-routes.js', 'server/service-control.js', 'server/service-control-routes.js', 'server/server-log.js', 'public/server-operations.js', 'public/auth-context.js', 'public/bootstrap.js', 'public/login.js', 'public/auth-security.js', 'public/ui.js', 'public/switches.js', 'public/switches.css'];
    const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    try {
        mkdirSync(join(dir, 'deploy'));
        mkdirSync(join(dir, 'dist'));
        for (const target of ['package.json', 'dist/package.json'])
            writeFileSync(join(dir, target), JSON.stringify({ version }));
        for (const manifest of ['runtime-files.txt', 'compiled-runtime-files.txt']) {
            const content = readFileSync(new URL('../deploy/' + manifest, import.meta.url), 'utf8');
            writeFileSync(join(dir, 'deploy', manifest), content);
            for (const entry of content.split(/\r?\n/).filter(Boolean)) {
                const path = join(dir, 'dist', entry);
                mkdirSync(entry.endsWith('/') ? path : dirname(path), { recursive: true });
                if (!entry.endsWith('/'))
                    writeFileSync(path, '');
            }
        }
        for (const module of modules) {
            mkdirSync(dirname(join(dir, 'dist', module)), { recursive: true });
            writeFileSync(join(dir, 'dist', module), '');
        }
        assert.equal(selectRuntime(dir).version, version);
        for (const module of modules) {
            rmSync(join(dir, 'dist', module));
            assert.throws(() => selectRuntime(dir), error => error.message.includes(module) || error.message.includes(module.replaceAll('/', '\\')));
            writeFileSync(join(dir, 'dist', module), '');
        }
    }
    finally {
        assert.ok(resolve(dir).startsWith(resolve(tmpdir())));
        assert.match(dir, /retourenboard-runtime-contract-/);
        rmSync(dir, { recursive: true, force: true });
    }
});
// Missing compiled code must never silently fall back to pre-MFA code.
test('a modern release without its compiled runtime fails before startup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'retourenboard-runtime-contract-'));
    try {
        mkdirSync(join(dir, 'deploy'));
        mkdirSync(join(dir, 'server'));
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.4.0' }));
        writeFileSync(join(dir, 'deploy/runtime-files.txt'), 'server/index.js\n');
        writeFileSync(join(dir, 'server/index.js'), 'export {};');
        assert.throws(() => selectRuntime(dir), /Build|dist|kompiliert/i);
    }
    finally {
        assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + '\\') || resolve(dir).startsWith(resolve(tmpdir()) + '/'));
        assert.match(dir, /retourenboard-runtime-contract-/);
        rmSync(dir, { recursive: true, force: true });
    }
});
