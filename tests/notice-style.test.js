import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('frontend/assets/settings.css');
const rule = selector => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? '';

test('status bars share the raised sheet of the menus and carry their meaning in a round tinted symbol', () => {
    const card = rule('[data-ui="board"] .notice-card');
    assert.match(card, /background:linear-gradient\(135deg,color-mix\(in srgb,var\(--notice-accent\) 15%,transparent\),transparent 78%\),var\(--surface-raised\)/);
    assert.match(card, /box-shadow:var\(--shadow-menu\)/);
    assert.doesNotMatch(card, /border-left/, 'no thick accent edge, which turned into a crescent on the rounded bar');
    assert.match(rule('[data-ui="board"] .notice-symbol'), /width:32px;height:32px;border-radius:999px/);
    // Kinds only switch the accent colour.
    assert.equal(rule('[data-ui="board"] .notice-card[data-notice-kind="error"]'), '--notice-accent:var(--danger)');
    assert.equal(rule('[data-ui="board"] .notice-card[data-notice-kind="unsaved"]'), '--notice-accent:var(--warning)');
    assert.doesNotMatch(css, /--notice-background|--notice-border/);
});

test('inbox items open on a click anywhere on them, mark themselves as read and close the inbox', () => {
    const source = read('frontend/src/notifications.ts');
    assert.match(source, /querySelectorAll<HTMLElement>\('\.inbox-item'\)\.forEach\(card=>card\.addEventListener\('click'/);
    assert.match(source, /closest\('a,button'\)/, 'links and buttons inside the item keep their own behaviour');
    assert.match(source, /'\/api\/notifications\/'\+card\.dataset\.notification\+'\/read'/);
    assert.match(source, /dialog\.close\(\);\s*\}\);/);
    assert.match(rule('.inbox-item'), /cursor:pointer/);
});
