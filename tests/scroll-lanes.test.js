import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const assets = new URL('../frontend/assets/', import.meta.url);
const files = readdirSync(assets).filter(name => name.endsWith('.css')).map(name => [name, readFileSync(new URL(name, assets), 'utf8')]);

// A reserved lane stays empty when nothing scrolls: rows, dividers and hover surfaces then stop short of the edge and the lane shows as a stripe
// (seen next to the last column of "Aktuelle Retouren" and as lopsided padding in the table menu).
test('no scroll container reserves an empty scrollbar lane, except the page itself', () => {
    const offenders = [];
    for (const [name, css] of files) {
        for (const match of css.matchAll(/([^{}]*)\{([^{}]*scrollbar-gutter:\s*stable[^{}]*)\}/g)) offenders.push(`${name}: ${match[1].trim().slice(0, 80)}`);
    }
    assert.deepEqual(offenders, ['design.css: html']);
});

test('tables, the table menu, the search results and the PDF list size their content without a lane', () => {
    const rule = (file, selector) => files.find(([name]) => name === file)[1].match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? '';
    assert.ok(files.find(([name]) => name === 'design.css')[1].includes('\n.table-scroll{scrollbar-gutter:auto}'));
    assert.match(rule('workspace-refinements.css', '[data-ui="board"] .table-preferences-menu'), /overflow:auto/);
    assert.doesNotMatch(rule('workspace-refinements.css', '[data-ui="board"] .table-preferences-menu'), /scrollbar-gutter/);
    assert.doesNotMatch(rule('workspace-tools.css', '[data-ui="board"] .workspace-search-results'), /scrollbar-gutter/);
    assert.doesNotMatch(rule('scan-labels.css', '[data-ui="board"] .scan-pdf-list'), /scrollbar-gutter/);
});
