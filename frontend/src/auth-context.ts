// A security flow belongs to one authentication generation, including anonymous
// MFA enrollment. Polling the same session must not invalidate that flow.
export function captureAuthContext(ctx:any):()=>boolean {
  const signature=()=>JSON.stringify([ctx.authGeneration??0,Boolean(ctx.unlocked),ctx.session?.user?.id,ctx.session?.csrfToken]);
  const original=signature();
  return ()=>signature()===original;
}
