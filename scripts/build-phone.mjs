import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
const go = process.env.RETRACE_GO || 'go';
mkdirSync('phone-gateway/bin',{recursive:true});
for (const args of [['test','./...'],['build','-trimpath','-ldflags=-s -w -H=windowsgui','-o','bin/phone-gateway.exe','.']]) {
 const result=spawnSync(go,args,{cwd:'phone-gateway',stdio:'inherit',windowsHide:true,env:{...process.env,CGO_ENABLED:'0',GOOS:'windows',GOARCH:'amd64'}});
 if(result.status!==0)process.exit(result.status||1);
}
