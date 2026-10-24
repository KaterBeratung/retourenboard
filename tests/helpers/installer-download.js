import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const unix=path=>path.replaceAll('\\','/');
export function downloadFixture(t,{archivePath,tag='v9.9.99',alias=false,corrupt=false,missing=false,latestUrl,checksumText}={}){
 const dir=mkdtempSync(join(tmpdir(),'retourenboard-download-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bin=join(dir,'bin'),payload=join(dir,'payload'),scratch=join(dir,'scratch');mkdirSync(bin);mkdirSync(payload);mkdirSync(scratch);mkdirSync(join(payload,'scripts'));
 const result=join(dir,'installed-args'),requests=join(dir,'requests');
 writeFileSync(join(payload,'package.json'),JSON.stringify({version:tag.replace(/^v/,'')})+'\n');
 writeFileSync(join(payload,'scripts/install-linux.sh'),'#!/usr/bin/env bash\nset -euo pipefail\nif [[ -n "${TEST_OPTIONS_SCRIPT:-}" ]]; then usage(){ :; }; source "$TEST_OPTIONS_SCRIPT"; parse_install_options "$@"; printf "MODE=%s\\nLAN=%s\\nDOMAIN=%s\\nPORT=%s\\n" "$mode" "$lan" "$domain" "$port"; fi\nprintf "%s\\n" "$@" > "$TEST_RESULT"\n', {mode:0o700});
 const archive=archivePath??join(dir,'remote.tar.gz');if(!archivePath)execFileSync('tar',['-czf','remote.tar.gz','-C','payload','package.json','scripts'],{cwd:dir});
 const name=alias?'retourenboard-linux.tar.gz':`retourenboard-linux-${tag.replace(/^v/,'')}.tar.gz`;
 const digest=corrupt?'0'.repeat(64):createHash('sha256').update(readFileSync(archive)).digest('hex');
 const checksum=join(dir,'checksum');writeFileSync(checksum,checksumText??`${digest}  ${name}\n`);
 // Only the external transport is replaced. The generated installer runs its
 // real release selection, hashing, archive validation, extraction and child.
 writeFileSync(join(bin,'curl'),`#!/usr/bin/env bash
set -euo pipefail
output=''; url=''
while (($#)); do
 case "$1" in
  --output|-o) output="$2"; shift 2;;
  --write-out|-w|--proto|--proto-redir|--tlsv1.2|--retry|--connect-timeout|--max-time|--header|-H) shift 2;;
  https://*) url="$1"; shift;;
  *) shift;;
 esac
done
printf '%s\\n' "$url" >> "$TEST_REQUESTS"
case "$url" in
 https://github.com/KaterBeratung/retourenboard/releases/latest) printf '%s' "$TEST_LATEST_URL";;
 "$TEST_ASSET_URL") [[ "$TEST_MISSING" != true ]] || exit 22; cp "$TEST_ARCHIVE" "$output";;
 "$TEST_ASSET_URL.sha256") cp "$TEST_CHECKSUM" "$output";;
 *) exit 22;;
esac
`,{mode:0o700});
 const boundary=join(dir,'transport.sh');writeFileSync(boundary,'curl() { bash "$TEST_CURL" "$@"; }; export -f curl\n');
 const env={...process.env,BASH_ENV:unix(boundary),TEST_CURL:unix(join(bin,'curl')),TMPDIR:unix(scratch),TEST_ARCHIVE:unix(archive),TEST_CHECKSUM:unix(checksum),TEST_RESULT:unix(result),TEST_REQUESTS:unix(requests),TEST_MISSING:String(missing),TEST_LATEST_URL:latestUrl??`https://github.com/KaterBeratung/retourenboard/releases/tag/${tag}`,TEST_ASSET_URL:`https://github.com/KaterBeratung/retourenboard/releases/download/${tag}/${name}`};
 return {dir,result,requests,scratch,env,run:(script,args=[],extra={},options={})=>execFileSync('bash',[unix(script),...args],{encoding:'utf8',timeout:15000,cwd:options.cwd,env:{...env,...extra}})};
}
