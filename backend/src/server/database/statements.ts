import type {SqlDatabase,SqlValue} from './types.js';
// Named query closures contain native PostgreSQL SQL; no SQL dialect conversion occurs here.
export function statement(db:SqlDatabase,sql:string){return {
 get:async(...values:SqlValue[])=>(await db.query(sql,values)).rows[0],
 all:async(...values:SqlValue[])=>(await db.query(sql,values)).rows,
 run:(...values:SqlValue[])=>db.query(sql,values)
};}
