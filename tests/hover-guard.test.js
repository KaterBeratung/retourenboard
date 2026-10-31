import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const assets = new URL('../frontend/assets/', import.meta.url);
const files = [...readdirSync(assets).filter(name => name.endsWith('.css')).map(name => ['frontend/assets/' + name, new URL(name, assets)]), ['public/styles.css', new URL('../public/styles.css', import.meta.url)]];

function skipQuoted(text, index) {
    const quote = text[index];
    index++;
    while (index < text.length && text[index] !== quote) index += text[index] === '\\' ? 2 : 1;
    return index + 1;
}
// End of a rule prelude: the next top-level "{", ";" or "}".
function preludeEnd(text, index) {
    let depth = 0;
    while (index < text.length) {
        const char = text[index];
        if (char === '"' || char === "'") { index = skipQuoted(text, index); continue; }
        if (char === '/' && text[index + 1] === '*') { index = text.indexOf('*/', index + 2) + 2; continue; }
        if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        else if (depth === 0 && (char === '{' || char === ';' || char === '}')) return index;
        index++;
    }
    return index;
}
function blockEnd(text, open) {
    let depth = 0;
    for (let index = open; index < text.length; index++) {
        const char = text[index];
        if (char === '"' || char === "'") { index = skipQuoted(text, index) - 1; continue; }
        if (char === '/' && text[index + 1] === '*') { index = text.indexOf('*/', index + 2) + 1; continue; }
        if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return index;
    }
    return text.length - 1;
}
// Every style rule whose selector mentions :hover, with the at-rules around it.
function hoverRules(text, context = [], found = []) {
    let index = 0;
    while (index < text.length) {
        if (/\s/.test(text[index])) { index++; continue; }
        if (text[index] === '/' && text[index + 1] === '*') { index = text.indexOf('*/', index + 2) + 2; continue; }
        const end = preludeEnd(text, index);
        if (text[end] !== '{') { index = end + 1; continue; }
        const prelude = text.slice(index, end).trim(), close = blockEnd(text, end), body = text.slice(end + 1, close);
        if (prelude.startsWith('@')) {
            if (/^@(media|supports|layer|container)\b/.test(prelude)) hoverRules(body, [...context, prelude], found);
        } else if (/:hover\b/.test(prelude)) found.push({selector: prelude, context});
        index = close + 1;
    }
    return found;
}

// A tap on a touch screen must not leave the hover look behind, so hover rules apply only where a pointer can really hover.
// The two exceptions combine :hover with other states inside one :is()/:not() and keep their focus behaviour that way.
const combined = [
    '.inventory-table tbody tr:is(:hover,:focus-within):not(.is-selected)',
    '.record-actions .icon-btn:not(:is(:hover,:focus-visible,[data-copy-state="copied"]))'
];
test('hover styles apply only on devices that can hover', () => {
    let checked = 0;
    for (const [name, url] of files) {
        for (const rule of hoverRules(readFileSync(url, 'utf8'))) {
            checked++;
            if (combined.some(selector => rule.selector.endsWith(selector))) continue;
            assert.ok(rule.context.some(prelude => /^@media\s*\(\s*hover\s*:\s*hover\s*\)/.test(prelude)), `${name}: ${rule.selector.slice(0, 90)}`);
        }
    }
    assert.ok(checked > 80, 'the scanner found the hover rules');
});

test('the sidebar search field hovers with the always dark sidebar tokens, so its light text stays readable in the light theme', () => {
    const css = readFileSync(new URL('workflow.css', assets), 'utf8');
    assert.match(css, /@media\(hover:hover\)\{\[data-ui="board"\] \.sidebar \.workspace-search-trigger:hover\{border-color:var\(--line-strong\);background-color:var\(--surface-hover\)\}\}/);
});
