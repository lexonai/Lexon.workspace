// Browser voice layer: gender-matched TTS per employee + speech recognition. Text fallback is always available.
const FEMALE=/female|zira|samantha|heera|susan|hazel|aria|jenny|swara|priya|neerja|veena|karen|moira|tessa|fiona|google.*(uk english female|hindi)/i
const MALE=/\bmale\b|david|mark|ravi|hemant|guy|james|prabhat|daniel|alex|fred|rishi|google uk english male/i
export function pickVoice(emp:any){
  if(typeof window==='undefined'||!('speechSynthesis' in window))return undefined
  const vs=speechSynthesis.getVoices().filter(v=>/^(en|hi)/i.test(v.lang)); if(!vs.length)return undefined
  const want=emp?.gender==='female'?FEMALE:MALE, other=emp?.gender==='female'?MALE:FEMALE
  const pool=vs.filter(v=>want.test(v.name)&&!other.test(v.name)); const list=pool.length?pool:vs.filter(v=>!other.test(v.name)); const l=list.length?list:vs
  let h=0; for(const c of emp?.id||'')h=(h*31+c.charCodeAt(0))>>>0
  return l[h%l.length]
}
export function speak(emp:any,text:string,onEnd?:()=>void){
  if(typeof window==='undefined'||!('speechSynthesis' in window))return
  const u=new SpeechSynthesisUtterance(text.slice(0,600)); const v=pickVoice(emp); if(v)u.voice=v
  u.pitch=emp?.voice?.pitch??1; u.rate=emp?.voice?.rate??1; u.lang=/[\u0900-\u097F]/.test(text)?'hi-IN':(v?.lang||'en-IN'); if(onEnd){u.onend=onEnd;u.onerror=onEnd}; speechSynthesis.speak(u)
}
export const stopSpeaking=()=>{ if(typeof window!=='undefined'&&'speechSynthesis' in window)speechSynthesis.cancel() }
export async function micStream():Promise<MediaStream|null>{ try{return await navigator.mediaDevices.getUserMedia({audio:true})}catch{return null} }
export function listen(onText:(t:string)=>void,lang='hi-IN'){
  const R=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition; if(!R)return null
  const r=new R(); r.lang=lang; r.continuous=true; r.interimResults=false; let on=true
  r.onresult=(e:any)=>{const t=e.results[e.results.length-1][0].transcript.trim(); if(t)onText(t)}
  r.onend=()=>{ if(on){try{r.start()}catch{}} }; try{r.start()}catch{}
  return { stop:()=>{on=false;try{r.stop()}catch{}} }
}
