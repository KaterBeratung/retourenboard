import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runtimeFixture } from './helpers/runtime.js';
import { createWebsiteServer } from '../scripts/website-preview.mjs';
const logo = readFileSync(new URL('../public/favicon.svg', import.meta.url));
test('application and marketing builds ship the same canonical logo', () => {
    for (const path of ['dist/public/favicon.svg', 'website/dist/favicon.svg']) {
        assert.deepEqual(readFileSync(path), logo, path);
    }
});
test('every application shell and marketing brand use their own served favicon asset', async (t) => {
    const f = await runtimeFixture(t);
    assert.deepEqual(Buffer.from(await (await f.request('/favicon.svg')).arrayBuffer()), logo);
    const { auth } = await f.setup();
    for (const path of ['/', '/admin', '/account']) {
        const html = await (await f.request(path, 'GET', undefined, auth)).text();
        assert.match(html, /class="brand-mark"[^>]*><img[^>]*src="\/favicon\.svg"[^>]*alt=""/);
        assert.doesNotMatch(html, /class="brand-mark"[^>]*>↩/);
    }
    const website = createWebsiteServer();
    await new Promise(resolve => website.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { website.close(resolve); website.closeAllConnections(); }));
    const base = `http://127.0.0.1:${website.address().port}`;
    assert.deepEqual(Buffer.from(await (await fetch(base + '/favicon.svg')).arrayBuffer()), logo);
    const html = await (await fetch(base)).text();
    assert.match(html, /class="brand-mark"[^>]*><img[^>]*src="\.\/favicon\.svg"/);
    assert.match(html, /class="board-brand"[^>]*><span[^>]*><img[^>]*src="\.\/favicon\.svg"/);
});
