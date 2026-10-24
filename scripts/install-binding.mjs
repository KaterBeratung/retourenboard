import {networkInterfaces} from 'node:os';
import {BlockList,isIP} from 'node:net';
import {parseEnv} from 'node:util';
import {lstatSync,readFileSync,writeFileSync,openSync,closeSync,fsyncSync,renameSync,chmodSync,chownSync,rmSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export function installBindingHost(host,{mode='auto',upgradeLoopback=false,interfaces=networkInterfaces()}={}){
 if(!['auto','lan','local'].includes(mode))throw Error('Ungültige Bindungsoption.');
 if(mode==='local')return '127.0.0.1';
 if(mode==='lan')return '0.0.0.0';
 if(!host||upgradeLoopback&&['127.0.0.1','localhost','::1'].includes(host))return '0.0.0.0';
 if(['0.0.0.0','::','localhost','::1'].includes(host)||host.startsWith('127.'))return host;
 const family=isIP(host.split('%')[0]);
 if(!family)return host;
 const assigned=new BlockList();
 for(const addresses of Object.values(interfaces))for(const item of addresses??[]){const address=item.address.split('%')[0],kind=isIP(address);if(kind)assigned.addAddress(address,kind===6?'ipv6':'ipv4');}
 return assigned.check(host.split('%')[0],family===6?'ipv6':'ipv4')?host:'0.0.0.0';
}

// Only HOST changes, including when a pending install restores its staged env.
export function repairInstallBinding(file,options={}){
 const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw Error('Ungültige Installationskonfiguration.');
 const original=readFileSync(file,'utf8'),current=parseEnv(original).HOST??'',host=installBindingHost(current,options);
 if(host===current)return host;
 let found=false;const lines=original.split(/\r?\n/).flatMap(line=>{if(!/^\s*HOST\s*=/.test(line))return [line];if(found)return [];found=true;return ['HOST='+host];});
 if(!found){while(lines.at(-1)==='')lines.pop();lines.push('HOST='+host,'');}
 const temporary=file+'.'+randomUUID()+'.part';
 try{
  writeFileSync(temporary,lines.join('\n'),{flag:'wx',mode:stat.mode&0o777});
  if(process.platform!=='win32'){chmodSync(temporary,stat.mode&0o777);if(process.getuid()===0)chownSync(temporary,stat.uid,stat.gid);}
  const fd=openSync(temporary,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
  renameSync(temporary,file);
  if(process.platform!=='win32'){const directory=openSync(dirname(file),'r');try{fsyncSync(directory);}finally{closeSync(directory);}}
 }finally{rmSync(temporary,{force:true});}
 return host;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [file,mode='auto',upgradeLoopback='false',...extra]=process.argv.slice(2);if(!file||extra.length)throw Error('Konfigurationspfad und Bindungsoption angeben.');console.log(repairInstallBinding(file,{mode,upgradeLoopback:upgradeLoopback==='true'}));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
