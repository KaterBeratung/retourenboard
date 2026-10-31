import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createWebsiteServer} from '../scripts/website-preview.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const site = read('website/src/site.css'), theme = read('public/theme.css');
// The value of a custom property inside the first rule that matches the selector prefix.
const token = (css, selector, name) => css.slice(css.indexOf(selector)).match(new RegExp(`${name.replace(/[-]/g, '\\-')}:([^;}]+)`))?.[1].trim().replace(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/gi, '#$1$1$2$2$3$3');

test('the website carries the palette of the application in both colour schemes', () => {
    for (const [siteName, appName] of [['--bg', '--page'], ['--panel', '--surface'], ['--subtle', '--surface-subtle'], ['--raised', '--surface-raised'], ['--text', '--ink'], ['--muted', '--muted'], ['--green', '--accent'], ['--accent-hover', '--accent-hover'], ['--on-accent', '--on-accent'], ['--tint', '--accent-background'], ['--brand', '--brand'], ['--brand-ink', '--brand-ink'], ['--brand-gradient', '--brand-gradient']]) {
        assert.equal(token(site, ':root{', siteName), token(theme, ':root{', appName), `hell ${siteName}`);
        if (siteName.startsWith('--brand')) continue;
        assert.equal(token(site, ':root[data-theme=dark]{', siteName), token(theme, ':root[data-theme="dark"]{', appName), `dunkel ${siteName}`);
    }
});

test('the backdrop of the application is shipped as same-origin files, because the page policy allows no data URLs', () => {
    const references = [...site.matchAll(/url\(\.\/assets\/([a-z0-9-]+\.svg)\)/g)].map(match => match[1]);
    assert.deepEqual([...new Set(references)].sort(), ['backdrop-grain-dark.svg', 'backdrop-grain-light.svg', 'backdrop-ribbons-dark.svg', 'backdrop-ribbons-light.svg']);
    for (const name of new Set(references)) {
        const svg = read(`website/src/assets/${name}`);
        assert.ok(existsSync(new URL(`../website/src/assets/${name}`, import.meta.url)));
        assert.doesNotMatch(svg, /<script|<foreignObject|href=|onload|url\(http/i, name);
    }
    assert.doesNotMatch(site, /url\(["']?data:/);
    assert.match(site, /body::before\{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:var\(--backdrop-art\)/);
});

test('primary buttons use the brand gradient of the application and keep it on hover', () => {
    assert.match(site, /\.button\.primary\{background:var\(--brand-gradient\);color:var\(--brand-ink\)/);
    assert.match(site, /\.button\.primary:not\(:disabled\):not\(\[aria-disabled="true"\]\):hover\{background-image:var\(--brand-gradient-hover\)/);
});

test('the preview serves the backdrop files as images', async t => {
    const server = createWebsiteServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const name of ['backdrop-grain-dark.svg', 'backdrop-ribbons-light.svg']) {
        const response = await fetch(`${base}/assets/${name}`);
        assert.equal(response.status, 200, name);
        assert.equal(response.headers.get('content-type'), 'image/svg+xml');
        assert.match(await response.text(), /^<svg /);
    }
});
