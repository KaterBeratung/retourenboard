import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {renderWebsiteLegal} from './website-legal.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),source=join(root,'website/src'),output=join(root,'website/dist');
const {version}=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(root,'website/tsconfig.json')],{stdio:'inherit'});
mkdirSync(output,{recursive:true});
const banner=readFileSync(join(source,'privacy-banner.html'),'utf8'),legal=JSON.parse(readFileSync(join(root,'website/legal.json'),'utf8'));
for(const name of ['index.html','datenschutz.html','impressum.html']){
 const result=renderWebsiteLegal(readFileSync(join(source,name),'utf8').replaceAll('@@PRIVACY_BANNER@@',banner).replaceAll('@@VERSION@@',version),legal);
 writeFileSync(join(output,name),result.html);
 if(name==='datenschutz.html'&&!result.complete)console.log('Datenschutzhinweise sind ein Entwurf: Betreiber und Hosting in website/legal.json ergänzen.');
}
copyFileSync(join(source,'site.css'),join(output,'site.css'));
copyFileSync(join(root,'public/favicon.svg'),join(output,'favicon.svg'));
copyFileSync(join(root,'public/kofi.avif'),join(output,'kofi.avif'));
const assets=join(source,'assets'),images=readdirSync(assets).filter(name=>/^[a-z][a-z0-9-]*\.webp$/.test(name)).sort();
mkdirSync(join(output,'assets'),{recursive:true});
for(const name of images){if(!lstatSync(join(assets,name)).isFile())throw Error('Website image must be a regular file: '+name);copyFileSync(join(assets,name),join(output,'assets',name));}
writeFileSync(join(output,'assets/asset-manifest.json'),JSON.stringify(images));
await build({entryPoints:[join(source,'main.ts')],outfile:join(output,'site.js'),bundle:true,minify:true,sourcemap:false,target:'es2022',format:'esm'});
console.log(`Produktseite ${version} nach website/dist gebaut.`);
