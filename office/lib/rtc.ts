'use client'
import { supabase } from './supabase/client'
// Real person-to-person voice: WebRTC audio, signaling over Supabase Realtime broadcast (or BroadcastChannel across tabs when Supabase is not configured).
type Sig={type:string;from:string;to?:string;data?:any}
type Ev='incoming'|'connected'|'ended'|'online'|'declined'|'error'
const ICE:RTCConfiguration={iceServers:[{urls:'stun:stun.l.google.com:19302'}]} // add a TURN server for strict NATs
class Rtc{
  me='owner'; peer:string|null=null; online=new Set<string>()
  private send:(s:Sig)=>void=()=>{}; private pc:RTCPeerConnection|null=null; private local:MediaStream|null=null; private audio:HTMLAudioElement|null=null
  private ls:Record<string,((d?:any)=>void)[]>={}; private pend:RTCIceCandidateInit[]=[]; private started=false; private cleanup=()=>{}; private muted=false
  on(e:Ev,f:(d?:any)=>void){(this.ls[e]=this.ls[e]||[]).push(f);return()=>{this.ls[e]=(this.ls[e]||[]).filter(x=>x!==f)}}
  private emit(e:Ev,d?:any){(this.ls[e]||[]).slice().forEach(f=>f(d))}
  isOnline(id:string){return this.online.has(id)}
  init(me:string){
    if(typeof window==='undefined'||(this.started&&this.me===me))return
    this.cleanup(); this.me=me; this.started=true; this.online=new Set(); let off=()=>{}
    if(supabase){ const ch=supabase.channel('office:voice'); ch.on('broadcast',{event:'sig'},({payload})=>this.recv(payload)).subscribe(s=>{if(s==='SUBSCRIBED')this.send({type:'hello',from:me})})
      this.send=s=>{ch.send({type:'broadcast',event:'sig',payload:s})}; off=()=>{supabase!.removeChannel(ch)} }
    else if(typeof BroadcastChannel!=='undefined'){ const bc=new BroadcastChannel('office-voice'); bc.onmessage=e=>this.recv(e.data); this.send=s=>bc.postMessage(s); off=()=>bc.close(); this.send({type:'hello',from:me}) }
    const bye=()=>this.send({type:'bye',from:me}); window.addEventListener('beforeunload',bye); this.cleanup=()=>{bye();off();window.removeEventListener('beforeunload',bye)}
  }
  private recv(s:Sig){
    if(!s||s.from===this.me)return; if(s.to&&s.to!==this.me)return
    switch(s.type){
      case 'hello': this.online.add(s.from); this.send({type:'here',from:this.me,to:s.from}); this.emit('online'); break
      case 'here': this.online.add(s.from); this.emit('online'); break
      case 'bye': this.online.delete(s.from); this.emit('online'); if(this.peer===s.from)this.end(); break
      case 'ring': if(this.peer){this.send({type:'decline',from:this.me,to:s.from})}else{this.peer=s.from;this.emit('incoming',{from:s.from})} break
      case 'accept': this.makeOffer(); break
      case 'decline': this.peer=null; this.emit('declined'); break
      case 'offer': this.answer(s.data); break
      case 'answer': this.pc?.setRemoteDescription(s.data).then(()=>this.flush()); break
      case 'ice': if(this.pc?.remoteDescription)this.pc.addIceCandidate(s.data).catch(()=>{}); else this.pend.push(s.data); break
      case 'hangup': this.end(); break
    }
  }
  private flush(){this.pend.splice(0).forEach(c=>this.pc?.addIceCandidate(c).catch(()=>{}))}
  private async mk(){
    this.pc=new RTCPeerConnection(ICE); const peer=this.peer!
    this.pc.onicecandidate=e=>{if(e.candidate)this.send({type:'ice',from:this.me,to:peer,data:e.candidate.toJSON()})}
    this.pc.ontrack=e=>{this.audio=new Audio();this.audio.srcObject=e.streams[0];this.audio.play().catch(()=>{})}
    this.pc.onconnectionstatechange=()=>{const s=this.pc?.connectionState; if(s==='connected')this.emit('connected',{peer}); if(s==='failed'||s==='closed')this.end()}
    this.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); this.local.getAudioTracks().forEach(t=>{t.enabled=!this.muted;this.pc!.addTrack(t,this.local!)})
  }
  private async makeOffer(){ try{ await this.mk(); const o=await this.pc!.createOffer(); await this.pc!.setLocalDescription(o); this.send({type:'offer',from:this.me,to:this.peer!,data:o}) }catch(e){this.emit('error',e);this.hangup()} }
  private async answer(offer:RTCSessionDescriptionInit){ try{ await this.mk(); await this.pc!.setRemoteDescription(offer); this.flush(); const a=await this.pc!.createAnswer(); await this.pc!.setLocalDescription(a); this.send({type:'answer',from:this.me,to:this.peer!,data:a}) }catch(e){this.emit('error',e);this.hangup()} }
  call(to:string){ this.peer=to; this.send({type:'ring',from:this.me,to}) }
  accept(){ if(this.peer)this.send({type:'accept',from:this.me,to:this.peer}) }
  decline(){ if(this.peer)this.send({type:'decline',from:this.me,to:this.peer}); this.peer=null }
  mute(m:boolean){ this.muted=m; this.local?.getAudioTracks().forEach(t=>t.enabled=!m) }
  hangup(){ const p=this.peer; if(!p&&!this.pc)return; if(p)this.send({type:'hangup',from:this.me,to:p}); this.end() }
  private end(){ const p=this.peer; this.pc?.close(); this.pc=null; this.local?.getTracks().forEach(t=>t.stop()); this.local=null; this.audio?.pause(); this.audio=null; this.peer=null; this.pend=[]; if(p)this.emit('ended',{peer:p}) }
}
export const rtc=new Rtc()
