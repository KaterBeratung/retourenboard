import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../website/dist/',import.meta.url));
export function createWebsiteServer(){
 const files=new Map([['/','index.html','text/html; charset=utf-8'],['/index.html','index.html','text/html; charset=utf-8'],['/site.css','site.css','text/css; charset=utf-8'],['/site.js','site.js','text/javascript; charset=utf-8'],['/favicon.svg','favicon.svg','image/svg+xml'],['/kofi.avif','kofi.avif','image/avif']].map(([url,file,type])=>[url,{file:join(output,file),type}]));
 const images=JSON.parse(readFileSync(join(output,'assets/asset-manifest.json'),'utf8'));
 for(const name of ['datenschutz.html','impressum.html'])files.set('/'+name,{file:join(output,name),type:'text/html; charset=utf-8'});
 if(!Array.isArray(images)||images.some(name=>typeof name!=='string'||!/^[a-z][a-z0-9-]*\.webp$/.test(name)))throw Error('Invalid website image manifest');
 for(const name of images)files.set('/assets/'+name,{file:join(output,'assets',name),type:'image/webp'});
 return createServer((req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src https://api.github.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});return res.end();}
  let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400,headers);return res.end();}
  const file=files.get(path);if(!file){res.writeHead(404,headers);return res.end();}
  let data;try{data=readFileSync(file.file);}catch(error){res.writeHead(['ENOENT','ENOTDIR'].includes(error.code)?404:500,headers);return res.end();}
  res.writeHead(200,{...headers,'Content-Type':file.type,'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--port'&&/^\d{1,5}$/.test(args[1])))throw new Error('Aufruf: npm run website:preview -- [--port PORT]');
 const port=args.length?Number(args[1]):3020;if(port>65535)throw new Error('Ungültiger Vorschauport.');
 const server=createWebsiteServer();server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} ist belegt. Bitte einen anderen Vorschauport wählen.`:error.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`Werbeseite: http://127.0.0.1:${server.address().port}`));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeAllConnections();});
}
