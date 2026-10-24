import {lstatSync,realpathSync} from 'node:fs';
import {basename,dirname,isAbsolute,relative,resolve,win32} from 'node:path';
import {InputError} from '../shared/model.js';

// Database filenames are untrusted, including in previously imported databases.
// Keep historical basenames usable, but reject path syntax on both platforms.
export function assertStoredName(name:unknown):asserts name is string{
 if(typeof name!=='string'||!name||name.length>250||name==='.'||name==='..'||/[\x00-\x1f\x7f/\\:<>"|?*]/.test(name)||/[.\s]$/.test(name)||basename(name)!==name||win32.basename(name)!==name||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new InputError('Ungültiger Dateiname im Datenspeicher.');
}
export function storedFilePath(folder:string,name:unknown,{mustExist=false}:{mustExist?:boolean}={}):string{
 assertStoredName(name);const root=resolve(folder),path=resolve(root,name),rel=relative(root,path);
 if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+win32.sep)||rel.startsWith('../'))throw new InputError('Ungültiger Dateipfad im Datenspeicher.');
 let existing=root;
 for(;;){try{const s=lstatSync(existing);if(!s.isDirectory()||s.isSymbolicLink()||relative(realpathSync(existing),existing)!=='')throw new InputError('Ungültiger Dateipfad im Datenspeicher.');break;}catch(error:any){if(error.code!=='ENOENT'||mustExist)throw error;const parent=dirname(existing);if(parent===existing)throw error;existing=parent;}}
 try{const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())throw new InputError('Ungültiger Dateipfad im Datenspeicher.');}catch(error:any){if(error.code!=='ENOENT'||mustExist)throw error;}
 return path;
}
