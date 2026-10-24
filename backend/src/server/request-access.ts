import type {IncomingMessage} from 'node:http';
import {normalize} from './client-address.js';

function loopback(address:string|null){return address==='::1'||Boolean(address?.startsWith('127.'));}
function privateAddress(address:string|null){
    if(!address)return false;
    if(loopback(address))return true;
    const parts=address.split('.').map(Number);
    if(parts.length===4)return parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31;
    return /^f[cd][0-9a-f]{2}:/.test(address);
}

// A local exception is for a direct connection to this server's private IP,
// never for an arbitrary Host/Origin or an address claimed by proxy headers.
function directLocalOrigin(req:IncomingMessage):string|null {
    if(Object.keys(req.headers).some(name=>name==='forwarded'||name.startsWith('x-forwarded-')))return null;
    const authority=req.headers.host;
    if(typeof authority!=='string'||/[\s\\]/.test(authority))return null;
    let url:URL;
    try{url=new URL('http://'+authority);}catch{return null;}
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;
    const peer=normalize(req.socket.remoteAddress),local=normalize(req.socket.localAddress);
    if(!privateAddress(peer)||!privateAddress(local))return null;
    const host=url.hostname==='localhost'?'localhost':normalize(url.hostname.replace(/^\[|\]$/g,''));
    if((host==='localhost'||loopback(host))&&loopback(peer)&&loopback(local))return url.origin;
    const port=Number(url.port||80);
    return host===local&&port===req.socket.localPort?url.origin:null;
}

export function resolveRequestAccess(req:IncomingMessage,{secureCookies,publicOrigin}:{secureCookies:boolean,publicOrigin:string}) {
    const localOrigin=directLocalOrigin(req);
    const local=Boolean(localOrigin);
    const secure=secureCookies&&!local;
    return {
        local,secure,
        scope:secureCookies?(local?'local':'https'):'standard',
        cookieName:secureCookies?(local?'retouren_local_session':'__Host-retouren_session'):'retouren_session',
        expectedOrigin:localOrigin||publicOrigin||`${secureCookies?'https':'http'}://${req.headers.host}`
    };
}
