import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../frontend/assets/return-labels.css', import.meta.url), 'utf8');
// The paper rules sit between the marker comment and the first responsive block; the dialog around them is not printed.
const paper = css.slice(css.indexOf('/* The paper:'), css.indexOf('@media(max-width:760px)'));
const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
function declarations(selector, source = css) {
    const match = source.match(new RegExp(`(?:^|\\n)${escape(selector)}\\{([^}]*)\\}`));
    assert.ok(match, `${selector} fehlt`);
    return match[1];
}

test('every paper size sets the variables that the shared layout reads', () => {
    const shared = ['--pad', '--gap', '--qr', '--hero', '--name', '--value', '--key', '--serial', '--cols'];
    for (const selector of ['.return-print-label', '.return-print-label[data-label-size="auto"]', '.return-print-label[data-label-size="103x164"]'])
        for (const name of shared)
            assert.match(declarations(selector), new RegExp(`${name}:`), `${selector} ${name}`);
    const compact = declarations('.return-print-label[data-label-size="62x29"]');
    for (const name of ['--gap', '--key', '--value', '--logo', '--brand'])
        assert.match(compact, new RegExp(`${name}:`), `62x29 ${name}`);
});

test('number and product sit left of the code, the device identifiers run underneath across the full width', () => {
    assert.equal(declarations('.label-device'), 'display:contents');
    assert.equal(declarations('.label-code', paper).includes('grid-area:1/2/3/3'), true);
    assert.equal(declarations('.label-serials').includes('grid-area:3/1/4/3'), true);
    assert.equal(declarations('.label-return-id'), 'grid-area:1/1/2/2');
    // A serial number and its barcode share one row inside the box instead of stacking.
    assert.match(declarations('.return-print-label:not([data-label-size="62x29"]) .label-serials .label-field'), /grid-template-columns:minmax\(0,1fr\) auto/);
});

test('the compact 62 × 29 mm label keeps its stacked layout', () => {
    assert.equal(declarations('[data-label-size="62x29"] .label-device'), 'display:block');
    assert.match(declarations('[data-label-size="62x29"] .label-code'), /grid-area:auto/);
    assert.match(declarations('[data-label-size="62x29"] .label-main'), /grid-template-rows:auto/);
    assert.match(declarations('[data-label-size="62x29"] .label-reference .label-field'), /display:block/);
});

test('sections that the preview switches off stay hidden, whatever display the layout gives them', () => {
    assert.equal(declarations('.return-print-label [hidden]'), 'display:none!important');
});

test('the paper uses only black, white and grey, so thermal and laser printers print it alike', () => {
    const colours = [...paper.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map(match => match[1]);
    assert.ok(colours.length > 5);
    for (const hex of colours) {
        const full = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex;
        const channels = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
        assert.ok(Math.max(...channels) - Math.min(...channels) <= 16, `#${hex} ist nicht neutral`);
    }
    assert.doesNotMatch(paper, /(?:rgb|hsl|oklch|color-mix)\(/);
});

test('printing still uses the real paper sizes at 100 % without the screen controls', () => {
    for (const size of ['210mm 297mm', '103mm 164mm', '62mm 29mm']) assert.ok(css.includes(`size:${size};margin:0`), size);
    const print = css.slice(css.indexOf('@media print{'));
    assert.ok(print.includes('.label-print-controls{display:none!important}'));
    assert.ok(print.includes('zoom:1!important'));
    assert.ok(print.includes('print-color-adjust:exact'));
});

test('the label keeps one canonical logo and no inline styling hooks', () => {
    assert.doesNotMatch(css, /<svg|url\(data:/);
    assert.match(declarations('.return-label-brand'), /width:var\(--logo\);height:var\(--logo\)/);
});
