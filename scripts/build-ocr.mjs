import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const supportedVersion='7.0.0';

function patchWorkerSource(source){
  let patched=source.replaceAll('\r\n','\n');
  function replaceExactly(original,replacement){
    if(patched.split(original).length!==2)throw new Error('Tesseract upstream source changed; review the guarded OCR lifecycle patch before building.');
    patched=patched.replace(original,replacement);
  }
  replaceExactly('  let worker = spawnWorker(options);\n  worker.onerror = workerError;',`  const signal = _options.signal;
  const abortError = () => Object.assign(new Error('OCR worker was aborted'), { name: 'AbortError' });
  if (signal?.aborted) throw abortError();
  let worker = spawnWorker(options);
  worker.onerror = workerError;
  const handleAbort = () => {
    const error = abortError();
    workerResReject(error);
    for (const promiseId of Object.keys(promises)) {
      promises[promiseId].reject(error);
      delete promises[promiseId];
    }
    if (worker !== null) {
      terminateWorker(worker);
      worker = null;
    }
    signal?.removeEventListener('abort', handleAbort);
  };
  signal?.addEventListener('abort', handleAbort, { once: true });
  if (signal?.aborted) {
    handleAbort();
    return workerRes;
  }`);
  replaceExactly('      log(`[${id}]: Start ${jobId}, action=${action}`);',`      if (signal?.aborted || worker === null) {
        reject(abortError());
        return;
      }
      log(\`[\${id}]: Start \${jobId}, action=\${action}\`);`);
  replaceExactly('  const terminate = async () => {\n    if (worker !== null) {',`  const terminate = async () => {
    signal?.removeEventListener('abort', handleAbort);
    if (worker !== null) {`);
  replaceExactly('  onMessage(worker, ({\n    workerId, jobId, status, action, data,\n  }) => {',`  onMessage(worker, ({
    workerId, jobId, status, action, data,
  }) => {
    if (worker === null) return;`);
  replaceExactly('    .catch(() => {});',`    .catch((error) => {
      workerResReject(error);
      terminate();
    });`);
  return patched;
}

/** Rebuild the pinned SDK with lifecycle fixes without altering node_modules. */
export async function buildLocalOcr({root=projectRoot,outfile=join(root,'public/vendor/ocr/tesseract.esm.min.js'),write=true}={}){
  const packageRoot=join(root,'node_modules/tesseract.js');
  const pkg=JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8'));
  if(pkg.version!==supportedVersion)throw new Error(`Local OCR lifecycle patches require Tesseract.js ${supportedVersion}; found ${pkg.version}.`);
  const workerPath=join(packageRoot,'src/createWorker.js');
  const patchedWorker=patchWorkerSource(readFileSync(workerPath,'utf8'));
  return build({
    stdin:{contents:"import Tesseract from 'tesseract.js'; export const {createWorker,createScheduler,recognize,detect,OEM,PSM,languages,setLogging}=Tesseract; export default Tesseract;",resolveDir:root,sourcefile:'local-ocr-entry.js'},
    outfile,write,bundle:true,platform:'browser',format:'esm',target:['es2022','safari15'],minify:true,legalComments:'eof',
    plugins:[{name:'pinned-tesseract-lifecycle',setup(builder){
      builder.onLoad({filter:/[\\/]tesseract\.js[\\/]src[\\/]createWorker\.js$/},args=>args.path===workerPath?{contents:patchedWorker,loader:'js'}:null);
    }}],
  });
}
