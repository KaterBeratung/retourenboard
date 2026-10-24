import {migrationCommand} from '../dist/server/migration/cli.js';
try{const report=await migrationCommand(process.argv.slice(2));console.log(JSON.stringify(report,null,2));}catch(error){console.error(error.message);process.exitCode=1;}
