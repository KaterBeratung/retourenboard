import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const theme = read('public/theme.css');

// Reads the custom properties of one theme block (light = :root, dark = :root[data-theme="dark"]).
function tokens(selector) {
    const start = theme.indexOf(selector + '{');
    assert.ok(start >= 0, `${selector} fehlt in theme.css`);
    const end = theme.indexOf('\n}', start);
    const map = new Map();
    for (const match of theme.slice(start, end).matchAll(/--([a-z0-9-]+):(#[0-9a-f]{6})\b/gi)) map.set(match[1], match[2]);
    return map;
}
const luminance = hex => {
    const channel = index => {
        const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};
const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
};

test('the look lives in the base style sheets: no extra override layer is shipped', () => {
    for (const page of ['index', 'admin', 'account', 'login']) {
        assert.doesNotMatch(read(`frontend/assets/${page}.html`), /identity\.css/, `${page}.html`);
    }
    assert.doesNotMatch(read('backend/src/server/static-files.ts'), /identity\.css/);
    assert.doesNotMatch(read('scripts/build-frontend.mjs'), /identity\.css/);
    assert.doesNotMatch(read('deploy/compiled-runtime-files.txt'), /identity\.css/);
    assert.doesNotMatch(theme, /--curves\b/, 'the single-picture backdrop was replaced by layered artwork');
});

// Splits a CSS list at its top-level commas (commas inside brackets or quotes stay).
function layers(list) {
    const parts = [];
    let depth = 0, quote = '', from = 0;
    for (let index = 0; index < list.length; index++) {
        const char = list[index];
        if (quote) { if (char === quote) quote = ''; continue; }
        if (char === '"' || char === "'") quote = char;
        else if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) { parts.push(list.slice(from, index)); from = index + 1; }
    }
    parts.push(list.slice(from));
    return parts.map(part => part.trim());
}

test('the page backdrop is layered artwork with grain, hairline ribbons and mesh glows in both colour schemes', () => {
    const declarations = [...theme.matchAll(/(:root[^{]*)\{--backdrop-art:(.*?);--backdrop-size:(.*?);--backdrop-repeat:(.*?);--aurora-a:/g)];
    assert.equal(declarations.length, 4, 'light, dark and the two sign-in variants');
    for (const [, selector, art, size, repeat] of declarations) {
        const list = layers(art);
        assert.equal(layers(size).length, list.length, `${selector}: one size per layer`);
        assert.equal(layers(repeat).length, list.length, `${selector}: one repeat rule per layer`);
        assert.match(list[0], /feTurbulence/, `${selector}: the film grain is the top layer`);
        assert.equal(layers(repeat)[0], 'repeat', `${selector}: only the grain tile repeats`);
        assert.ok(layers(repeat).slice(1).every(rule => rule === 'no-repeat'), `${selector}: everything else is placed once`);
        assert.match(list[1], /stroke-opacity/, `${selector}: the hairline ribbons sit under the grain`);
        assert.match(list.at(-1), /^linear-gradient\(/, `${selector}: a base gradient closes the stack`);
        assert.ok(list.filter(layer => layer.startsWith('radial-gradient(')).length >= 4, `${selector}: mesh glows`);
    }
    assert.ok(declarations.some(([selector]) => selector.includes('data-page="login"') && selector.includes('data-theme="dark"')), 'dark sign-in variant');
    // Grain stays below roughly a quarter of full strength so text and thin lines stay crisp.
    for (const [, , art] of declarations) assert.ok(Number(art.match(/filter='url\(%23n\)' opacity='([\d.]+)'/)[1]) <= .26, 'grain strength');
    assert.match(theme, /@media\(prefers-reduced-motion:no-preference\)\{\n body\.auth-screen\[data-page="login"\]::after\{/, 'the sign-in aurora drift is off for reduced motion');
    assert.doesNotMatch(theme, /backdrop-filter/, 'the backdrop itself needs no blur layer');
    assert.match(read('frontend/assets/error.css'), /background-image:var\(--backdrop-art\)/, 'error pages use the same backdrop');
});

test('small details follow the brand: caret, checkboxes, selection and balanced headings', () => {
    assert.match(theme, /:root\{accent-color:var\(--accent\);caret-color:var\(--accent\)\}/);
    assert.match(theme, /::selection\{background:color-mix\(in srgb,var\(--brand\) \d+%,transparent\)/);
    assert.match(theme, /:is\(h1,h2,h3\)\{text-wrap:balance\}/);
    assert.match(read('frontend/assets/design.css'), /:root\[data-theme="dark"\] \.panel\{background-image:linear-gradient\(180deg,#ffffff0a,#ffffff00 160px\)\}/, 'dark panels catch light from above');
});

test('the sole logo file is the green gradient icon and no page ships a second copy', () => {
    const logo = read('public/favicon.svg');
    assert.match(logo, /<linearGradient id="a"/);
    assert.doesNotMatch(logo, /#7ea564/i, 'old flat green is gone');
    assert.match(logo, /M12 27h18a8 8 0 0 0 0-16h-4/, 'the return arrow keeps its shape');
    for (const page of ['index', 'admin', 'account', 'login']) assert.doesNotMatch(read(`frontend/assets/${page}.html`), /<svg[^>]*class="brand/i);
});

test('theme text and accent colours keep readable contrast in both colour schemes', () => {
    const light = tokens(':root'), dark = tokens(':root[data-theme="dark"]');
    const need = (scheme, name, foreground, background, minimum) => {
        const a = scheme.get(foreground), b = scheme.get(background);
        assert.ok(a && b, `${name}: Token fehlt`);
        assert.ok(contrast(a, b) >= minimum, `${name}: ${contrast(a, b).toFixed(2)} < ${minimum}`);
    };
    for (const [scheme, label] of [[light, 'hell'], [dark, 'dunkel']]) {
        need(scheme, `${label} Text`, 'ink', 'surface', 7);
        need(scheme, `${label} gedämpfter Text`, 'muted', 'surface', 4.5);
        need(scheme, `${label} Akzent auf Fläche`, 'accent', 'surface', 4.5);
        need(scheme, `${label} Akzent auf Akzentgrund`, 'accent', 'accent-background', 4.5);
        for (const tone of ['success', 'info', 'warning', 'danger', 'progress']) need(scheme, `${label} ${tone}`, tone, `${tone}-bg`, 4.5);
    }
    assert.ok(contrast(light.get('on-accent'), light.get('accent')) >= 4.5, 'weißer Text auf Primärgrün (hell)');
    assert.ok(contrast(dark.get('on-accent'), dark.get('accent')) >= 4.5, 'dunkler Text auf Primärgrün (dunkel)');
    assert.ok(contrast(light.get('brand-ink'), light.get('brand')) >= 7, 'Beschriftung der Primärschaltfläche');
});

test('shapes are generously rounded: capsule buttons, large cards, no glass blur', () => {
    assert.match(theme, /--button-radius:999px/);
    assert.match(theme, /--field-radius:20px/);
    assert.match(theme, /--control-radius:20px/);
    assert.match(theme, /--panel-radius:28px/);
    assert.match(theme, /--dialog-radius:32px/);
    assert.doesNotMatch(theme, /--glass-/, 'no glass variables are left');
    assert.ok(theme.includes('--brand-gradient:linear-gradient('));
    const design = read('frontend/assets/design.css');
    assert.ok(design.includes('.field textarea,textarea{border-radius:20px}'));
    assert.ok(design.includes('.icon-btn{border-radius:999px}'));
});

test('sign-in shows the brand block and no Ko-fi link; the page never needs its own scrollbar', () => {
    const login = read('frontend/src/login.js');
    assert.doesNotMatch(login, /ko-fi|kofi/i);
    assert.match(login, /class="auth-hero"/);
    assert.equal((login.match(/<li><span class="auth-point-icon">/g) || []).length, 3);
    const dictionary = read('frontend/src/i18n.js');
    for (const text of ['Retouren mit Seriennummer erfassen', 'Scannen und Etiketten drucken', 'Bearbeitungsstand mit Kundschaft teilen']) assert.ok(dictionary.includes(`'${text}':'`), text + ' hat eine englische Übersetzung');
    // The backdrop lives on the page background for mouse devices, so it also covers the reserved scrollbar lane.
    assert.ok(theme.includes('@media(pointer:fine){\n :root:has(body[data-ui="board"]){background-image:var(--backdrop-art)'));
    assert.ok(theme.includes(':root{scrollbar-width:thin;'));
});

test('the loading and connection-error states of the sign-in page sit in the middle, not in a column of the sign-in grid', () => {
    const design = read('frontend/assets/design.css');
    // Every page starts with this loading block; the two-column grid only belongs to the brand block plus card.
    assert.ok(design.includes('body.auth-screen>.auth-page:not(:has(>.auth-hero)){display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:88px 20px}'));
    assert.ok(design.includes('@media(max-width:760px){body.auth-screen>.auth-page:not(:has(>.auth-hero)){padding:80px 16px}}'));
    // No scrollbar lane on the sign-in screen: the lane would shift the centred content 5px to the left.
    assert.ok(design.includes('html:has(body.auth-screen){scrollbar-gutter:auto}'));
    assert.ok(design.indexOf('html:has(body.auth-screen)') > design.indexOf('html{scrollbar-gutter:stable}'), 'the sign-in exception follows the general rule');
    for (const page of ['index', 'admin', 'account', 'login']) assert.match(read(`frontend/assets/${page}.html`), /<main id="auth-page" class="auth-page"[^>]*><div class="loading">/, page);
});

test('every page title block has the same label above the title, so titles do not jump between pages', () => {
    const withLabel = ['admin-audit', 'admin-backups', 'admin-csv-profiles', 'admin-diagnostics', 'admin-notifications', 'admin-rules', 'scan-intake', 'admin-updates', 'admin-settings'];
    for (const name of withLabel) {
        const file = existsSync(new URL(`../frontend/src/${name}.ts`, import.meta.url)) ? `frontend/src/${name}.ts` : `frontend/src/${name}.js`;
        assert.match(read(file), /class="page-heading"><div><div class="eyebrow">[A-ZÄÖÜ -]+<\/div><h1>/, file);
    }
    assert.match(read('frontend/src/disposals.ts'), /<span class="eyebrow">/, 'disposals keeps its span, which the shared rule makes a block');
    const design = read('frontend/assets/design.css');
    assert.ok(design.includes('.page-heading .eyebrow{display:block;'));
    assert.ok(read('frontend/assets/workspace-refinements.css').includes('.record-workspace>.page-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:20px;margin-bottom:24px}'));
    assert.doesNotMatch(read('frontend/assets/scan-intake.css'), /\.scan-intake \.page-heading h1\{[^}]*font-size/, 'the scan page uses the shared title size');
});

test('hovering and pressing never switch on a filter, which would make text flicker', () => {
    for (const file of ['design.css', 'motion.css', 'error.css', 'workspace-refinements.css', 'settings.css']) {
        const css = read(`frontend/assets/${file}`);
        for (const match of css.matchAll(/([^{}]*:(?:hover|active|focus-visible)[^{}]*)\{([^{}]*)\}/g)) {
            assert.doesNotMatch(match[2], /(^|;)\s*filter:/, `${file}: ${match[1].trim().slice(0, 80)}`);
        }
    }
    assert.ok(theme.includes('--brand-gradient-hover:linear-gradient('));
});

test('tables use the full width of their panel without a reserved scrollbar lane, and no glass leftovers remain', () => {
    assert.ok(read('frontend/assets/design.css').includes('.table-scroll{scrollbar-gutter:auto}'));
    for (const file of ['public/theme.css', 'public/styles.css', 'frontend/assets/design.css', 'frontend/assets/chat.css', 'frontend/assets/scan-intake.css', 'frontend/assets/workspace-tools.css']) {
        assert.doesNotMatch(read(file), /--(?:glass-glint|glass-edge|glass-tint|glass-blur|chrome-backdrop|menu-backdrop)\b/, file);
    }
});
