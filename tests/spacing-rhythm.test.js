import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const chat = read('frontend/assets/chat.css');
const design = read('frontend/assets/design.css');
const refinements = read('frontend/assets/workspace-refinements.css');
const settings = read('frontend/assets/settings.css');
const theme = read('public/theme.css');

test('the spacing tokens give every page one section rhythm and one panel inset', () => {
  assert.match(theme, /--space-panel:20px;--space-card:20px;--space-section:24px;/);
  assert.match(theme, /@media\(max-width:760px\)\{:root\{[^}]*--space-panel:16px;--space-section:20px;/);
});

test('page headings use the section token at every width instead of their own pixel values', () => {
  const headings = design.match(/(?:^|\n)\.page-heading\{[^}]*margin-bottom:[^;}]+/g) ?? [];
  assert.ok(headings.length >= 5, 'the page heading is declared at several widths');
  for (const rule of headings) assert.match(rule, /margin-bottom:var\(--space-section\)/, rule.trim());
  assert.match(refinements, /\.record-workspace>\.page-heading\{[^}]*margin-bottom:var\(--space-section\)/);
  assert.match(refinements, /\.admin-tabs\.status-tabs\{margin:0 0 var\(--space-section\)/);
});

test('list footers, pagination and mobile record cards share the panel inset with the toolbar', () => {
  assert.match(design, /\.list-panel>\.table-footer\{padding:16px var\(--space-panel\)/);
  assert.match(design, /\n\.table-footer\{[^}]*padding:16px var\(--space-panel\)\}/);
  assert.match(design, /table\[data-responsive-cards\]>tbody\{[^}]*padding:8px var\(--space-panel\)\}/);
  assert.match(design, /\.mobile-records\{[^}]*padding:0 var\(--space-panel\) 12px\}/);
  assert.match(settings, /\.pagination\{[^}]*padding:16px var\(--space-panel\)/);
  assert.doesNotMatch(refinements, /\.record-workspace \.table-toolbar\{padding:14px\}/, 'no narrower toolbar inset than the footer');
});

test('every part of an open chat conversation uses the same side inset', () => {
  assert.match(chat, /\.chat-layout\{--chat-inset:20px;/);
  assert.match(chat, /@media\(max-width:1000px\)\{[^@]*\.chat-layout\{--chat-inset:16px;/);
  for (const selector of ['\\.chat-message-log', '\\.chat-connection-error', '\\.chat-message-search', '\\.chat-pins', '\\.chat-readonly', '\\.chat-conversation>form\\.message-composer']) {
    assert.match(chat, new RegExp(`${selector}\\{[^}]*padding:[^;}]*var\\(--chat-inset\\)`), `${selector} follows --chat-inset`);
  }
  assert.doesNotMatch(chat, /\.chat-pins\{[^}]*padding:0 2[46]px/, 'the pinned banner no longer has its own inset');
});
