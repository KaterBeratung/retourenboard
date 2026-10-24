import {AsyncLocalStorage} from 'node:async_hooks';
import {test as nativeTest,after} from 'node:test';
export {before,after,beforeEach,afterEach,describe,it,mock} from 'node:test';
const context=new AsyncLocalStorage(),rootOwner={after};
export const currentTestOwner=()=>context.getStore()??rootOwner;
function contextual(register){return function(name,options,callback){
 if(typeof options==='function'){callback=options;options=undefined;}
 const body=callback?async t=>context.run(t,()=>callback(t)):undefined;
 return options===undefined?register(name,body):register(name,options,body);
};}
export const test=contextual(nativeTest);
for(const name of ['skip','only','todo'])test[name]=contextual(nativeTest[name]);
export default test;
