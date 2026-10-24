// A security flow belongs to one authentication generation, including anonymous
// MFA enrollment. Polling the same session must not invalidate that flow.
export function captureAuthContext(ctx:any):()=>boolean {
  const signature=()=>JSON.stringify([ctx.authGeneration??0,Boolean(ctx.unlocked),ctx.session?.user?.id,ctx.session?.csrfToken]);
  const original=signature();
  return ()=>signature()===original;
}
const signingOut=new WeakSet<object>();
export async function signOut(ctx:any,canLeave:()=>Promise<boolean>,button?:HTMLButtonElement){
  if(!ctx.unlocked||signingOut.has(ctx))return false;
  const current=captureAuthContext(ctx);signingOut.add(ctx);if(button)button.disabled=true;
  try{
    if(!await canLeave()||!current())return false;
    const session=await ctx.api('/api/logout',{method:'POST',body:{}});
    if(!current())return false;
    ctx.applySession(session);await ctx.reload();return true;
  }finally{signingOut.delete(ctx);if(button)button.disabled=false;}
}
