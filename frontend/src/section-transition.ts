// Start at the synchronous paint, not after asynchronous data binding: moving a
// page that has already been read feels like a second navigation. Keep it opaque.
export function createSectionTransition(root:any,_doc:any,allowed:()=>boolean){
    let key:string|null=null,generation=0,animation:any=null;
    function cancel(){
        generation++;
        animation?.cancel();animation=null;
    }
    async function run(next:string,update:()=>unknown){
        const changed=key!==null&&key!==next;
        if(changed||!allowed())cancel();
        const current=++generation;
        try{
            const ready=update();key=next;
            if(changed&&current===generation&&allowed()&&typeof root.animate==='function'){
                animation=root.animate([{translate:'0 3px'},{translate:'0 0'}],{duration:160,easing:'cubic-bezier(.22,1,.36,1)'});
                const effect=animation;
                void effect.finished.then(()=>{if(animation===effect)animation=null;},()=>{if(animation===effect)animation=null;});
            }
            await ready;
        }catch(error){
            if(current===generation)cancel();
            throw error;
        }
    }
    return {run,cancel};
}
