import {isIP} from 'node:net';
import type {IncomingMessage} from 'node:http';

export function normalize(value:unknown):string|null{
  if(typeof value!=='string')return null;
  const address=value.trim(),family=isIP(address);
  if(family===4)return address;
  if(family!==6)return null;
  try{
    const canonical=new URL(`http://[${address}]`).hostname.slice(1,-1);
    const mapped=canonical.match(/^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/i);
    if(mapped){const first=parseInt(mapped[1],16),last=parseInt(mapped[2],16);return `${first>>>8}.${first&255}.${last>>>8}.${last&255}`;}
    return canonical;
  }catch{return null;}
}

export function createClientAddress(trustedProxies:string[]=[]){
  if(!Array.isArray(trustedProxies))throw new Error('TRUSTED_PROXIES muss eine Liste einzelner Proxy-IP-Adressen sein.');
  const trusted=new Set(trustedProxies.map(value=>{const address=normalize(value);if(!address)throw new Error('TRUSTED_PROXIES enthält eine ungültige Proxy-IP-Adresse.');return address;}));
  return (req:IncomingMessage):string=>{
    const peer=normalize(req.socket.remoteAddress)??'unknown',forwarded=req.headers['x-forwarded-for'];
    if(!trusted.has(peer)||typeof forwarded!=='string'||forwarded.length>2048)return peer;
    const chain=forwarded.split(',');
    if(chain.length>32)return peer;
    // Walk from the actual socket toward the first untrusted hop. Earlier
    // header entries are client-controlled and cannot identify that client.
    for(let index=chain.length-1;index>=0;index--){
      const address=normalize(chain[index]);
      if(!address)return peer;
      if(!trusted.has(address)||index===0)return address;
    }
    return peer;
  };
}
