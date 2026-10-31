import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('frontend/src/app.ts');

// Positions of the given markers in one source text; fails when one is missing or when they are not in the given order.
function inOrder(text, markers, label) {
    const positions = markers.map(marker => {
        const position = text.indexOf(marker);
        assert.ok(position >= 0, `${label}: ${marker} fehlt`);
        return position;
    });
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${label}: Reihenfolge ${markers.join(' → ')}`);
}

test('the workspace menu follows the life of a return: overview, returns, intake, disposal, then reference data and chat', () => {
    const workspace = app.slice(app.indexOf('const workspace=state.adminPage'), app.indexOf('const groups=['));
    inOrder(workspace, ['data-nav="overview"', 'data-nav="returns"', 'data-nav="scan-intake"', 'data-nav="disposals"', 'data-nav="products"', 'data-chat-link'], 'Arbeitsbereich');
});

test('the admin menu goes from daily data work to accounts to server operation, with settings first in its group', () => {
    const groups = app.slice(app.indexOf('const groups=['), app.indexOf('sidebarNavigation.innerHTML'));
    inOrder(groups, ["'Bestandsverwaltung'", "'Konten & Nachrichten'", "'Serverbetrieb'"], 'Gruppen');
    inOrder(groups, ["['masterdata'", "['rules'", "['csv-profiles'", "['data-tools'", "['audit'"], 'Bestandsverwaltung');
    inOrder(groups, ["['users'", "['sso'", "['notifications'"], 'Konten & Nachrichten');
    inOrder(groups, ["['settings'", "['backups'", "['updates'", "['diagnostics'"], 'Serverbetrieb');
});

test('the static admin page lists the groups in the same order as the script, so the menu does not reorder while loading', () => {
    const html = read('frontend/assets/admin.html');
    const sections = [...html.matchAll(/data-admin-nav="([a-z-]+)"/g)].map(match => match[1]);
    const expected = ['masterdata', 'rules', 'csv-profiles', 'audit', 'users', 'sso', 'notifications', 'settings', 'backups', 'updates', 'diagnostics'];
    assert.deepEqual(sections, expected);
});
