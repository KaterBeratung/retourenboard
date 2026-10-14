import {html,locale,setText,t} from './i18n.js';
import {switchField} from './switches.js';
import {PERMISSION_GROUPS,PERMISSION_KEYS,READ_ONLY_PERMISSIONS,defaultPermissions,permissionsFor} from '../shared/permissions.js';

export function permissionSummary(user):string{
  if(user.role==='admin')return t('Alle Rechte');
  const rights=permissionsFor(user),standard=defaultPermissions(user.role);
  const individual=PERMISSION_KEYS.some(key=>rights[key]!==standard[key]);
  return t`${individual?t('Individuell'):t('Standard')} · ${PERMISSION_KEYS.filter(key=>rights[key]).length} ${t('Rechte')}`;
}
export function renderPermissionEditor(user):string{
  const rights=permissionsFor({role:user.role??'member',permissions:user.permissions});
  return html`<section class="permission-editor" aria-labelledby="permission-editor-title"><div class="permission-editor-heading"><div><h3 id="permission-editor-title">Berechtigungen</h3><p>Die Rolle gibt den Ausgangspunkt vor. Passe die einzelnen Rechte für dieses Konto an.</p></div><span class="count-pill" id="permission-total"></span></div><div class="permission-toolbar"><button type="button" class="btn secondary small" data-permission-preset="default">Standardrechte der Rolle</button><button type="button" class="btn secondary small" data-permission-preset="all">Alle erlauben</button><button type="button" class="btn secondary small" data-permission-preset="none">Alle abwählen</button></div><div class="permission-grid">${PERMISSION_GROUPS.map((group,index)=>html`<fieldset class="permission-group"><legend>${t(group.label)}<span class="count-pill" data-permission-count="${index}"></span></legend><p>${t(group.description)}</p>${group.entries.map(([key,label])=>`${switchField("permission-"+key,t(label),rights[key])}`).join('')}</fieldset>`).join('')}</div><p class="permission-help" id="permission-role-note"></p><p class="permission-help">CSV-Import benötigt zusätzlich das Recht zum Anlegen bzw. Bearbeiten der betroffenen Datensätze. Dateien hochladen und löschen setzt Dateizugriff voraus. Retouren mit Anhängen können nur mit beiden Löschrechten entfernt werden.</p><p class="permission-help">Konten, Sicherheitsregeln, Servereinstellungen, E-Mail-Versand und Sicherungen verwalten ausschließlich Administratoren. Rechteänderungen gelten auch für bereits angemeldete Personen.</p></section>`;
}
export function bindPermissionEditor(form,user):{values:()=>Record<string,boolean>}{
  const role=form.elements.namedItem('role'),cache=new Map<string,Record<string,boolean>>();
  let previous=role.value;
  const field=key=>form.elements.namedItem('permission-'+key);
  const values=()=>Object.fromEntries(PERMISSION_KEYS.map(key=>[key,field(key).checked]));
  function refresh(){
    const admin=role.value==='admin',viewer=role.value==='viewer';
    for(const key of PERMISSION_KEYS){const node=field(key);node.disabled=admin||viewer&&!READ_ONLY_PERMISSIONS.has(key);if(admin)node.checked=true;else if(node.disabled)node.checked=false;}
    form.querySelectorAll('[data-permission-preset]').forEach(button=>button.disabled=admin);
    setText(form.querySelector('#permission-total'),`${Object.values(values()).filter(Boolean).length} / ${PERMISSION_KEYS.length}`);
    PERMISSION_GROUPS.forEach((group,index)=>form.querySelector(`[data-permission-count="${index}"]`).textContent=String(group.entries.filter(([key])=>field(key).checked).length));
    setText(form.querySelector('#permission-role-note'),admin?t('Administratoren haben alle Rechte. Einzelne Einschränkungen sind bei Mitarbeiter- und Lesekonten möglich.'):viewer?t('„Nur lesen“ erlaubt keine Änderungen. Dateizugriff, Exporte und die Einsicht in Verlauf oder Diagnose sind einzeln einstellbar.'):t('Mitarbeiter erhalten nur die hier aktivierten Rechte. Freigegebene Verwaltungsaufgaben sind einzeln im Adminbereich erreichbar.'));
  }
  form.querySelectorAll('[data-permission-preset]').forEach(button=>button.addEventListener('click',()=>{
    const preset=button.dataset.permissionPreset,defaults=defaultPermissions(role.value);
    for(const key of PERMISSION_KEYS)field(key).checked=preset==='default'?defaults[key]:preset==='all'&&(role.value!=='viewer'||READ_ONLY_PERMISSIONS.has(key));
    refresh();form.dispatchEvent(new Event('change',{bubbles:true}));
  }));
  role.addEventListener('change',()=>{cache.set(previous,values());const next=cache.get(role.value)??defaultPermissions(role.value);for(const key of PERMISSION_KEYS)field(key).checked=next[key];previous=role.value;refresh();});
  for(const key of PERMISSION_KEYS)field(key).addEventListener('change',()=>{
    if((key==='attachmentsUpload'||key==='attachmentsDelete')&&field(key).checked)field('attachmentsView').checked=true;
    if(key==='attachmentsView'&&!field(key).checked){field('attachmentsUpload').checked=false;field('attachmentsDelete').checked=false;}
    if(['chatSend','chatGroupsCreate','chatModerate'].includes(key)&&field(key).checked)field('chatRead').checked=true;
    if(key==='chatRead'&&!field(key).checked){field('chatSend').checked=false;field('chatGroupsCreate').checked=false;field('chatModerate').checked=false;}
    refresh();
  });
  refresh();return {values};
}
