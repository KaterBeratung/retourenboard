// Move only the non-interactive title at synchronous paint. Transforming the
// entire workspace can leave stale hit-test regions after inert/dialog changes
// in Chromium, making visible controls unreachable even after motion finishes.
export function createSectionTransition(root:any,_doc:any,allowed:()=>boolean){
    let key:string|null=null,generation=0;
    const animations=new Set<any>();
    function play(target:any,frames:any[],options:any){
        if(typeof target?.animate!=='function')return;
        const effect=target.animate(frames,options);animations.add(effect);
        void effect.finished.then(()=>animations.delete(effect),()=>animations.delete(effect));
    }
    function cancel(){
        generation++;
        for(const effect of animations)effect.cancel();animations.clear();
    }
    async function run(next:string,update:()=>unknown){
        const changed=key!==null&&key!==next;
        const overviewEntry=next==='overview'&&(key===null||changed);
        if(changed||!allowed())cancel();
        const current=++generation;
        try{
            const ready=update();key=next;
            const heading=root.querySelector?.('.page-heading h1');
            if(changed&&current===generation&&allowed()&&typeof heading?.animate==='function'){
                play(heading,[{translate:'0 3px'},{translate:'0 0'}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'});
            }
            // Only decorative values fade once per visit, never cards or controls.
            if(overviewEntry&&current===generation&&allowed()){
                const values=Array.from(root.querySelectorAll?.('.workspace-overview .kpi>strong')??[]);
                values.forEach((value,index)=>play(value,[{opacity:.35},{opacity:1}],{duration:320,delay:Math.min(index,3)*45,easing:'ease-out'}));
            }
            await ready;
        }catch(error){
            if(current===generation)cancel();
            throw error;
        }
    }
    return {run,cancel};
}
