// Only served by the temporary demo server; the main app has no demo account.
import {html,t,addTranslations} from '/i18n.js';
addTranslations({'Demomodus':'Demo mode','Testdaten':'Sample data','Demomodus mit Testdaten':'Demo mode with sample data'});
const page = document.querySelector('#auth-page');
function showHint() {
  if (!page.querySelector('#login-form') || page.querySelector('.demo-login-hint')) return;
  page.insertAdjacentHTML('beforeend', html`<p class="demo-login-hint"><strong>${t('Demomodus mit Testdaten')}</strong><br>${t('Benutzername')}: <strong>demo</strong> · ${t('Passwort')}: <strong>RetourenboardDemo2026!</strong></p>`);
}
new MutationObserver(showHint).observe(page, { childList: true });
showHint();
