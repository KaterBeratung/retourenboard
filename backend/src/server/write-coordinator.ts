import {InputError} from '../shared/model.js';
export function createWriteCoordinator(){
  let tail:Promise<void>=Promise.resolve(),closed=false,pending=0;
  function run<T>(job:()=>T|Promise<T>):Promise<T>{
    if(closed)return Promise.reject(new InputError('Schreibzugriff wurde beendet.',503));
    if(pending>=128)return Promise.reject(new InputError('Server beschäftigt. Bitte kurz warten.',503));
    pending++;
    const result=tail.then(job).finally(()=>{pending--;});
    tail=result.then(()=>{},()=>{});return result;
  }
  return {run,async close(){closed=true;await tail;}};
}
