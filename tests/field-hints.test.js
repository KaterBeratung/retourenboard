import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const theme = readFileSync(new URL('../public/theme.css', import.meta.url), 'utf8');

// The search hints on the lists are longer than the fields on a phone ("Retoure, Seriennummer, Sendungsnummer oder Kunde suchen …").
test('input fields end an over-long hint or value in an ellipsis instead of cutting it off', () => {
    const rule = theme.match(/\ninput:not\(\[type=checkbox\]\)[^{]*\{([^}]*)\}/);
    assert.ok(rule, 'rule for text inputs is missing');
    assert.match(rule[1], /text-overflow:ellipsis/);
    // Check boxes, radio buttons, sliders and file pickers keep their own rendering.
    for (const type of ['checkbox', 'radio', 'range', 'file']) assert.ok(rule[0].includes(`:not([type=${type}])`), type);
});
