import {spawn} from 'node:child_process';
const index=process.argv.indexOf('--port');const port=index>=0?process.argv[index+1]:'8888';
const child=spawn(process.execPath,['node_modules/netlify-cli/bin/run.js','dev','--offline','--framework','#static','--dir','public','--functions','netlify/functions','--port',port,'--no-open'],{stdio:'inherit',env:process.env});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
