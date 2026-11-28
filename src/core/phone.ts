import { instrumentForDataset } from './instruments';
import type { Session } from '../types';
import { account, cash, pnl, tradeStatistics } from './broker';

export function phoneJournal(s: Session | null, sessions: {id:string;name:string;updated:number;mode:string}[], activeId: string | null) {
  if (!s) return { session:null, sessions, activeId, updated:Date.now() };
  const b=s.broker, a=account(b,s.tick), groups=new Map<string,typeof b.fills>();
  for(const fill of b.fills) groups.set(fill.positionId,[...(groups.get(fill.positionId)??[]),fill]);
  const history=[...groups].map(([id,rows])=>{
    const lots=rows.reduce((n,f)=>n+f.lots,0),first=rows[0],last=rows.at(-1)!;
    const risk=rows.every(f=>f.initialRisk!==null)?cash(rows.reduce((n,f)=>n+f.initialRisk!,0)):null;
    const net=cash(rows.reduce((n,f)=>n+f.net,0));
    return {id,side:first.side,entry:first.entry,exit:rows.reduce((n,f)=>n+f.exit*f.lots,0)/lots,lots,
      opened:first.opened,closed:last.closed,net,r:risk?net/risk:null,partial:b.positions.some(pos=>pos.id===id),
      sl:first.initialSl,tp:first.initialTp,thesis:first.thesis,tags:first.tags,
      fills:rows.map(f=>({at:f.closed,lots:f.lots,price:f.exit,net:f.net,reason:f.reason}))};
  }).sort((x,y)=>y.closed-x.closed);
  let running=b.initialBalance??cash(b.balance-b.fills.reduce((n,f)=>n+f.net,0));
  const startingBalance=running;
  const curve=[{at:s.start,value:running},...[...b.fills].sort((x,y)=>x.closed-y.closed).map(f=>({at:f.closed,value:running=cash(running+f.net)}))];
  return {updated:Date.now(),activeId,sessions,session:{id:s.id,name:s.name,dataset:instrumentForDataset(s.dataset),mode:s.mode,
    currency:b.specs.currency??'USD',replayAt:s.tick.t,savedAt:s.updated,startingBalance,...a,
    realized:cash(b.fills.reduce((n,f)=>n+f.net,0)),maxDrawdown:b.maxDrawdown,
    stats:tradeStatistics(b.fills,b.positions.map(pos=>pos.id)),curve,history,
    positions:b.positions.map(pos=>({id:pos.id,side:pos.side,lots:pos.lots,entry:pos.entry,opened:pos.opened,sl:pos.sl,tp:pos.tp,
      floating:cash(pnl(pos.side,pos.entry,pos.side==='buy'?s.tick.bid:s.tick.ask,pos.lots,b.specs.contract)-pos.swap),thesis:pos.thesis,tags:pos.tags})),
    pending:b.pending.map(order=>({id:order.id,side:order.side,kind:order.kind,lots:order.lots,price:order.price,sl:order.sl,tp:order.tp})),
    notes:s.notes.map(note=>({id:note.id,text:note.text,at:note.cutoff,tags:note.tags})),journalDraft:s.journalDraft??''}};
}
export type PhoneJournal=ReturnType<typeof phoneJournal>;
