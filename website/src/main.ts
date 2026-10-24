import {bindMobileMenu} from './navigation.js';
import {bindThemeToggle} from './theme.js';
export {bindThemeToggle} from './theme.js';
export {bindMobileMenu} from './navigation.js';
import {revealOnScroll,bindSceneMotion} from './motion.js';
import {createLanguageController} from './i18n.js';
import {createReleaseDownload,type DownloadKind} from './downloads.js';
import {createPreferencePrivacy,bindPrivacyBanner,privacyStorageKey} from './privacy.js';
import {bindPreviewDevice} from './preview-device.js';
export {bindPreviewDevice} from './preview-device.js';
export {createPreferencePrivacy,bindPrivacyBanner} from './privacy.js';
export {selectReleaseDownload,resolveLatestDownload,createReleaseDownload} from './downloads.js';
export {revealOnScroll,bindSceneMotion} from './motion.js';
export {createLanguageController,translateText,englishText} from './i18n.js';
const privacy=createPreferencePrivacy(()=>window.localStorage);
const language=createLanguageController(document,()=>privacy.storage);
bindThemeToggle(document,window.matchMedia('(prefers-color-scheme: dark)'),()=>privacy.storage);
const motion=bindSceneMotion(document,window.matchMedia('(prefers-reduced-motion: reduce)'),window.IntersectionObserver,()=>privacy.storage);
bindPrivacyBanner(document,privacy);
window.addEventListener?.('storage',event=>{if(event.key===privacyStorageKey||event.key===null)privacy.sync();});
const downloadLinks=[...document.querySelectorAll<HTMLAnchorElement>('[data-release-download]')];
const downloadStatus=document.getElementById('download-status');let downloadMessage='';
function renderDownloadState(){if(downloadStatus)downloadStatus.textContent=language.text(downloadMessage);}
language.onChange(renderDownloadState);
const startDownload=createReleaseDownload({navigate:url=>window.location.assign(url),update:state=>{
 downloadMessage=state.message;renderDownloadState();
 for(const link of downloadLinks){link.setAttribute('aria-busy',String(state.busy));link.setAttribute('aria-disabled',String(state.busy));}
}});
for(const link of downloadLinks)link.addEventListener('click',event=>{
 if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const kind=link.dataset.releaseDownload;if(kind!=='installer'&&kind!=='archive')return;
 event.preventDefault();void startDownload(kind as DownloadKind);
});
bindMobileMenu(document, window.matchMedia('(max-width: 900px)'));
function bindTabs(selector: string, activate: (button: HTMLButtonElement) => void) {
 const buttons = [...document.querySelectorAll<HTMLButtonElement>(selector)];
 function select(button: HTMLButtonElement) { for (const candidate of buttons) { const selected = candidate === button; candidate.setAttribute('aria-selected', String(selected)); candidate.tabIndex = selected ? 0 : -1; } activate(button); }
 for (const button of buttons) {
  button.addEventListener('click', () => select(button));
  button.addEventListener('keydown', event => {
   const index = buttons.indexOf(button); let next: HTMLButtonElement | undefined;
   if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = buttons[(index + 1) % buttons.length];
   else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = buttons[(index + buttons.length - 1) % buttons.length];
   else if (event.key === 'Home') next = buttons[0]; else if (event.key === 'End') next = buttons.at(-1);
   if (next) { event.preventDefault(); select(next); next.focus(); }
  });
 }
}
bindTabs('[data-preview]', button => { for (const panel of document.querySelectorAll<HTMLElement>('.preview-panel')) panel.hidden = panel.id !== button.getAttribute('aria-controls'); });
bindPreviewDevice(document);
const command = document.getElementById('install-command'), note = document.getElementById('command-note'), status = document.getElementById('copy-status');
const copy = document.querySelector<HTMLButtonElement>('#copy-command'); let generation = 0;
let installMode=false,activeStep=0,copyMessage='';
const stepLabels=['Eingegangen','In Prüfung','Abgeschlossen'];
function renderLocalizedState(){
 if(note)note.textContent=language.text(installMode?'Für Debian / Ubuntu mit systemd. Als root kann sudo entfallen. Eine vorhandene Installation wird aktualisiert.':'Ohne root und ohne Dienst. Ein isolierter PostgreSQL-Testserver wird benötigt.');
 if(status)status.textContent=language.text(copyMessage);
 const state=document.getElementById('workflow-state');if(state)state.textContent=language.text(stepLabels[activeStep]??stepLabels[0]);
}
language.onChange(renderLocalizedState);renderLocalizedState();
bindTabs('[data-install]', button => {
 generation++; const install = button.dataset.install === 'install';
 installMode=install;copyMessage='';
 if (command) command.textContent = install ? 'sudo bash retourenboard-install.sh' : 'bash retourenboard-install.sh --test';
 document.getElementById('command-panel')?.setAttribute('aria-labelledby', button.id);renderLocalizedState();
});
copy?.addEventListener('click', async () => {
 const text = command?.textContent; if (!text || !status) return; const current = generation; copy.disabled = true;
 try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(text); if (current === generation) {copyMessage='Befehl kopiert.';renderLocalizedState();} }
 catch { if (current === generation) {copyMessage='Bitte den Befehl oben markieren und kopieren.';renderLocalizedState();} }
 finally { copy.disabled = false; }
});

const steps=[...document.querySelectorAll<HTMLButtonElement>('[data-workflow-step]')];
const workflow=document.getElementById('workflow-demo');
for(const button of steps)button.addEventListener('click',()=>{
 const index=Number(button.dataset.workflowStep);
 activeStep=index;
 for(const candidate of steps)candidate.setAttribute('aria-pressed',String(candidate===button));
 for(const panel of document.querySelectorAll<HTMLElement>('[data-workflow-panel]'))panel.hidden=Number(panel.dataset.workflowPanel)!==index;
 if(workflow)workflow.dataset.step=String(index);
 renderLocalizedState();
});
revealOnScroll([...document.querySelectorAll<HTMLElement>('[data-reveal]')],motion,window.IntersectionObserver);
