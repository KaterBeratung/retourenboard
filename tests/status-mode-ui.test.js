import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const admin = read('frontend/src/admin.js');

test('the status list is locked while the standard is active, and the switch hands it to the administrator', () => {
    assert.match(admin, /const custom = ctx\.config\?\.rules\?\.customStatuses === true, locked = kind === 'statuses' && !custom;/);
    assert.match(admin, /filter\(item => !locked \|\| item\.active\)/, 'archived statuses are hidden in the standard');
    assert.match(admin, /locked \? '' : html`<button class="btn primary" id="master-create">/, 'no create button in the standard');
    assert.match(admin, /locked \? html`<span class="status-lock">\$\{icon\('lock'\)\}\$\{t\('Fest'\)\}<\/span>` : html`<div class="row-actions">/, 'a lock instead of edit and delete');
    assert.match(admin, /switchField\('customStatuses', t\('Eigene Status verwenden'\), custom\)/);
    assert.match(admin, /body: \{ customStatuses: next \}/);
    assert.match(admin, /statusMode\.checked = !next;/, 'the switch only flips after the server accepted the change');
});

test('the standard is listed in the order of the process and has English texts', () => {
    assert.match(admin, /processOrder = \['statuses\.received', 'statuses\.working', 'statuses\.completed'\]/);
    for (const text of ['Status anpassen', 'Eigene Status verwenden', 'Diese drei Status sind fest und können nicht geändert werden.']) assert.ok(admin.includes(`'${text}':'`), text);
});
