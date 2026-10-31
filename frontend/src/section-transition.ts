// Move only the non-interactive title at synchronous paint. Transforming the
// entire workspace can leave stale hit-test regions after inert/dialog changes
// in Chromium, making visible controls unreachable even after motion finishes.
// The overview adds decorations that never carry a click target: figures count
// up, tile icons pop in and bars are drawn. The tiles, links and buttons stay put.
const settle='cubic-bezier(.22,1,.36,1)',pop='cubic-bezier(.34,1.56,.64,1)',wholeNumber=/^\d{1,6}$/;
export function createSectionTransition(root:any,_doc:any,allowed:()=>boolean){
    let key:string|null=null,generation=0;
    const animations=new Set<any>();
    const all=(selector:string):any[]=>{const found=root.querySelectorAll?.(selector);return found?Array.from(found):[];};
    function play(target:any,frames:any[],options:any){
        if(typeof target?.animate!=='function')return;
        const effect=target.animate(frames,options);animations.add(effect);
        void effect.finished.then(()=>animations.delete(effect),()=>animations.delete(effect));
    }
    function cancel(){
        generation++;
        for(const effect of animations)effect.cancel();animations.clear();
    }
    // Whole numbers count up; anything else (currency, text) fades in. The text always ends on the real value,
    // also when the frame loop is throttled, replaced by a refresh, or motion is switched off meanwhile.
    function figure(value:any,delay:number,current:number){
        const text=String(value?.textContent??'').trim(),target=Number(text),frame=(globalThis as any).requestAnimationFrame;
        if(!wholeNumber.test(text)||target<2||typeof frame!=='function'||typeof value.animate!=='function'){
            play(value,[{opacity:.35},{opacity:1}],{duration:320,delay,easing:'ease-out'});return;
        }
        const duration=Math.round(560+Math.log10(target+1)*220),begin=performance.now()+delay,full=1-Math.pow(2,-10);
        let finished=false;
        const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);value.textContent=text;};
        const timer=setTimeout(finish,delay+duration+300);
        const step=(now:number)=>{
            if(finished)return;
            const progress=(now-begin)/duration;
            if(progress>=1||current!==generation||!allowed()||value.isConnected===false){finish();return;}
            value.textContent=String(Math.round(target*(1-Math.pow(2,-10*Math.max(0,progress)))/full));
            frame(step);
        };
        value.textContent='0';frame(step);
    }
    function overviewEntrance(current:number){
        const stagger=(index:number,step:number,limit:number)=>Math.min(index,limit)*step;
        all('.workspace-overview .kpi>strong').forEach((value,index)=>figure(value,stagger(index,60,4),current));
        all('.workspace-overview .kpi-icon').forEach((icon,index)=>play(icon,[{opacity:0,scale:.6},{opacity:1,scale:1}],{duration:480,delay:stagger(index,60,4),easing:pop,fill:'backwards'}));
        const draw=(bars:any[],from:string,first:number,step:number,limit:number)=>bars.forEach((bar,index)=>play(bar,[{clipPath:from},{clipPath:'inset(0 0 0 0)'}],{duration:760,delay:first+stagger(index,step,limit),easing:settle,fill:'backwards'}));
        draw(all('.workspace-overview .workflow-bar'),'inset(0 100% 0 0)',180,60,4);
        draw(all('.workspace-overview .reason-bar'),'inset(0 100% 0 0)',240,50,8);
        draw(all('.workspace-overview .month-bar'),'inset(100% 0 0 0)',280,30,12);
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
                play(heading,[{translate:'0 3px'},{translate:'0 0'}],{duration:180,easing:settle});
                // The label above and the sentence below settle a beat later, so the heading reads as one gesture.
                all('.page-heading .eyebrow').forEach(label=>play(label,[{translate:'0 5px'},{translate:'0 0'}],{duration:260,delay:20,easing:settle,fill:'backwards'}));
                all('.page-heading p').forEach(line=>play(line,[{translate:'0 5px'},{translate:'0 0'}],{duration:300,delay:60,easing:settle,fill:'backwards'}));
            }
            if(overviewEntry&&current===generation&&allowed())overviewEntrance(current);
            await ready;
        }catch(error){
            if(current===generation)cancel();
            throw error;
        }
    }
    return {run,cancel};
}
