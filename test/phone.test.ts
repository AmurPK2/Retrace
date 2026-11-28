
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {request} from 'node:http';
import {phoneJournal} from '../src/core/phone';import {initialBroker,place,close,account} from '../src/core/broker';import {startPhoneServer} from '../electron/phone-server';
test('phone journal uses canonical cash/equity and groups partial closes without counting an open trade as closed',()=>{
 const b=initialBroker(undefined,500),q={t:1000,bid:2000,ask:2001};
 const order={id:'trade',side:'buy' as const,kind:'market' as const,lots:0.02,sl:1990,tp:2030,at:1000,seq:0,thesis:'My trade',tags:['review'],strategy:'test',screenshot:'PRIVATE_IMAGE'};
 place(b,q,order);const pos=b.positions[0];close(b,{...q,t:2000,bid:2010,ask:2011},pos.id,0.01,'Partial');
 const s:any={id:'session',name:'Practice',mode:'training',dataset:'dukascopy',updated:3000,start:1000,tick:{t:3000,bid:2015,ask:2016},broker:b,notes:[{id:'n',text:'Review',cutoff:2000,tags:[]}],journalDraft:'draft',chat:[{text:'PRIVATE_AI'}],drawings:[{script:'PRIVATE_DRAWING'}],layout:{},notebook:{text:'PRIVATE_COURSE'}};
 const before=structuredClone(s),a=account(b,s.tick),v=phoneJournal(s,[],s.id).session!;assert.equal(v.balance,a.balance);assert.equal(v.equity,a.equity);assert.equal(v.floating,a.floating);assert.equal(v.history.length,1);assert.equal(v.history[0].partial,true);assert.equal(v.stats.tradeCount,0);assert.equal(v.notes[0].text,'Review');assert.deepEqual(s,before);assert.ok(!JSON.stringify(v).includes('PRIVATE_'));
 close(b,{...q,t:4000,bid:2020,ask:2021},pos.id,undefined,'Final');const final=phoneJournal({...s,tick:{t:4000,bid:2020,ask:2021}},[],s.id).session!;assert.equal(final.stats.tradeCount,1);assert.equal(final.history.length,1);assert.equal(final.history[0].fills.length,2);assert.equal(final.history[0].partial,false);assert.equal(final.curve.at(-1)!.value,final.balance);assert.equal(final.history[0].net,final.realized);
});
test('phone has a read-only HTTP boundary and serves only its actual lightweight assets',async()=>{
 const assets=mkdtempSync(path.join(tmpdir(),'retrace-journal-'));writeFileSync(path.join(assets,'phone.html'),'journal');writeFileSync(path.join(assets,'phone-icon-192.png'),'0123456789');writeFileSync(path.join(assets,'phone-assets.json'),'[]');
 const origin='https://retrace-phone.test.ts.net',secret='a'.repeat(64);let reads=0;
 const server=await startPhoneServer({assets,secret,origin:()=>origin,journal:async id=>{reads++;return{session:id}}});const address=server.address() as any;
 const send=(url:string,method='GET',headers:any={},body?:string)=>new Promise<any>((resolve,reject)=>{const r=request({host:'127.0.0.1',port:address.port,path:url,method,headers:{host:'retrace-phone.test.ts.net','x-retrace-bridge':secret,...headers}},s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>resolve({status:s.statusCode,body:b,headers:s.headers}))});r.on('error',reject);r.end(body)});
 try{assert.equal((await send('/api/journal','GET',{'x-retrace-bridge':''})).status,403);assert.equal((await send('/api/journal','GET',{host:'evil.test'})).status,403);assert.equal(reads,0);
 const v=await send('/api/journal?session=old-session');assert.equal(v.status,200);assert.equal(JSON.parse(v.body).session,'old-session');assert.equal(v.headers['cache-control'],'no-store');
 for(const type of ['order','ai.ask','play','rrcourse.action','import.start','feed.configure','phone.command'])assert.equal((await send('/api/command','POST',{'Content-Type':'application/json',origin},JSON.stringify({command:{type}}))).status,405);
 for(const url of ['/api/state','/api/command','/../package.json','/assets/../../package.json','/assets/%2e%2e%2fpackage.json','/assets/desktop.js','/assets/guide.mp4','/assets/model.gguf','/phone-assets.json','/bridge.json'])assert.equal((await send(url)).status,404,url);
 const range=await send('/phone-icon-192.png','GET',{range:'bytes=2-5'});assert.equal(range.status,206);assert.equal(range.body,'2345');assert.equal((await send('/phone-icon-192.png','GET',{range:'bytes=50-60'})).status,416);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));rmSync(assets,{recursive:true,force:true})}
});
