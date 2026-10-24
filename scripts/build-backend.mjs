import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p',join(root,'backend/tsconfig.json')],{cwd:root,stdio:'inherit'});
const result=await build({entryPoints:['totp','qr','smtp','archive','postgres','oidc'].map(n=>join(root,`backend/src/vendor/${n}.ts`)),outdir:join(root,'dist/vendor'),bundle:true,metafile:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);"},legalComments:'eof'});
mkdirSync(join(root,'dist/vendor/licenses'),{recursive:true});
const licenses={};
const bundled=new Set(Object.keys(result.metafile.inputs).flatMap(input=>{
  const matches=[...input.replaceAll('\\','/').matchAll(/node_modules\/(?:@[^/]+\/)?[^/]+/g)];
  const last=matches.at(-1);return last?[input.replaceAll('\\','/').slice(0,last.index+last[0].length)]:[];
}));
for(const packagePath of bundled){
  const dir=join(root,packagePath), pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8')),name=pkg.name;
  const licenseFile=readdirSync(dir).find(file=>/^licen[cs]e(?:[.-].*)?$/i.test(file));
  const readmeFile=!licenseFile&&readdirSync(dir).find(file=>/^readme\.md$/i.test(file));
  const inlineLicense=readmeFile?readFileSync(join(dir,readmeFile),'utf8').match(/^##\s+license\s*\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/im)?.[1]:undefined;
  const license=licenseFile?readFileSync(join(dir,licenseFile),'utf8'):pkg.license==='MIT'&&inlineLicense?.includes('Permission is hereby granted')&&inlineLicense.includes('THE SOFTWARE IS PROVIDED')?inlineLicense:undefined;
  if(!license) throw new Error(`Lizenz fehlt: ${name}`);
  licenses[name]={version:pkg.version,license:pkg.license};
  writeFileSync(join(root,`dist/vendor/licenses/${name.replaceAll('/','-')}.txt`),license);
}
writeFileSync(join(root,'dist/vendor/licenses/packages.json'),JSON.stringify(licenses,null,2)+'\n');
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
writeFileSync(join(root,'dist/package.json'),JSON.stringify({name:pkg.name,version:pkg.version,type:'module',engines:pkg.engines,retourenboard:{database:'postgresql',schema:1}},null,2)+'\n');
console.log('Server und eigenständige Bibliotheks-Bundles gebaut.');
