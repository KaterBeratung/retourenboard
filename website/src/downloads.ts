export type DownloadKind='installer'|'archive';
export const latestReleaseUrl='https://github.com/KaterBeratung/retourenboard/releases/latest';
const latestApiUrl='https://api.github.com/repos/KaterBeratung/retourenboard/releases/latest';
type Download={url:string;version:string};
type Release={tag_name?:unknown;draft?:boolean;prerelease?:boolean;assets?:{name?:unknown}[]};

export function selectReleaseDownload(value:unknown,kind:DownloadKind):Download {
 const release=value as Release|null;
 const tag=typeof release?.tag_name==='string'?release.tag_name:'';
 const version=/^v?(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
 if(!version||release?.draft||release?.prerelease||!Array.isArray(release?.assets))throw new Error('No published release');
 const names=kind==='installer'?['retourenboard-install.sh',`retourenboard-install-${version}.sh`]:kind==='archive'?['retourenboard-linux.tar.gz',`retourenboard-linux-${version}.tar.gz`]:[];
 const name=names.find(candidate=>release.assets!.some(asset=>asset?.name===candidate));
 if(!name)throw new Error('Release asset missing');
 // Build the URL from validated names; never redirect to an arbitrary API-supplied URL.
 return {url:`https://github.com/KaterBeratung/retourenboard/releases/download/${encodeURIComponent(tag)}/${name}`,version};
}

export async function resolveLatestDownload(kind:DownloadKind,request:typeof fetch=fetch):Promise<Download> {
 const response=await request(latestApiUrl,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Release lookup failed');
 return selectReleaseDownload(await response.json(),kind);
}

export function createReleaseDownload({resolve=resolveLatestDownload,navigate,update}:{resolve?:(kind:DownloadKind)=>Promise<Download>;navigate:(url:string)=>void;update:(state:{busy:boolean;message:string})=>void}) {
 let busy=false;
 return async(kind:DownloadKind)=>{
  if(busy)return;
  busy=true;update({busy:true,message:'Neueste Version wird ermittelt …'});
  let url:string,message:string;
  try {url=(await resolve(kind)).url;message='Download wird gestartet.';}
  catch {url=latestReleaseUrl;message='Die Release-Seite wird geöffnet. Dort kannst du das Paket herunterladen.';}
  try {update({busy:false,message});navigate(url);}
  finally {busy=false;}
 };
}
