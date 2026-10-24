import {fileURLToPath} from 'node:url';
import {selectRuntime} from './runtime-layout.mjs';
const project=new URL('../',import.meta.url),runtime=selectRuntime(fileURLToPath(project));
await import(new URL(runtime.entry,project).href);
