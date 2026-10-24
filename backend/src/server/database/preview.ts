import type {SqlDatabase} from './types.js';
class PreviewResult<T> extends Error{constructor(readonly value:T){super('Preview transaction rollback');}}
export async function rollbackPreview<T>(db:SqlDatabase,job:()=>Promise<T>):Promise<T>{
 try{await db.transaction(async()=>{throw new PreviewResult(await job());});}
 catch(error){if(error instanceof PreviewResult)return error.value;throw error;}
 throw new Error('Vorschau wurde nicht zurückgenommen.');
}
