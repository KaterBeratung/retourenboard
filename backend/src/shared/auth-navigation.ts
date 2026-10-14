const defaultReturn='/#overview';
const base='https://retourenboard.invalid';
const applicationPages=new Set(['/','/index.html','/admin','/admin/','/admin.html','/account','/account/','/account.html','/chat','/chat/']);

// Login destinations are application pages on this host, never arbitrary URLs.
export function safeReturnPath(value:unknown):string {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x20\x7f]/.test(value))return defaultReturn;
  try{
    const url=new URL(value,base);
    if(url.origin!==base||!applicationPages.has(url.pathname))return defaultReturn;
    return url.pathname+url.search+url.hash;
  }catch{return defaultReturn;}
}
export function loginPathFor(value:string):string {
  return '/login?returnTo='+encodeURIComponent(safeReturnPath(value));
}
export function returnPathAfterLogin(current:string):string {
  const url=new URL(current,base),destination=safeReturnPath(url.searchParams.get('returnTo'));
  // Browsers inherit a fragment when the HTTP redirect's Location has none.
  return url.hash&&!destination.includes('#')?safeReturnPath(destination+url.hash):destination;
}
