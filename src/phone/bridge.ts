import { lessonSource } from '../core/rr-lessons';
import type { AppState, Command, TF } from '../types';
let current: AppState | null = null;
let timeframe: TF = (localStorage.getItem('retrace.phone.frame') as TF) || '15m';
let online = false, fetching = false;
const states = new Set<(s:AppState)=>void>(), connections=new Set<(v:boolean)=>void>();
export function connected(fn:(v:boolean)=>void) { connections.add(fn); fn(online); return()=>{connections.delete(fn)}; }
function connection(value:boolean){if(online!==value){online=value;for(const fn of connections)fn(value)}}
export async function refresh() {
  if(fetching)return; fetching=true;
  try {
    const res=await fetch(`/api/state?timeframe=${timeframe}`,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw Error('Connection unavailable.');
    const s=await res.json();if(!s || !('session' in s))throw Error('Invalid state.');
    current=s;connection(true);for(const fn of states)fn(s);
  }catch{connection(false)}finally{fetching=false}
}
export async function changeFrame(value:TF){timeframe=value;localStorage.setItem('retrace.phone.frame',value);await refresh()}
export async function call(command:Command) {
  if(command.type==='study.source'){window.open(lessonSource(String(command.lesson),Number(command.index)), '_blank', 'noopener,noreferrer');return}
  if(command.type==='state'){await refresh();if(!online)throw Error('Reconnect to your PC.');return current}
  if(!online)throw Error('Reconnect to your PC before continuing.');
  const session=current?.session;
  try {
    const response=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({command:['step','ai.ask'].includes(command.type)?{...command,timeframe}:command,sessionId:session?.id??null,cursor:session?.broker.seq,
        baseDrawings:command.type==='drawings'?session?.drawings:undefined,requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(290000)});
    const value=await response.json();if(!response.ok||value.error)throw Error(value.error||'Request failed.');
    await refresh();return value.result;
  }catch(error){await refresh();throw error}
}
window.replay={call,subscribe:fn=>{states.add(fn);if(current)fn(current);return()=>{states.delete(fn)}},onFeed:()=>()=>{},onAI:()=>()=>{},flush:()=>{}};
setInterval(()=>{if(document.visibilityState==='visible')void refresh()},1500);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh();else connection(false)});
window.addEventListener('online',()=>void refresh());window.addEventListener('offline',()=>connection(false));
void refresh();
