import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const settings = read('frontend/assets/settings.css'), theme = read('public/theme.css');

// The language and colour switch of the sign-in page sit side by side in the corner: they have to share one top edge at every width.
test('the sign-in switches share one top edge on narrow screens', () => {
    assert.ok(settings.includes('@media(max-width:760px){\n.language-switch-auth,.theme-switch-auth{top:16px}'), 'one shared top value up to 760 px');
    assert.ok(!/\.language-switch-auth\{[^}]*top:12px/.test(settings), 'no separate offset for the language switch');
    assert.match(theme, /@media\(max-width:760px\)\{[^\n]*\.theme-switch-auth\{top:\s*16px;right:16px\}/);
});

test('the language switch keeps a constant gap to the colour switch', () => {
    // right offset = colour switch offset (16px / 24px) + its width (36px / 40px) + gap (6px / 10px)
    assert.match(settings, /\.language-switch-auth\{position:fixed;top:20px;right:74px;z-index:20\}/);
    assert.ok(settings.includes('.language-switch-auth{right:66px}'));
    assert.ok(settings.includes('@media(max-width:620px){\n.language-switch-auth{right:58px}'));
});
