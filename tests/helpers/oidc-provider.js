import {createServer} from 'node:http';
import {generateKeyPairSync,randomUUID,sign,createHash} from 'node:crypto';

// A protocol fixture, not an authentication bypass: PKCE, one-use codes, client
// authentication and real RSA-signed JWTs are checked by the application client.
export async function oidcProvider(t){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'},codes=new Map();
 const state={subject:'employee-1',name:'Example Employee',email:'employee@example.test',claims:{},badSignature:false};
 let issuer;
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,issuer);const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname==='/tenant/.well-known/openid-configuration')return json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_basic','client_secret_post'],code_challenge_methods_supported:['S256']});
  if(url.pathname==='/tenant/jwks')return json({keys:[jwk]});
  if(url.pathname==='/tenant/authorize'){
   const code=randomUUID();codes.set(code,Object.fromEntries(url.searchParams));const redirect=new URL(url.searchParams.get('redirect_uri'));redirect.searchParams.set('code',code);redirect.searchParams.set('state',url.searchParams.get('state'));res.writeHead(302,{Location:redirect.href});return res.end();
  }
  if(url.pathname==='/tenant/token'){
   let body='';for await(const chunk of req)body+=chunk;const p=new URLSearchParams(body),grant=codes.get(p.get('code'));codes.delete(p.get('code'));
   const parts=Buffer.from(String(req.headers.authorization??'').slice(6),'base64').toString().split(':').map(part=>decodeURIComponent(part.replaceAll('+',' ')));
   const basic=state.authMethod!=='client_secret_post'&&/^Basic /.test(String(req.headers.authorization??''))&&parts[0]==='test-client'&&parts[1]==='server-secret';
   const post=state.authMethod!=='client_secret_basic'&&!req.headers.authorization&&p.get('client_id')==='test-client'&&p.get('client_secret')==='server-secret';
   if(!grant||!basic&&!post||p.get('redirect_uri')!==grant.redirect_uri||createHash('sha256').update(p.get('code_verifier')??'').digest('base64url')!==grant.code_challenge)return json({error:'invalid_grant'},400);
   const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url'),payload=Buffer.from(JSON.stringify({iss:issuer,sub:state.subject,aud:'test-client',iat:now,exp:now+300,nonce:grant.nonce,name:state.name,email:state.email,...state.claims})).toString('base64url'),data=header+'.'+payload;
   const signature=state.badSignature?Buffer.alloc(256):sign('RSA-SHA256',Buffer.from(data),privateKey);
   return json({access_token:'unused-access-token',token_type:'Bearer',expires_in:300,id_token:data+'.'+signature.toString('base64url')});
  }
  return json({error:'not_found'},404);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));issuer=`http://127.0.0.1:${server.address().port}/tenant`;
 t?.after(()=>new Promise(r=>server.close(r)));
 return {issuer,state,close:()=>new Promise(r=>server.close(r)),authorize:async authorizationUrl=>{const response=await fetch(authorizationUrl,{redirect:'manual'});return new URL(response.headers.get('location'));}};
}
