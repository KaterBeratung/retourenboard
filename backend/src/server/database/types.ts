export type DatabaseConfig={connectionString:string;tls?:{ca?:string};poolMax:number;connectTimeoutMs:number;queryTimeoutMs:number};
export type SqlValue=string|number|boolean|Buffer|null;
export type QueryResult<Row>={rows:Row[];rowCount:number};
export type Hook=()=>void|Promise<void>;
export interface SqlDatabase {
 query<Row=Record<string,any>>(sql:string,values?:readonly SqlValue[]):Promise<QueryResult<Row>>;
 transaction<T>(job:()=>T|Promise<T>):Promise<T>;
 authorizeMutations<T>(authorize:()=>Promise<void>,job:()=>T|Promise<T>):Promise<T>;
 onCommit(job:Hook):void;
 onRollback(job:Hook):void;
 close():Promise<void>;
 readonly serverVersion:number;
 readonly schema:string;
}
