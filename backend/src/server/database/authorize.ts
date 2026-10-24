import {InputError} from '../../shared/model.js';
import {requirePermission} from '../permissions.js';
import type {PermissionKey} from '../../shared/permissions.js';
import type {SqlDatabase} from './types.js';
type Session={id:string;user:{id:number;[key:string]:any}};
export function createMutationGuard(db:SqlDatabase,requireAccess:()=>Promise<Session>){
 return async function withAuthorizedMutation<T>(snapshot:Session,requiredPermissions:readonly PermissionKey[],job:()=>T|Promise<T>):Promise<T>{
  return db.transaction(()=>db.authorizeMutations(async()=>{
   const row=(await db.query('SELECT id FROM users WHERE id=$1 AND active=1 AND deletedAt IS NULL FOR SHARE',[snapshot.user.id])).rows[0];
   if(!row)throw new InputError('Bitte zuerst anmelden.',401);
   const current=await requireAccess();if(current.id!==snapshot.id||current.user.id!==snapshot.user.id)throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.',401);
   for(const permission of requiredPermissions)requirePermission(current.user as any,permission);
  },job));
 };
}
