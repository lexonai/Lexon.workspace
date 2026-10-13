'use client'
import { backendCfg } from './backend'
/** Voice-activity recorder: captures each spoken utterance (starts on voice, ends after ~0.9 s of silence) → blob. Works in Electron/any browser (no Google speech service needed). */
export async function startVAD(onUtterance:(b:Blob)=>void){
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}})
  const ctx=new AudioContext(),src=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser(); analyser.fftSize=1024; src.connect(analyser)
  const data=new Uint8Array(analyser.fftSize),mime=['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(m=>MediaRecorder.isTypeSupported(m))||''
  let floor=0.01,rec:MediaRecorder|null=null,chunks:Blob[]=[],last=0,start=0,paused=false,stopped=false
  const iv=setInterval(()=>{
    analyser.getByteTimeDomainData(data); let s=0; for(const v of data){const x=(v-128)/128;s+=x*x}; const rms=Math.sqrt(s/data.length); const now=Date.now()
    if(paused||stopped)return
    floor=Math.min(0.05,floor*0.995+rms*0.005); const thr=Math.max(0.03,floor*2.6)
    if(rms>thr){ last=now; if(!rec){ chunks=[]; const r=new MediaRecorder(stream,mime?{mimeType:mime}:undefined); rec=r; r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}; r.onstop=()=>{const dur=Date.now()-start;rec=null;if(dur>600&&chunks.length&&!paused&&!stopped)onUtterance(new Blob(chunks,{type:r.mimeType||'audio/webm'}))}; start=now; r.start() } }
    else if(rec&&rec.state==='recording'&&now-last>900&&now-start>700)rec.stop()
  },60)
  return { analyser, pause(b:boolean){paused=b;if(b&&rec&&rec.state==='recording'){const r=rec;r.onstop=null;r.ondataavailable=null;try{r.stop()}catch{};rec=null}}, stop(){stopped=true;clearInterval(iv);try{rec?.stop()}catch{};stream.getTracks().forEach(t=>t.stop());ctx.close()} }
}
export async function transcribe(blob:Blob,lang='hi'){ const {url,token}=backendCfg(); const r=await fetch(`${url}/api/ai/stt?lang=${lang}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':blob.type||'audio/webm'},body:blob}); const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||'Speech recognition failed'); return String(j.text||'').trim() }
