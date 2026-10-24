import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

// Compile selected source modules in memory so concurrent feature tests do not
// replace the shared runtime build or start the development server.
export async function sourceModule(exports){
  const result=await build({stdin:{contents:exports,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),sourcefile:'test-entry.js'},bundle:true,write:false,platform:'node',format:'esm',target:'node22',packages:'external',external:['/vendor/*'],plugins:[{name:'frontend-shared-build-layout',setup(builder){
    // Resolve this external npm import to a file URL: data: source fixtures have
    // no package-resolution base. Node then loads the QR core and its dependencies.
    builder.onResolve({filter:/^qrcode\/lib\/core\/qrcode\.js$/},args=>({path:import.meta.resolve(args.path),external:true}));
    builder.onResolve({filter:/^\.\.\/shared\//},args=>args.importer.includes('frontend')?{path:fileURLToPath(new URL('../../backend/src/shared/'+args.path.slice('../shared/'.length),import.meta.url))}:null);
  }}]});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text+'\n//# sourceURL=retourenboard-source-test.mjs\n').toString('base64'));
}
