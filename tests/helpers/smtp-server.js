import {createServer as tlsServer} from 'node:tls';
import {createServer as netServer} from 'node:net';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const fixtureDirectory=process.env.RETOURENBOARD_TEST_SMTP_DIR?resolve(process.env.RETOURENBOARD_TEST_SMTP_DIR):fileURLToPath(new URL('../fixtures/',import.meta.url));
export const ca=readFileSync(join(fixtureDirectory,'smtp-cert.pem'));
const key=readFileSync(join(fixtureDirectory,'smtp-key.pem'));
export async function smtpFixture(t,{tls=true,silent=false}={}){
  const messages=[],sockets=new Set();
  const connect=socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));if(silent)return;socket.write('220 localhost fixture SMTP\r\n');let buffer='',data=false,body='';socket.on('data',bytes=>{buffer+=bytes.toString();for(;;){const end=buffer.indexOf('\r\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(data){if(line==='.') {messages.push(body);body='';data=false;socket.write('250 accepted\r\n');}else body+=line+'\r\n';continue;}if(/^EHLO|HELO/.test(line))socket.write('250-localhost\r\n250 PIPELINING\r\n');else if(/^MAIL FROM|RCPT TO|RSET|NOOP/.test(line))socket.write('250 OK\r\n');else if(line==='DATA'){data=true;socket.write('354 send data\r\n');}else if(line==='QUIT'){socket.end('221 bye\r\n');}else socket.write('500 unsupported\r\n');}});};
  const server=tls?tlsServer({key,cert:ca},connect):netServer(connect);server.on('tlsClientError',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{for(const s of sockets)s.destroy();server.close(r);}));return {port:server.address().port,messages};
}
