import {LEGACY_TABLES} from './catalog.js';

const invalid=()=>new Error('Sicherung enthält ein unzulässiges Datenbankschema.');
type Token={kind:'word'|'number'|'string'|'identifier'|'symbol';value:string};
// Tokenize, never evaluate, SQL supplied by an archive. Keeping quoted values
// distinct prevents SQL-looking text in a literal from authorizing expressions.
function tokens(sql:string):Token[]{
 const result:Token[]=[];let i=0;
 while(i<sql.length){
  const rest=sql.slice(i),char=sql[i];
  if(/\s/.test(char)){i++;continue;}
  if(rest.startsWith('--')){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end+1;continue;}
  if(rest.startsWith('/*')){const end=sql.indexOf('*/',i+2);if(end<0)throw invalid();i=end+2;continue;}
  if(["'",'"','`','['].includes(char)){
   const end=char==='['?']':char,start=i++;let closed=false;
   while(i<sql.length){if(sql[i++]!==end)continue;if(char!=='['&&sql[i]===end){i++;continue;}closed=true;break;}
   if(!closed)throw invalid();result.push({kind:char==="'"?'string':'identifier',value:sql.slice(start,i)});continue;
  }
  const word=rest.match(/^[A-Za-z_\u0080-\uffff][A-Za-z_0-9$\u0080-\uffff]*/)?.[0];
  if(word){result.push({kind:'word',value:word.toLowerCase()});i+=word.length;continue;}
  const number=rest.match(/^(?:0[xX][0-9a-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/)?.[0];
  if(number){result.push({kind:'number',value:number.toLowerCase()});i+=number.length;continue;}
  result.push({kind:'symbol',value:char});i++;
 }
 return result;
}
function checks(sql:string):string[]{
 const input=tokens(sql),result:string[]=[];
 for(let i=0;i<input.length;i++)if(input[i].kind==='word'&&input[i].value==='check'){
  if(input[++i]?.value!=='(')throw invalid();const start=i+1;let depth=1;
  while(++i<input.length){const token=input[i];if(token.kind==='symbol'){if(token.value==='(')depth++;else if(token.value===')'&&--depth===0)break;}}
  if(depth!==0)throw invalid();result.push(JSON.stringify(input.slice(start,i)));
 }
 return result;
}
const allowedChecks=new Map<string,Set<string>>(LEGACY_TABLES.map(table=>[table.name,new Set(checks(table.sql))]));
// Before viewer accounts were introduced, the same users table had two roles.
allowedChecks.get('users')!.add(checks("CHECK(role IN ('admin','member'))")[0]);
export function assertLegacyChecks(table:string,sql:string):void{
 const allowed=allowedChecks.get(table);
 if(checks(sql).some(expression=>!allowed?.has(expression)))throw invalid();
}
export function assertLiteralDefault(value:unknown):void{
 if(value===null)return;
 if(typeof value!=='string')throw invalid();
 let input=tokens(value);
 // SQLite preserves optional parentheses around a literal in dflt_value.
 while(input[0]?.value==='('&&input.at(-1)?.value===')')input=input.slice(1,-1);
 if(input.length===1&&(input[0].kind==='string'||input[0].kind==='number'||input[0].kind==='word'&&['null','true','false'].includes(input[0].value)))return;
 if(input.length===2&&input[0].kind==='symbol'&&['+','-'].includes(input[0].value)&&input[1].kind==='number')return;
 if(input.length===2&&input[0].kind==='word'&&input[0].value==='x'&&input[1].kind==='string'&&/^'(?:[a-fA-F0-9]{2})*'$/.test(input[1].value))return;
 throw invalid();
}
