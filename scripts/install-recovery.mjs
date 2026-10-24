import {readFileSync,writeFileSync,existsSync,openSync,fsyncSync,closeSync,renameSync,rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

// Recovery may restore the old SQLite env. The next attempt must still stage
// the PostgreSQL candidate, with the recovered env/unit as its rollback pair.
export async function preserveInstallCandidate({configFile,unitFile,previousConfigFile,previousUnitFile,recover}){
 const candidate=readFileSync(configFile),recovered=await recover();
 const read=path=>path&&existsSync(path)?readFileSync(path):undefined;
 const previous={config:read(recovered?configFile:previousConfigFile),unit:read(recovered?unitFile:previousUnitFile)};
 if(!read(configFile)?.equals(candidate)){
  const temporary=configFile+'.'+randomUUID()+'.part';
  try{writeFileSync(temporary,candidate,{flag:'wx',mode:0o600});const fd=openSync(temporary,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temporary,configFile);if(process.platform!=='win32'){const parent=openSync(dirname(configFile),'r');try{fsyncSync(parent);}finally{closeSync(parent);}}}
  finally{rmSync(temporary,{force:true});}
 }
 return previous;
}
