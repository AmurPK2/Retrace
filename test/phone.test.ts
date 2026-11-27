import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { phoneFrame, validatePhoneCommand, phoneState } from '../src/core/phone';
import { startPhoneServer } from '../electron/phone-server';
test('phone command boundary rejects private IPC, stale sessions, stale quotes and concurrent drawing writes',()=>{
 const session:any={id:'demo',broker:{seq:19},drawings:[{id:'a'}]};
 for(const type of ['feed.configure','backup.import','storage.choose','ai.settings','ui','flush','app.exit','phone.start','state','freeze','__proto__'])assert.throws(()=>validatePhoneCommand({command:{type},sessionId:'demo',cursor:19},session));
 assert.throws(()=>validatePhoneCommand({command:{type:'order'},sessionId:'other',cursor:19},session));
 assert.throws(()=>validatePhoneCommand({command:{type:'order'},sessionId:'demo',cursor:18},session));
 assert.throws(()=>validatePhoneCommand({command:{type:'drawings'},sessionId:'demo',cursor:19,baseDrawings:[]},session));
 assert.doesNotThrow(()=>validatePhoneCommand({command:{type:'drawings'},sessionId:'demo',cursor:19,baseDrawings:session.drawings},session));
 for(const tf of ['1m','5m','15m','30m','1H','4H','1D'])assert.equal(phoneFrame(tf),tf);
 for(const tf of ['__proto__','invalid',null,{},'toString'])assert.throws(()=>phoneFrame(tf));
});
test('phone projection strips private paths and never changes desktop layout',()=>{
 const original:any={session:{layout:{timeframe:'15m',range:{from:4,to:90},ranges:{'15m':{from:4,to:90}}},undo:[[]],redo:[[]]},coverage:{marketDirectory:'private',importer:{current:'private',error:'private'}},settings:{url:'private',runtime:'private',previous:{url:'secret'}},diagnostics:{storage:'secret'},ai:{state:'error',message:'C:/private/token'},secondBars:[1]};
 const before=structuredClone(original),v=phoneState(original,'30m');
 assert.deepEqual(original,before);assert.equal(v.session?.layout.timeframe,'30m');assert.equal(v.session?.layout.range,undefined);assert.equal(v.settings.runtime,'');assert.equal(v.coverage.marketDirectory,undefined);assert.ok(!JSON.stringify(v).includes('private'));assert.equal(v.diagnostics.storage,'');
});
test('private phone HTTP enforces bridge, host, origin, method and deduplicates simulator writes',async()=>{
 const assets=mkdtempSync(path.join(tmpdir(),'retrace-phone-'));writeFileSync(path.join(assets,'phone.html'),'phone');writeFileSync(path.join(assets,'phone-icon-192.png'),'0123456789');
 let writes=0;const origin='https://retrace-phone.test.ts.net',secret='a'.repeat(64);
 const server=await startPhoneServer({assets,secret,origin:()=>origin,state:async tf=>({tf}),command:async()=>{writes++;await new Promise(r=>setTimeout(r,15));return writes}});
 const address=server.address() as any;
 const send=(url:string,method='GET',headers:any={},body?:string)=>new Promise<any>((resolve,reject)=>{const r=request({host:'127.0.0.1',port:address.port,path:url,method,headers:{host:'retrace-phone.test.ts.net','x-retrace-bridge':secret,...headers}},s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>resolve({status:s.statusCode,body:b,headers:s.headers}))});r.on('error',reject);r.end(body)});
 try{
  assert.equal((await send('/api/state','GET',{'x-retrace-bridge':''})).status,403);
  assert.equal((await send('/api/state','GET',{host:'evil.test'})).status,403);
  const body=JSON.stringify({requestId:'same-request-000001',command:{type:'order'}});
  assert.equal((await send('/api/command','POST',{'Content-Type':'application/json',origin:'https://evil.test'},body)).status,403);
  const both=await Promise.all([send('/api/command','POST',{'Content-Type':'application/json',origin},body),send('/api/command','POST',{'Content-Type':'application/json',origin},body)]);
  assert.equal(writes,1);assert.deepEqual(both.map(x=>JSON.parse(x.body)),[{result:1},{result:1}]);
  assert.equal((await send('/api/state')).headers['cache-control'],'no-store');
  for(const url of ['/../package.json','/assets/../../package.json','/assets/%2e%2e%2fpackage.json','/index.html','/bridge.json'])assert.equal((await send(url)).status,404,url);
  const range=await send('/phone-icon-192.png','GET',{range:'bytes=2-5'});assert.equal(range.status,206);assert.equal(range.body,'2345');
  assert.equal((await send('/phone-icon-192.png','GET',{range:'bytes=50-60'})).status,416);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));rmSync(assets,{recursive:true,force:true})}
});
