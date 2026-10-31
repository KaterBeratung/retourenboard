import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.js';

const notice = await sourceModule("export {updateNoticeMarkup} from './frontend/src/update-notice.ts';");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const plain = value => String(value).replace(/<!--.*?-->/g, '');

test('the update notice appears only when a newer stable release is known', () => {
    for (const check of [null, undefined, {}, {status: 'current', latestVersion: '4.0.84'}, {status: 'unchecked', latestVersion: null}, {status: 'unavailable', latestVersion: null}, {status: 'ahead', latestVersion: '4.0.1'}, {status: 'updateAvailable', latestVersion: null}]) {
        assert.equal(notice.updateNoticeMarkup(check), '', JSON.stringify(check));
    }
    const markup = plain(notice.updateNoticeMarkup({status: 'updateAvailable', latestVersion: '4.1.0'}));
    assert.match(markup, /Neue Version verfügbar/);
    assert.match(markup, /Version 4\.1\.0/);
    assert.match(markup, /Zu den Updates/);
});

test('the update notice escapes the version it shows', () => {
    const markup = plain(notice.updateNoticeMarkup({status: 'updateAvailable', latestVersion: '<img src=x onerror=alert(1)>'}));
    assert.doesNotMatch(markup, /<img/);
    assert.match(markup, /&lt;img/);
});

test('every app page has the sign-out button and the notice slot in the sidebar, hidden until needed', () => {
    for (const page of ['index', 'admin', 'account']) {
        const source = read(`frontend/assets/${page}.html`);
        assert.match(source, /<a id="update-notice" class="update-notice" href="\/admin#updates" hidden><\/a>/, page);
        assert.match(source, /<button id="sidebar-signout" class="sidebar-signout" type="button" hidden>/, page);
        assert.ok(source.indexOf('id="update-notice"') < source.indexOf('id="access-button"'), `${page}: Hinweis steht über dem Konto`);
        assert.ok(source.indexOf('id="access-button"') < source.indexOf('id="sidebar-signout"'), `${page}: Abmelden steht unter dem Konto`);
    }
});

test('the shell wires the sidebar sign-out to the shared sign-out flow and refreshes the notice with the session', () => {
    const app = read('frontend/src/app.ts');
    assert.match(app, /sidebarSignoutButton\.onclick=\(\)=>\{signOut\(ctx,\(\)=>canLeaveForms\(document\),sidebarSignoutButton\)/);
    assert.match(app, /sidebarSignout\.hidden=!unlocked/);
    assert.ok(app.includes('(updateNotice??=bindUpdateNotice(ctx)).refresh();'));
});

test('the notice reads only the cached check for administrators and never asks GitHub itself', () => {
    const source = read('frontend/src/update-notice.ts');
    assert.match(source, /ctx\.api\('\/api\/admin\/version-check'\)/);
    assert.doesNotMatch(source, /method:\s*'POST'/);
    assert.match(source, /ctx\.unlocked && ctx\.isAdmin/);
});
