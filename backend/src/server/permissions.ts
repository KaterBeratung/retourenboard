import type {Capabilities} from '../shared/types.js';
import {InputError} from '../shared/model.js';
import {permissionsFor,hasPermission,type PermissionUser,type PermissionKey} from '../shared/permissions.js';
export {migratePermissions} from './legacy-sqlite/legacy-permissions.js';
export function capabilities(user:PermissionUser):Capabilities{
  if(user.role==='admin')return {edit:true,delete:true,import:true,export:true,admin:true};
  const p=permissionsFor(user);
  return {edit:p.productsCreate||p.productsEdit||p.returnsCreate||p.returnsEdit||p.returnsStatus||p.attachmentsUpload,delete:p.productsDelete||p.returnsDelete||p.attachmentsDelete,import:p.productsImport||p.returnsImport,export:p.productsExport||p.returnsExport,admin:false};
}
export function requireCapability(user:PermissionUser,key:keyof Capabilities):void{
  if(!capabilities(user)[key])throw new InputError('Du hast keine Berechtigung für diese Aktion.',403);
}
export function requirePermission(user:PermissionUser,key:PermissionKey):void{
  if(!hasPermission(user,key))throw new InputError('Du hast keine Berechtigung für diese Aktion.',403);
}
