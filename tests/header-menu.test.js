import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.js';
const ui=await sourceModule("export * from './frontend/src/design.ts'; export {setLanguage} from './frontend/src/i18n.js'; import {addTranslations} from './frontend/src/i18n.js';import {english} from './frontend/src/i18n-catalog.js';addTranslations(english);");
test('header disclosure exposes a labelled panel and a keyboard-accessible close button',()=>{
 assert.equal(typeof ui.renderHeaderMenu,'function');
 const markup=String(ui.renderHeaderMenu()).replace(/<!--.*?-->/g,'');
 assert.match(markup,/<summary[^>]*aria-controls="header-controls-panel"/);
 assert.match(markup,/id="header-controls-panel"[^>]*role="region"/);
 assert.match(markup,/<button[^>]*type="button"[^>]*data-header-menu-close[^>]*aria-label="Schließen"/);
 assert.doesNotMatch(markup,/role="menu"|tabindex="-1"|id="header-access"|id="inbox-button"/,'Live controls are moved intact, never cloned by the shell');
});
test('header menu caption and close action follow the selected language',()=>{
 ui.setLanguage('en');try{
  const markup=String(ui.renderHeaderMenu()).replace(/<!--.*?-->/g,'');
  assert.match(markup,/aria-label="Quick menu"/);assert.match(markup,/data-header-menu-close[^>]*aria-label="Close"/);
 }finally{ui.setLanguage('de');}
});
test('quick sign-out has a visible label and an icon in both languages',()=>{
 for(const [language,label] of [['de','Abmelden'],['en','Sign out']]){
  ui.setLanguage(language);
  try{const markup=String(ui.renderHeaderSignOut()).replace(/<!--.*?-->/g,'');assert.match(markup,/type="button"/);assert.match(markup,/data-header-signout/);assert.match(markup,/data-symbol="logout"/);assert.ok(markup.includes(label));}
  finally{ui.setLanguage('de');}
 }
});
