import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const insights = await import('../dist/public/workspace-insights.js');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const now = Date.parse('2026-10-30T10:00:00Z');
const options = {now, timezone: 'Europe/Berlin'};

test('overview figures count open, overdue, value, recent flow and the oldest delay', () => {
    const rows = [
        {id: 1, isClosed: false, overdue: true, dueDate: '2026-10-16', quantity: 2, priceCents: 1000, supplier: 'Alpha', supplierId: 1, createdAt: '2026-10-29T08:00:00Z'},
        {id: 2, isClosed: false, overdue: true, dueDate: '2026-10-28', quantity: 1, priceCents: 500, supplier: 'Alpha', supplierId: 1, createdAt: '2026-09-01T08:00:00Z'},
        {id: 3, isClosed: false, overdue: false, dueDate: '2026-11-02', quantity: 1, priceCents: 250, supplier: 'Beta', supplierId: 2, createdAt: '2026-10-20T08:00:00Z'},
        {id: 4, isClosed: true, overdue: true, dueDate: '2026-10-01', quantity: 5, priceCents: 9999, supplier: 'Beta', supplierId: 2, createdAt: '2026-10-10T08:00:00Z', completedAt: '2026-10-25T08:00:00Z'},
        {id: 5, isClosed: true, quantity: 1, priceCents: 100, createdAt: '2026-06-01T08:00:00Z', completedAt: '2026-06-02T08:00:00Z'},
        {id: 6, isClosed: false, overdue: false, quantity: 1, priceCents: 0, supplier: '', supplierId: null, createdAt: 'kaputt'}
    ];
    const figures = insights.overviewFigures(rows, [{active: true}, {active: true}, {active: false}], options);
    assert.equal(figures.open, 4);
    assert.equal(figures.overdue, 2);
    assert.equal(figures.oldestOverdueDays, 14, 'counted from the due date to today, not from creation');
    assert.equal(figures.openValueCents, 2 * 1000 + 500 + 250, 'closed returns do not count');
    assert.equal(figures.closed30, 1, 'only completions of the last 30 days');
    assert.equal(figures.created30, 3, 'invalid or old creation dates are ignored');
    assert.equal(figures.activeProducts, 2);
    assert.deepEqual(figures.suppliers, [{name: 'Alpha', count: 2}, {name: '', count: 1}, {name: 'Beta', count: 1}], 'sorted by count, then name; a missing supplier is kept as its own entry');
});

test('overview figures stay sane without data', () => {
    const figures = insights.overviewFigures([], [], options);
    assert.deepEqual({...figures, suppliers: figures.suppliers.length}, {open: 0, overdue: 0, oldestOverdueDays: 0, openValueCents: 0, closed30: 0, created30: 0, activeProducts: 0, suppliers: 0});
    assert.doesNotThrow(() => insights.overviewFigures([{isClosed: false, overdue: true, dueDate: 'morgen'}], undefined, options));
    assert.equal(insights.overviewFigures([{isClosed: false, overdue: true, dueDate: 'morgen'}], [], options).oldestOverdueDays, 0, 'an unreadable due date never produces a delay');
});

test('the supplier ranking is limited to five suppliers and the overview offers every tile for customising', () => {
    const rows = Array.from({length: 8}, (_, index) => ({id: index, isClosed: false, supplier: `S${index}`, supplierId: index + 1, quantity: 1, priceCents: 1}));
    assert.equal(insights.overviewFigures(rows, [], options).suppliers.length, 5);
    const personalization = read('frontend/src/workspace-personalization.ts');
    for (const key of ['open', 'overdue', 'value', 'closed', 'products', 'suppliers']) assert.ok(personalization.includes(`['${key}',`), key);
    const app = read('frontend/src/app.ts');
    for (const key of ['open', 'overdue', 'value', 'closed', 'products']) assert.ok(app.includes(`['${key}',`), `Kachel ${key} wird angezeigt`);
});

test('the actions column is not set apart from the rest of the table by a divider line', () => {
    const css = read('frontend/assets/workspace-refinements.css');
    assert.doesNotMatch(css, /record-actions-(?:cell|heading)\{[^}]*box-shadow:-1px 0 0/);
});
