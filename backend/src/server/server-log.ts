export type LogEntry={id:string;time:string;level:'info'|'warn'|'error';message:string};
const sensitiveKey=/^(?:authorization|cookie|set-cookie|password(?:Hash|Salt)?|passwort|smtpPassword|apiKey|secret(?:Enc)?|csrfToken|token|sessionToken|factor|recoveryCodes?)$/i;
function redactStructured(value:any,depth=0):any {
 if(depth>32)return '[ausgeblendet]';
 if(Array.isArray(value))return value.map(item=>redactStructured(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,sensitiveKey.test(key)?'[ausgeblendet]':redactStructured(item,depth+1)]));
 return value;
}
export function redactLog(value:unknown):string {
 let message=String(value??'').slice(0,16384);
 const start=message.indexOf('{'),end=message.lastIndexOf('}');
 if(start>=0&&end>start)try{message=message.slice(0,start)+JSON.stringify(redactStructured(JSON.parse(message.slice(start,end+1))))+message.slice(end+1);}catch{}
 return message
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')
  .replace(/\b(Authorization|Cookie|Set-Cookie)["']?\s*:[^\r\n]*/gi,'$1: [ausgeblendet]')
  .replace(/\b(Bearer|Basic)\s+[\w.+\/-]+=*/gi,'$1 [ausgeblendet]')
  .replace(/(["']?recoveryCodes?["']?\s*[:=]\s*)\[[^\]\r\n]*\]/gi,'$1[ausgeblendet]')
  .replace(/((?:"|')?(?:password(?:Hash|Salt)?|passwort|smtpPassword|apiKey|secret(?:Enc)?|csrfToken|token|sessionToken|factor|recoveryCodes?)(?:"|')?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'[^']*'|[^\s,;]+)/gi,'$1[ausgeblendet]')
  .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[ausgeblendet]@')
  .replace(/(\/[sd]\/|\/api\/public\/(?:return|disposal)-status\/)[A-Za-z0-9_-]+/g,'$1[ausgeblendet]')
  .replace(/\b[a-f0-9]{48,}\b/gi,'[ausgeblendet]').slice(0,2000);
}
export function boundedEntries(entries:LogEntry[]):LogEntry[]{let bytes=0;const result:LogEntry[]=[];for(const entry of entries.slice(-200).reverse()){bytes+=Buffer.byteLength(JSON.stringify(entry));if(bytes>128*1024)break;result.unshift(entry);}return result;}
export function createServerLog({now=Date.now}:{now?:()=>number}={}){
 let sequence=0,entries:LogEntry[]=[];
 return {write(level:LogEntry['level'],message:string){entries=boundedEntries([...entries,{id:String(++sequence),time:new Date(now()).toISOString(),level,message:redactLog(message)}]);},
  read(){return {source:'application',entries:entries.map(item=>({...item})),checkedAt:new Date(now()).toISOString(),message:'Anwendungsereignisse dieser Laufzeit. Vollständige Dienstlogs sind in der verwalteten Linuxinstallation verfügbar.'};}};
}
