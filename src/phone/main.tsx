import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chart, type ChartHandle, type Tool } from '../components/Chart';
import { RRSourceCourse } from '../components/RRSourceCourse';
import { DEFAULT_HTF } from '../core/htf';
import { FRAMES, type AppState, type TF, type ChartRange } from '../types';
import { call, changeFrame, connected } from './bridge';
import '../style.css';
import '../rr-study.css';
import './phone.css';

function PhoneApp(){
 const [state,setState]=useState<AppState|null>(null),[online,setOnline]=useState(false),[tab,setTab]=useState('Chart'),[tool,setTool]=useState<Tool>('select'),[selected,setSelected]=useState<string|null>(null),[issue,setIssue]=useState(''),[busy,setBusy]=useState(false),[sessionMenu,setSessionMenu]=useState(false);
 const [side,setSide]=useState<'buy'|'sell'>('buy'),[lots,setLots]=useState('0.01'),[sl,setSl]=useState(''),[tp,setTp]=useState(''),[question,setQuestion]=useState(''),[answerBusy,setAnswerBusy]=useState(false);
 const [htf,setHTF]=useState({...DEFAULT_HTF,width:30,gap:12});
 const chart=useRef<ChartHandle>(null),ranges=useRef<Record<string,ChartRange>>({});
 useEffect(()=>window.replay.subscribe(setState),[]);useEffect(()=>connected(setOnline),[]);
 const s=state?.session,frame=s?.layout.timeframe??'15m';
 const act=async(c:any)=>{setIssue('');setBusy(true);try{return await call(c)}catch(e){setIssue(String(e));throw e}finally{setBusy(false)}};
 const run=(c:any)=>{void act(c).catch(()=>{})};
 async function ask(){if(!question.trim()||!s)return;setAnswerBusy(true);try{await act({type:'play',value:false});const snap=await call({type:'state'}) as AppState;await act({type:'ai.ask',text:question,cursor:snap.session?.broker.seq,tradeId:'chart',screenshot:await chart.current?.capture(),visibleWindow:chart.current?.visibleWindow()});setQuestion('')}catch{}finally{setAnswerBusy(false)}}
 const shown=s?{...s,layout:{...s.layout,range:ranges.current[s.id+frame]??{from:Math.max(0,state!.bars.length-65),to:state!.bars.length+8,timeframe:frame},htf:{...htf,timeframe:'4H' as TF}}}:null;
 return <div className="phone-app">
  <header className="phone-header"><a className="phone-brand" href="/" aria-label="RETRACE home"><img src="/phone-icon-192.png" alt=""/>RETRACE</a><button onClick={()=>setSessionMenu(!sessionMenu)}>{s?.name??'Sessions'} ▾</button><span className={online?'phone-online':'phone-offline'} aria-live="polite">{online?'PC connected':'Disconnected'}</span></header>
  {!online&&<div className="phone-connection" role="status">Turn on Tailscale. Keep your PC awake with RETRACE phone access open. Controls are paused until connected.</div>}
  {issue&&<div className="phone-error" role="alert">{issue}<button aria-label="Dismiss error" onClick={()=>setIssue('')}>×</button></div>}
  {sessionMenu&&<section className="phone-sessions"><h2>Your sessions</h2><p>Opening a session also switches the active session on your PC.</p>{state?.sessions.map(x=><button key={x.id} disabled={!online||busy} onClick={()=>{run({type:'sessions.continue',id:x.id});setSessionMenu(false)}}>{x.name}<small>{new Date(x.updated).toLocaleString()}</small></button>)}<button disabled={!online||busy} onClick={()=>{run({type:'sessions.new'});setSessionMenu(false)}}>New training session</button></section>}
  <main>
   <section className="phone-chart-page" hidden={tab!=='Chart'&&tab!=='Coach'}>
    <div className="phone-frames" aria-label="Timeframe">{Object.keys(FRAMES).map(tf=><button aria-pressed={frame===tf} key={tf} disabled={!online} onClick={()=>void changeFrame(tf as TF)}>{tf}</button>)}<button aria-label="Reset chart zoom" onClick={()=>chart.current?.fit()}>Fit</button></div>
    <fieldset className="phone-chart-controls" disabled={!online||busy}>
     <div className="phone-tools" aria-label="Drawing tools">{([['select','Move'],['horizontal','Level'],['trend','Line'],['zone','Zone'],['fib','Fib']] as [Tool,string][]).map(([value,label])=><button key={value} aria-pressed={tool===value} onClick={()=>{run({type:'play',value:false});setTool(value)}}>{label}</button>)}<button aria-pressed={htf.enabled} onClick={()=>setHTF({...htf,enabled:!htf.enabled})}>4H</button>{selected&&<button onClick={()=>{run({type:'drawing.remove',id:selected});setSelected(null)}}>Delete</button>}</div>
    </fieldset>
    <div className={'phone-chart '+(!online?'unavailable':'')}>
    {shown&&state?<Chart ref={chart} bars={state.bars} htfBars={state.htfBars} levels={state.levels} session={shown} timeframe={frame} tool={tool} selected={selected} onSelect={setSelected} appearance={state.appearance}
      onDraw={drawings=>{run({type:'drawings',value:drawings});setTool('select')}} onProtect={(id,sl,tp)=>run({type:'position.edit',id,sl,tp})}
      onPendingEdit={(id,changes)=>run({type:'pending.edit',id,changes})} onCancelPending={id=>run({type:'pending.cancel',id})}
      onHTFChange={value=>setHTF({...value,timeframe:'4H'})} onRange={range=>{ranges.current[s!.id+frame]=range}} onLearnHTF={()=>setTab('Learn')}/>:<div className="phone-empty">{online?'Open a saved session or start training.':'Connecting to your PC…'}</div>}
    </div>
    <fieldset className="phone-replay" disabled={!online||busy||!s}><button aria-label={state?.playing?'Pause replay':'Play replay'} onClick={()=>run({type:'play',value:!state?.playing})}>{state?.playing?'Pause':'Play'}</button><button onClick={()=>run({type:'step',kind:'candle'})}>Next {frame} candle</button><select aria-label="Replay speed" value={state?.speed??1} onChange={e=>run({type:'speed',value:Number(e.target.value)})}>{[1,5,10,30,100].map(x=><option key={x} value={x}>{x}×</option>)}</select><time>{s?new Date(s.tick.t).toLocaleString():''}</time></fieldset>
   </section>
   {tab==='Trade'&&<section className="phone-panel"><h1>Practice order</h1><p>Replay simulator · {s?.dataset??'no session'}</p><fieldset disabled={!online||busy||!s}><div className="phone-side"><button aria-pressed={side==='buy'} onClick={()=>setSide('buy')}>Buy · {s?.tick.ask.toFixed(3)}</button><button aria-pressed={side==='sell'} onClick={()=>setSide('sell')}>Sell · {s?.tick.bid.toFixed(3)}</button></div><label>Lot size<input inputMode="decimal" type="number" min="0.01" step="0.01" value={lots} onChange={e=>setLots(e.target.value)}/></label><label>Stop loss price<input inputMode="decimal" type="number" step="any" placeholder="Optional" value={sl} onChange={e=>setSl(e.target.value)}/></label><label>Take profit price<input inputMode="decimal" type="number" step="any" placeholder="Optional" value={tp} onChange={e=>setTp(e.target.value)}/></label><button className="primary" onClick={()=>run({type:'order',cursor:s?.broker.seq,order:{side,kind:'market',lots:Number(lots),sl:sl?Number(sl):undefined,tp:tp?Number(tp):undefined,thesis:'Phone replay practice',tags:[],strategy:s?.notebook.version}})}>Place practice {side}</button></fieldset>
   <h2>Open positions</h2>{s?.broker.positions.length===0&&<p>No open positions.</p>}{s?.broker.positions.map(p=><article className="phone-position" key={p.id}><strong>{p.side.toUpperCase()} {p.lots} lot · {p.entry}</strong><label>SL<input key={p.sl} aria-label={'SL '+p.id} type="number" step="any" defaultValue={p.sl??''} onBlur={e=>{const value=e.target.value?Number(e.target.value):undefined;if(value!==p.sl)run({type:'position.edit',id:p.id,sl:value,tp:p.tp})}} disabled={!online}/></label><label>TP<input key={p.tp} aria-label={'TP '+p.id} type="number" step="any" defaultValue={p.tp??''} onBlur={e=>{const value=e.target.value?Number(e.target.value):undefined;if(value!==p.tp)run({type:'position.edit',id:p.id,sl:p.sl,tp:value})}} disabled={!online}/></label><button disabled={!online||busy} onClick={()=>run({type:'position.close',id:p.id})}>Close practice position</button></article>)}
   <h2>Pending orders</h2>{s?.broker.pending.map(p=><article className="phone-position" key={p.id}>{p.side} {p.kind} · {p.price} · {p.lots} lot<button disabled={!online||busy} onClick={()=>run({type:'pending.cancel',id:p.id})}>Cancel order</button></article>)}</section>}
   {tab==='Coach'&&<section className="phone-panel phone-coach"><h1>Chart coach</h1><p>Uses the chart, drawings, timeframes and local AI on your PC.</p>{state?.ai.state==='error'&&<p>Check the coach on your PC.</p>}{state&&!state.settings.enabled&&<p>Enable the coach on your PC first.</p>}{s?.chat.map((m:any)=><article key={m.id} className={'phone-message '+m.role}><strong>{m.role==='user'?'You':'Coach'}</strong><p>{m.text??m.content}</p></article>)}<label>Your question<textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Explain what is confirmed and what is missing in my setup."/></label><button className="primary" disabled={!online||busy||answerBusy||!state?.settings.enabled||!question.trim()} onClick={()=>void ask()}>{answerBusy?'Reviewing chart…':'Ask about this chart'}</button><small>Experimental feedback. Check each claim against the candles and RR source lesson.</small></section>}
   {tab==='Learn'&&<section className="phone-panel phone-learn"><h1>RR · see it, practise it</h1><p>Interactive tasks from the original recordings. The same progress is saved on your PC.</p>{online?<RRSourceCourse call={call}/>:<p>Reconnect to open and save your lessons.</p>}</section>}
   {tab==='Journal'&&<section className="phone-panel"><h1>Replay journal</h1><p>Balance {s?.broker.balance.toFixed(2)} · {s?.broker.fills.length??0} closed trades</p>{s?.broker.fills.slice().reverse().map(f=><article className="phone-position" key={f.id}><strong>{f.side.toUpperCase()} · {f.lots} lot · {f.net.toFixed(2)}</strong><p>Entry {f.entry} → exit {f.exit} · {f.reason}</p>{f.thesis&&<p>{f.thesis}</p>}</article>)}<details><summary>Install on your phone</summary><p>iPhone: Safari → Share → Add to Home Screen. Android: browser menu → Install app. Keep Tailscale connected and the PC awake with RETRACE open.</p><p>Your chart zoom stays local to this phone. Replay time, orders, drawings and lesson progress are shared with the PC.</p></details></section>}
  </main>
  <nav className="phone-nav" aria-label="Main navigation">{['Chart','Trade','Coach','Learn','Journal'].map(x=><button key={x} aria-current={tab===x?'page':undefined} onClick={()=>setTab(x)}>{x}</button>)}</nav>
 </div>
}
createRoot(document.getElementById('root')!).render(<PhoneApp/>);
if('serviceWorker' in navigator)void navigator.serviceWorker.register('/phone-sw.js').catch(()=>{});
