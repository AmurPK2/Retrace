import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(), lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
let out='RETRACE — third-party notices\n\nLightweight Charts is a rendering library by TradingView, Inc. The application retains its chart attribution. Electron includes its own license and Chromium notices in the Windows distribution.\n';
for(const [relative,info]of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
 if(!relative||info.dev||!relative.includes('node_modules/'))continue;
 const folder=path.join(root,relative);if(!fs.existsSync(path.join(folder,'package.json')))continue;
 const pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));out+='\n===== '+pkg.name+' '+pkg.version+' ('+(pkg.license??'see publisher')+') =====\n';
 for(const file of fs.readdirSync(folder).filter(n=>/^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(n))){const full=path.join(folder,file);if(fs.statSync(full).isFile())out+='\n'+fs.readFileSync(full,'utf8')+'\n';}
}
out+='\nThe separately downloaded Qwen3.5-4B model is published under Apache-2.0. The official llama.cpp runtime is MIT licensed. Model weights and price datasets are not redistributed in this app archive. Historical quotes are downloaded from the data provider for each user; its terms apply.\n';
if(fs.existsSync('assets/TRADINGVIEW_NOTICE.txt'))out+='\n'+fs.readFileSync('assets/TRADINGVIEW_NOTICE.txt','utf8');
fs.writeFileSync('THIRD_PARTY_NOTICES.txt',out);
console.log('Generated production dependency notices:',out.length,'characters');
