export function createInputGeneration(){
  let current=0;
  return {get current(){return current;},advance(){return ++current;},
    withCurrent(token:number,action:()=>void){if(token!==current)return false;action();return true;},
    async read<T>(source:()=>Promise<T>,accept:(value:T)=>void,reject:(error:unknown)=>void){const token=++current;try{const value=await source();if(token===current)accept(value);}catch(error){if(token===current)reject(error);}}
  };
}
