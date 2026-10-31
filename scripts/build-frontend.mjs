import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import {createHash} from 'node:crypto';
import {buildLocalOcr} from './build-ocr.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = join(root, 'node_modules/typescript/bin/tsc');
if (!existsSync(compiler)) throw new Error('TypeScript fehlt. Für die Entwicklung zuerst npm ci ausführen. Der normale Start benötigt keinen Compiler.');
const output = join(root, 'dist/public');
mkdirSync(output, { recursive: true });
await buildLocalOcr({root});
const ocrManifestPath=join(root,'public/vendor/ocr/packages.json'),ocrManifest=JSON.parse(readFileSync(ocrManifestPath,'utf8'));
ocrManifest.files['tesseract.esm.min.js']=createHash('sha256').update(readFileSync(join(root,'public/vendor/ocr/tesseract.esm.min.js'))).digest('hex');
ocrManifest.patches=['Reject and terminate failed initialization','AbortSignal stops pending initialization and recognition'];
writeFileSync(ocrManifestPath,JSON.stringify(ocrManifest,null,2)+'\n');
for (const file of ['styles.css','theme.css','favicon.svg','kofi.avif']) copyFileSync(join(root,'public',file),join(output,file));
cpSync(join(root,'public/vendor'),join(output,'vendor'),{recursive:true});
execFileSync(process.execPath, [compiler, '-p', join(root, 'frontend/tsconfig.json')], { cwd: root, stdio: 'inherit' });
for (const file of ['customer-status.html','customer-status.css','error.html','error.css','index.html', 'admin.html','account.html','login.html','settings.css', 'design.css', 'motion.css','chat.css','switches.css','workspace-tools.css','workflow.css','workspace-refinements.css','workspace-insights.css','scan-labels.css','return-labels.css','return-drafts.css','workspace-personalization.css','scan-intake.css','inventory-polish.css','disposals.css']) {
  copyFileSync(join(root, 'frontend/assets', file), join(output, file));
}
// Scanner dependencies are bundled locally; application state stays in its
// original modules so language/authentication handling is shared with the app.
const scanner=await build({entryPoints:[join(root,'frontend/src/scan-labels.ts')],outfile:join(output,'scan-labels.js'),bundle:true,metafile:true,platform:'browser',format:'esm',minify:true,target:['es2022','safari15'],external:['./i18n.js','./ui.js','./auth-context.js','./return-labels.js','/vendor/*'],legalComments:'eof'});
await build({entryPoints:[join(root,'frontend/src/barcode-image.ts')],outfile:join(output,'barcode-image.js'),bundle:true,platform:'browser',format:'esm',minify:true,target:['es2022','safari15'],legalComments:'eof'});
await build({entryPoints:[join(root,'frontend/src/label-identifiers.ts')],outfile:join(output,'label-identifiers.js'),bundle:true,platform:'browser',format:'esm',minify:true,target:['es2022','safari15'],external:['./i18n.js','./ui.js'],legalComments:'eof'});
const licenseDir=join(output,'vendor/scanner-licenses');mkdirSync(licenseDir,{recursive:true});
const packages={};
const bundled=new Set(Object.keys(scanner.metafile.inputs).flatMap(input=>{
  const normalized=input.replaceAll('\\','/'),matches=[...normalized.matchAll(/node_modules\/(?:@[^/]+\/)?[^/]+/g)],last=matches.at(-1);
  return last?[normalized.slice(0,last.index+last[0].length)]:[];
}));
for(const packagePath of bundled){
  const dir=join(root,packagePath),pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  const licenseFile=readdirSync(dir).find(file=>/^licen[cs]e(?:[.-].*)?$/i.test(file));
  if(!licenseFile)throw new Error(`Scanner-Lizenz fehlt: ${pkg.name}`);
  copyFileSync(join(dir,licenseFile),join(licenseDir,`${pkg.name.replaceAll('/','-')}.txt`));
  packages[pkg.name]={version:pkg.version,license:pkg.license};
}
writeFileSync(join(licenseDir,'packages.json'),JSON.stringify(packages,null,2)+'\n');
console.log('TypeScript-Oberfläche nach dist/public gebaut.');
