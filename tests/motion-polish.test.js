import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const motion = read('frontend/assets/motion.css');

// The rules of one top-level @media block (the closing brace is the first "\n}" after its opening line).
function mediaBlock(css, query) {
    const start = css.indexOf(`@media(${query}){`);
    assert.ok(start >= 0, `${query} fehlt`);
    return css.slice(start, css.indexOf('\n}', start));
}

test('the sign-in screen arrives in sequence: brand mark, wordmark, tagline, three promises, card, version note', () => {
    const block = mediaBlock(motion, 'prefers-reduced-motion:no-preference');
    const delays = [...block.matchAll(/\[data-page="login"\] (\.auth-hero \.brand-mark|\.auth-hero \.auth-brand>span:not\(\.brand-mark\)|\.auth-hero \.auth-tagline|\.auth-hero \.auth-points li|\.auth-card|\.auth-caption)\{animation:(board-[a-z-]+) (\d+)ms [^ ]+ (\d+)ms backwards\}/g)]
        .map(([, target, name, , delay]) => [target, name, Number(delay)]);
    assert.deepEqual(delays.map(([target]) => target), ['.auth-hero .brand-mark', '.auth-hero .auth-brand>span:not(.brand-mark)', '.auth-hero .auth-tagline', '.auth-hero .auth-points li', '.auth-card', '.auth-caption']);
    assert.equal(delays[0][1], 'board-pop-in', 'the mark pops, everything else rises or fades');
    const order = ['.auth-hero .brand-mark', '.auth-hero .auth-brand>span:not(.brand-mark)', '.auth-hero .auth-tagline', '.auth-hero .auth-points li'].map(target => delays.find(([name]) => name === target)[2]);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'the brand block builds from top to bottom');
    assert.ok(block.includes('.auth-points li:nth-child(2){animation-delay:390ms}') && block.includes('.auth-points li:nth-child(3){animation-delay:470ms}'), 'the promises follow one by one');
    assert.ok(delays.at(-1)[2] > delays[3][2], 'the version note comes last');
    assert.ok(delays.every(([, , delay]) => delay <= 600), 'the whole sequence settles in about a second');
});

test('the sign-in loading hint fades in after a short delay, so a fast load shows no flash', () => {
    const block = mediaBlock(motion, 'prefers-reduced-motion:no-preference');
    assert.match(block, /body\.auth-screen>\.auth-page>\.loading\{animation:board-fade \d+ms ease-out (\d+)ms backwards\}/);
    assert.ok(Number(block.match(/\.loading\{animation:board-fade \d+ms ease-out (\d+)ms/)[1]) >= 100);
});

test('a failed sign-in shakes the form once and its notice fades in, without replaying when the notice leaves', () => {
    const block = mediaBlock(motion, 'prefers-reduced-motion:no-preference');
    assert.ok(block.includes('.auth-card:has(p.form-error:not([hidden])) form{animation:board-shake 420ms'), 'shake on the form, not on the card whose entrance would replay');
    assert.ok(block.includes('.notice-card:not(.notice-leaving){animation:board-notice'), 'a leaving notice keeps its fade-out');
    const shake = motion.match(/@keyframes board-shake\{([^\n]*)\}\n/)[1];
    assert.ok(!/opacity|scale|rotate/.test(shake) && /translate/.test(shake), 'the shake only moves sideways');
});

test('in the app, loading lines, tooltips and error messages move only while motion is on', () => {
    for (const rule of [
        'html[data-motion="normal"] [data-ui="board"] .skeleton-line::after{content:""',
        'html[data-motion="normal"] [data-ui="board"] .action-tooltip:not([hidden]){animation:board-tip',
        'html[data-motion="normal"] [data-ui="board"] p.form-error:not([hidden]){animation:board-error'
    ]) assert.ok(motion.includes(rule), rule);
    // The sweep needs the line to clip it; the old opacity pulse is gone everywhere.
    assert.ok(motion.includes('.skeleton-line{position:relative;overflow:hidden}'));
    for (const file of ['frontend/assets/design.css', 'frontend/assets/motion.css']) assert.doesNotMatch(read(file), /skeleton-breathe/, file);
    assert.match(motion, /@keyframes skeleton-sweep\{from\{translate:-100% 0\}to\{translate:100% 0\}\}/, 'the sweep uses the compositor-only translate property');
    // Reduced motion still switches every animation and transition off, including those of the new pseudo-element.
    assert.ok(motion.includes('html[data-motion="reduce"] [data-ui="board"] *,html[data-motion="reduce"] [data-ui="board"] *::before,html[data-motion="reduce"] [data-ui="board"] *::after'));
});

test('the overview entrance only decorates: figures, tile icons and bars, never the tiles, links or panels themselves', () => {
    const source = read('frontend/src/section-transition.ts');
    const targets = [...source.matchAll(/all\('([^']+)'\)/g)].map(match => match[1]);
    assert.deepEqual(targets, ['.workspace-overview .kpi>strong', '.workspace-overview .kpi-icon', '.workspace-overview .workflow-bar', '.workspace-overview .reason-bar', '.workspace-overview .month-bar', '.page-heading .eyebrow', '.page-heading p']);
    assert.doesNotMatch(source, /transform\s*:|animate\(\s*\[\s*\{\s*transform/, 'no transform keyframes: stale hit-test layers stay impossible');
    assert.match(source, /count up/i);
    // The figure text always ends on the real number, even if the frame loop never runs.
    assert.match(source, /const timer=setTimeout\(finish,delay\+duration\+300\)/);
});
