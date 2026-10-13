'use client'
import { backendCfg } from './backend'
import { speak } from './voice'
import { useOffice } from '@/store/officeStore'
/** Worker voices: server TTS (gender-matched Gemini/OpenAI voices, real audio → real waveform) with browser TTS as fallback. */
let ctx:AudioContext|null=null
export let outAnalyser:AnalyserNode|null=null
const ac=()=>{ if(!ctx){ctx=new AudioContext();outAnalyser=ctx.createAnalyser();outAnalyser.fftSize=128;outAnalyser.connect(ctx.destination)} if(ctx.state==='suspended')ctx.resume(); return ctx }
let pending=0,chain:Promise<void>=Promise.resolve(),current:AudioBufferSourceNode|null=null,usedServer=false
export const isSpeaking=()=>pending>0
export const lastWasServer=()=>usedServer
async function fetchAudio(emp:any,text:string){ const {url,token}=backendCfg(); const r=await fetch(url+'/api/ai/tts',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({text,emp:emp.id})}); if(!r.ok)throw new Error('tts'); return ac().decodeAudioData(await r.arrayBuffer()) }
export function speakAI(emp:any,text:string,onIdle?:()=>void){
  if(!text.trim())return; const s=useOffice.getState(); pending++
  const pre=s.backend.connected&&s.ai.tts?fetchAudio(emp,text).catch(()=>null):Promise.resolve(null)
  chain=chain.then(async()=>{ try{ const buf=await pre
      if(buf){usedServer=true;await new Promise<void>(res=>{const src=ac().createBufferSource();src.buffer=buf;src.connect(outAnalyser!);src.onended=()=>res();current=src;src.start()})}
      else{usedServer=false;await new Promise<void>(res=>speak(emp,text,res))} }catch{} finally{pending--;if(pending<=0)onIdle?.()} })
}
export function stopAI(){ try{current?.stop()}catch{}; current=null; chain=Promise.resolve(); pending=0; try{speechSynthesis.cancel()}catch{} }
