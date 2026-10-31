import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runtimeFixture} from './helpers/runtime.js';
import {renderErrorPage, retryTarget, prefersEnglish, createErrorPages} from '../dist/server/error-page.js';

const template = readFileSync(new URL('../dist/public/error.html', import.meta.url), 'utf8');
const page = (status, extra = {}) => renderErrorPage(template, {status, english: false, retryTo: '/x', ...extra});
const html = {Accept: 'text/html,application/xhtml+xml'};

test('every error page says what happened in both languages and offers the way back', () => {
    for (const [status, title] of [[403, 'Kein Zugriff'], [404, 'Seite nicht gefunden'], [429, 'Zu viele Anfragen'], [500, 'Etwas ist schiefgelaufen'], [503, 'Wartung läuft'], [418, 'Das hat nicht geklappt']]) {
        const markup = page(status);
        assert.match(markup, new RegExp(`<title>${title} · retourenboard\\.</title>`), String(status));
        assert.match(markup, /<span lang="de">/);
        assert.match(markup, /<span lang="en">/);
        assert.match(markup, /<a class="primary" href="\/">/);
        assert.doesNotMatch(markup, /\{\{/, 'no template placeholder is left');
    }
    assert.match(page(404, {english: true}), /<html lang="en"[^>]*>[\s\S]*<title>Page not found · retourenboard\./);
});

test('only maintenance reloads by itself, and only recoverable errors offer to try again', () => {
    assert.match(page(503), /<meta http-equiv="refresh" content="15">/);
    for (const status of [403, 404, 429, 500]) assert.doesNotMatch(page(status), /http-equiv="refresh"/);
    for (const status of [429, 500, 503]) assert.match(page(status), /<a href="\/x">/);
    for (const status of [403, 404]) assert.doesNotMatch(page(status), /<a href="\/x">/);
});

test('the retry link is escaped and can never point to another site', () => {
    for (const hostile of ['//evil.example/path?a=1', '///evil.example', '/\\evil.example', 'http://evil.example/x', '//evil.example\\@x'])
        assert.match(retryTarget(hostile), /^\/(?![\/\\])/, `${hostile} stays on this server`);
    assert.equal(retryTarget('/chat?x=1'), '/chat?x=1');
    const markup = page(500, {retryTo: '/a"><script>alert(1)</script>'});
    assert.doesNotMatch(markup, /<script>alert/);
    assert.match(markup, /&quot;&gt;&lt;script&gt;/);
});

test('the template and style sheet respect the content security policy', () => {
    assert.doesNotMatch(template, /<style|\son[a-z]+=|javascript:/i);
    assert.match(template, /<link rel="stylesheet" href="\/error\.css">/);
    const css = readFileSync(new URL('../dist/public/error.css', import.meta.url), 'utf8');
    assert.match(css, /html\[lang="de"\] span\[lang="en"\]/);
});

test('language follows the browser preference', () => {
    assert.equal(prefersEnglish('en-US,en;q=0.9,de;q=0.8'), true);
    assert.equal(prefersEnglish('de-DE,de;q=0.9,en;q=0.5'), false);
    assert.equal(prefersEnglish(undefined), false);
});

test('API calls, assets and non-GET requests keep their JSON answers', async () => {
    const pages = createErrorPages(async () => template);
    const sent = [];
    const response = () => ({headersSent: false, writeHead: (...args) => sent.push(args), end: () => {}});
    assert.equal(await pages.respond({method: 'GET', url: '/api/nope', headers: {accept: 'text/html'}}, response(), {status: 404}), false);
    assert.equal(await pages.respond({method: 'GET', url: '/health', headers: {accept: 'text/html'}}, response(), {status: 503}), false);
    assert.equal(await pages.respond({method: 'GET', url: '/app.js', headers: {accept: '*/*'}}, response(), {status: 404}), false);
    assert.equal(await pages.respond({method: 'POST', url: '/nope', headers: {accept: 'text/html'}}, response(), {status: 404}), false);
    assert.equal(sent.length, 0);
    assert.equal(await pages.respond({method: 'GET', url: '/nope', headers: {accept: 'text/html'}}, response(), {status: 404}), true);
    assert.equal(sent[0][0], 404);
    assert.equal(sent[0][1]['Cache-Control'], 'no-store');
});

test('the running server answers browsers with the page and programs with JSON', async t => {
    const f = await runtimeFixture(t);
    const browser = await f.request('/does-not-exist', 'GET', undefined, {}, html);
    assert.equal(browser.status, 404);
    assert.match(browser.headers.get('content-type'), /^text\/html/);
    assert.match(await browser.text(), /Seite nicht gefunden/);
    const english = await f.request('/does-not-exist', 'GET', undefined, {}, {...html, 'Accept-Language': 'en-GB'});
    assert.match(await english.text(), /<html lang="en"/);
    const program = await f.request('/does-not-exist', 'GET', undefined, {}, {Accept: 'application/json'});
    assert.equal(program.status, 404);
    assert.match(program.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await program.json(), {error: 'Seite nicht gefunden.'});
    const api = await f.request('/api/nothing-here', 'GET', undefined, {}, html);
    assert.match(api.headers.get('content-type'), /application\/json/);
    for (const path of ['/error.css', '/theme.css', '/theme.js', '/favicon.svg']) assert.equal((await f.request(path)).status, 200, path);
    assert.equal((await f.request('/error.html')).status, 404, 'the template itself is not a public page');
});
