import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync,lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRuntime } from './runtime-layout.mjs';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
const packageEntries = ['package.json', 'README.md', '.env.example', '.dockerignore', 'Dockerfile', 'server', 'shared', 'public', 'scripts', 'deploy', 'tests'];

function checkPackageEntry(sourceDir, entry) {
  const info = lstatSync(join(sourceDir, entry));
  if (info.isSymbolicLink()) throw new Error(`Symbolic links cannot be included in an installation package: ${entry}`);
  if (/(^|[\\/])(\.env|data|\.qa|node_modules)([\\/]|$)|\.(sqlite|sqlite-shm|sqlite-wal)$/.test(entry)) {
    throw new Error(`Private runtime data cannot be packaged: ${entry}`);
  }
  if (info.isDirectory()) {
    for (const name of readdirSync(join(sourceDir, entry))) checkPackageEntry(sourceDir, join(entry, name));
  }
}

function programArchive(sourceDir){
  checkPackageEntry(sourceDir,'LICENSE');
  const entries=[...packageEntries];
  for(const doc of ['IN-APP-UPDATES.md','POSTGRESQL.md','DISPOSAL.md','RETURN-WORKFLOW.md','SSO.md','BETRIEB.md','DOCKER.md','readme'])if(existsSync(join(sourceDir,'docs',doc)))entries.push('docs/'+doc);
  for(const entry of entries)checkPackageEntry(sourceDir,entry);
  if(readdirSync(sourceDir).includes('dist')){checkPackageEntry(sourceDir,'dist');entries.push('dist');}
  if(readdirSync(sourceDir).includes('previews')){checkPackageEntry(sourceDir,'previews');entries.push('previews');}
  for(const entry of ['frontend','backend','website','package-lock.json'])if(readdirSync(sourceDir).includes(entry)){checkPackageEntry(sourceDir,entry);entries.push(entry);}
  const {version}=selectRuntime(sourceDir);
  const temporaryDir=mkdtempSync(join(tmpdir(),'retourenboard-build-'));
  try{
    const staging=join(temporaryDir,'app');mkdirSync(staging);
    // Git on Windows may check out CRLF. Normalize executable shell sources in
    // the package without modifying the developer's working tree.
    function normalize(path){if(lstatSync(path).isDirectory()){for(const name of readdirSync(path))normalize(join(path,name));}else if(path.endsWith('.sh'))writeFileSync(path,readFileSync(path,'utf8').replace(/\r\n/g,'\n'));}
    for(const entry of entries){const destination=join(staging,entry);mkdirSync(dirname(destination),{recursive:true});cpSync(join(sourceDir,entry),destination,{recursive:true});normalize(destination);}
    // Keep the license under an archive root accepted by existing updaters.
    const license='docs/readme/LICENSE',licenseTarget=join(staging,license);
    mkdirSync(dirname(licenseTarget),{recursive:true});cpSync(join(sourceDir,'LICENSE'),licenseTarget);
    if(!entries.includes('docs/readme'))entries.push(license);
    const path=join(temporaryDir,'package.tar.gz');execFileSync('tar',['-czf',path,'-C',staging,'--',...entries],{stdio:'pipe'});return {archive:readFileSync(path),version};
  }
  finally{rmSync(temporaryDir,{recursive:true,force:true});}
}

function installerText(sourceDir){
  const header=readFileSync(join(sourceDir,'deploy/installer-header.sh'),'utf8').replace(/\r\n/g,'\n');
  return `${header.trimEnd()}\n`;
}

export function buildLinuxInstaller({ sourceDir = projectDir, outputPath = join(projectDir, 'releases/latest/retourenboard-install.sh') } = {}) {
  sourceDir = resolve(sourceDir); outputPath = resolve(outputPath);
  mkdirSync(dirname(outputPath),{recursive:true});
  writeFileSync(outputPath,installerText(sourceDir),{mode:0o700});return outputPath;
}

export function buildLinuxPackages({sourceDir=projectDir,outputDir=join(projectDir,'releases')}={}){
  sourceDir=resolve(sourceDir);outputDir=resolve(outputDir);const {archive,version}=programArchive(sourceDir);
  mkdirSync(outputDir,{recursive:true});const installer=Buffer.from(installerText(sourceDir));
  const files=[{folder:version,name:`retourenboard-install-${version}.sh`,data:installer},{folder:version,name:`retourenboard-linux-${version}.tar.gz`,data:archive},{folder:'latest',name:'retourenboard-install.sh',data:installer},{folder:'latest',name:'retourenboard-linux.tar.gz',data:archive}];
  const manifest={version,files:[]};
  for(const {folder,name,data}of files){
    const path=`${folder}/${name}`,target=join(outputDir,path),sha256=createHash('sha256').update(data).digest('hex');
    mkdirSync(dirname(target),{recursive:true});
    writeFileSync(target,data,{mode:name.endsWith('.sh')?0o700:0o600});
    writeFileSync(target+'.sha256',`${sha256}  ${name}\n`);
    manifest.files.push({name,path,sha256});
  }
  writeFileSync(join(outputDir,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('Usage: node scripts/build-linux-installer.mjs [output-file]');
  if(process.argv[2])console.log(`Installationsdatei erstellt: ${buildLinuxInstaller({outputPath:process.argv[2]})}`);
  else{const manifest=buildLinuxPackages();console.log(`Linuxpakete ${manifest.version} erstellt: ${manifest.files.map(file=>'releases/'+file.path).join(', ')}. PrÃƒÂ¼fsummen und releases/release-manifest.json aktualisiert.`);}
}
