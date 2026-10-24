import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const file of ['build-backend.mjs','build-frontend.mjs','build-website.mjs']) execFileSync(process.execPath,[`scripts/${file}`],{cwd:root,stdio:'inherit'});
