import type {Role} from './types.js';

export const PERMISSION_GROUPS = [
  {label:'Entsorgung',description:'Einzelgeräte erfassen und die Durchführung nachvollziehbar dokumentieren.',entries:[['disposalsRead','Geräteaufträge ansehen'],['disposalsCreate','Geräteaufträge anlegen'],['disposalsEdit','Geräteaufträge bearbeiten / stornieren'],['disposalsApprove','Vernichtung / Entsorgung freigeben'],['disposalsComplete','Durchführung bestätigen und korrigieren'],['disposalsExport','Etiketten / Nachweise drucken und exportieren'],['disposalsImport','Geräteaufträge importieren'],['disposalsCommentsCreate','Geräteaufträge kommentieren und eigene Kommentare bearbeiten'],['disposalsCommentsModerate','Gerätekommentare anderer Personen moderieren'],['disposalsShare','Geräte-Kundenstatus teilen']]},
  {label:'Produkte',description:'Produktdaten und den Produktbestand verwalten.',entries:[
    ['productsCreate','Produkte anlegen'],['productsEdit','Produkte bearbeiten'],['productsDelete','Produkte archivieren / löschen'],['productsImport','Produkte per CSV importieren'],['productsExport','Produkte als CSV exportieren']
  ]},
  {label:'Retouren',description:'Vorgänge erfassen und unabhängig davon weiterbearbeiten.',entries:[
    ['returnsCreate','Retouren anlegen'],['returnsEdit','Retourendaten bearbeiten'],['returnsStatus','Retourenstatus ändern'],['returnsDelete','Retouren löschen'],['returnsImport','Retouren per CSV importieren'],['returnsExport','Retouren als CSV exportieren'],['returnsShare','Kundenstatus teilen']
  ]},
  {label:'Dateianhänge',description:'Vorschau und Download gelten gemeinsam. Dateien gehören zum jeweiligen Vorgang.',entries:[
    ['attachmentsView','Dateien ansehen und herunterladen'],['attachmentsUpload','Dateien hochladen'],['attachmentsDelete','Dateien löschen']
  ]},
  {label:'Chat & Kommentare',description:'Private Unterhaltungen bleiben auf ihre Teilnehmer beschränkt, auch für Administratoren.',entries:[
    ['chatRead','Chat lesen'],['chatSend','Nachrichten senden und eigene Nachrichten bearbeiten'],['chatGroupsCreate','Gruppen erstellen und eigene Gruppen verwalten'],['chatModerate','Öffentliche Chats moderieren'],['commentsCreate','Retouren kommentieren und eigene Kommentare bearbeiten'],['commentsModerate','Kommentare anderer Personen moderieren']
  ]},
  {label:'Verwaltungsaufgaben',description:'Einzeln freigeben, ohne das Konto zum Administrator zu machen.',entries:[
    ['masterdataManage','Stammdaten verwalten'],['csvProfilesManage','CSV-Profile verwalten'],['rulesManage','Retourenregeln verwalten'],['auditView','Änderungsverlauf ansehen'],['diagnosticsView','Diagnose ansehen']
  ]}
] as const;
export type PermissionKey=typeof PERMISSION_GROUPS[number]['entries'][number][0];
export type Permissions=Record<PermissionKey,boolean>;
export const PERMISSION_KEYS=PERMISSION_GROUPS.flatMap(group=>group.entries.map(entry=>entry[0])) as PermissionKey[];
export const READ_ONLY_PERMISSIONS=new Set<PermissionKey>(['productsExport','returnsExport','attachmentsView','auditView','diagnosticsView','chatRead','disposalsRead','disposalsExport']);
export const ADMIN_SECTION_PERMISSIONS={masterdata:'masterdataManage','csv-profiles':'csvProfilesManage',rules:'rulesManage',audit:'auditView',diagnostics:'diagnosticsView'} as const;
export const LEGACY_PERMISSION_GROUPS={delete:['productsDelete','returnsDelete','attachmentsDelete'],import:['productsImport','returnsImport'],export:['productsExport','returnsExport']} as const;
export type PermissionUser={role:Role;canDelete?:number|boolean;canImport?:number|boolean;canExport?:number|boolean;permissionOverrides?:string;permissions?:Partial<Permissions>&{delete?:boolean;import?:boolean;export?:boolean}};

export function defaultPermissions(role:Role,legacy:Partial<Record<'delete'|'import'|'export',boolean>>={}):Permissions{
  const member=role==='member';
  const result=Object.fromEntries(PERMISSION_KEYS.map(key=>[key,role==='admin'||key==='attachmentsView'||key==='chatRead'||key==='disposalsRead'||member&&!['returnsShare','disposalsShare','disposalsCommentsModerate','chatModerate','commentsModerate','disposalsApprove','disposalsComplete','disposalsImport'].includes(key)&&!Object.values(ADMIN_SECTION_PERMISSIONS).includes(key as any)])) as Permissions;
  if(role!=='admin')for(const [alias,keys] of Object.entries(LEGACY_PERMISSION_GROUPS)){
    const allowed=legacy[alias as keyof typeof legacy]??member;
    for(const key of keys)result[key]=allowed&&(member||alias==='export');
  }
  return result;
}
export function permissionsFor(user:PermissionUser):Permissions{
  if(user.role==='admin')return defaultPermissions('admin');
  const old=user.permissions??{},member=user.role==='member';
  const rights=defaultPermissions(user.role,{delete:Boolean(user.canDelete??old.delete??member),import:Boolean(user.canImport??old.import??member),export:Boolean(user.canExport??old.export??member)});
  const overrides=user.permissionOverrides?JSON.parse(user.permissionOverrides):old;
  for(const key of PERMISSION_KEYS)if(typeof overrides[key]==='boolean')rights[key]=overrides[key];
  if(user.role==='viewer')for(const key of PERMISSION_KEYS)if(!READ_ONLY_PERMISSIONS.has(key))rights[key]=false;
  if(!rights.attachmentsView){rights.attachmentsUpload=false;rights.attachmentsDelete=false;}
  if(!rights.chatRead){rights.chatSend=false;rights.chatGroupsCreate=false;rights.chatModerate=false;}
  if(!rights.disposalsRead)for(const key of PERMISSION_KEYS)if(key.startsWith('disposals'))rights[key]=false;
  return rights;
}
export function hasPermission(user:PermissionUser|null|undefined,key:PermissionKey):boolean{
  return !!user&&permissionsFor(user)[key];
}
export function canAdminSection(user:PermissionUser|null|undefined,section:string):boolean{
  if(!user||section==='appearance')return false;
  if(user.role==='admin')return true;
  const key=ADMIN_SECTION_PERMISSIONS[section as keyof typeof ADMIN_SECTION_PERMISSIONS];
  return !!key&&hasPermission(user,key);
}
