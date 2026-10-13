// AI layer: encrypted key vault + provider/key pool with failover + streaming + persona prompts. Keys never leave the server.
import crypto from 'node:crypto'
import { PROVIDERS, ROOM_DEFS } from '../shared/office-data.mjs'
const isLLM=p=>PROVIDERS[p]&&!PROVIDERS[p].search
export function createAI(store,secret){
  const K=crypto.scryptSync(secret,'lexon-office-vault',32)
  const enc=t=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',K,iv),ct=Buffer.concat([c.update(t,'utf8'),c.final()]);return [iv,c.getAuthTag(),ct].map(b=>b.toString('hex')).join(':')}
  const dec=s=>{const [iv,tag,ct]=s.split(':').map(h=>Buffer.from(h,'hex')),d=crypto.createDecipheriv('aes-256-gcm',K,iv);d.setAuthTag(tag);return Buffer.concat([d.update(ct),d.final()]).toString('utf8')}
  let keys=store.aiKeys.list(); const inflight=new Map(); const reload=()=>{keys=store.aiKeys.list()}
  const mask=k=>({id:k.id,provider:k.provider,label:k.label,last4:k.last4,base_url:k.base_url,models:JSON.parse(k.models||'{}'),enabled:!!k.enabled,weight:k.weight,uses:k.uses,errors:k.errors,last_error:k.last_error||'',cooling:k.cooldown_until>Date.now(),created_at:k.created_at})
  const capModels=k=>{try{return JSON.parse(k.models||'{}')}catch{return{}}}
  const pickCap=(kind,exclude=new Set())=>{const now=Date.now();const c=keys.filter(k=>k.enabled&&isLLM(k.provider)&&k.cooldown_until<now&&!exclude.has(k.id)&&capModels(k)[kind]).sort((a,b)=>(inflight.get(a.id)||0)-(inflight.get(b.id)||0)||a.uses-b.uses);return c[0]||null}
  const bump=(k,e)=>{if(!e){k.uses++;store.aiKeys.update(k.id,{uses:k.uses});return};k.errors++;const u={errors:k.errors,last_error:String(e.message).slice(0,160)};if(e.status===401||e.status===403){u.enabled=0;k.enabled=0}else{k.cooldown_until=Date.now()+20000;u.cooldown_until=k.cooldown_until}store.aiKeys.update(k.id,u)}
  async function withKey(kind,fn){const tried=new Set();let last;for(let a=0;a<3;a++){const k=pickCap(kind,tried);if(!k)break;tried.add(k.id);inflight.set(k.id,(inflight.get(k.id)||0)+1);try{const r=await fn(k,capModels(k)[kind],dec(k.secret_enc));bump(k);return r}catch(e){last=e;bump(k,e)}finally{inflight.set(k.id,Math.max(0,(inflight.get(k.id)||1)-1))}}throw new Error(last?`Voice failed: ${last.message}`:`No ${kind.toUpperCase()} key configured (add a Gemini or OpenAI key with a ${kind} model in Lexon Workspace > Integrations > Lexon Office)`)}
  const gbase=k=>(k.base_url||PROVIDERS.gemini.base).replace(/\/openai\/?$/,'')
  const wav=(pcm,rate=24000)=>{const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm])}
  const hsh=s=>[...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7)
  const GV={female:['Kore','Leda','Aoede','Zephyr'],male:['Puck','Charon','Fenrir','Orus']},OV={female:['nova','shimmer','alloy'],male:['onyx','echo','fable']}
  const api={
    async tts(text,{gender='male',seed='x'}={}){ return withKey('tts',async(k,model,sec)=>{ const g=gender==='female'?'female':'male'
      if(k.provider==='gemini'){const voiceName=GV[g][hsh(seed)%4];const r=await fetch(`${gbase(k)}/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':sec},body:JSON.stringify({contents:[{parts:[{text:String(text).slice(0,900)}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}})});const j=await r.json();if(!r.ok){const e=new Error(j.error?.message||r.statusText);e.status=r.status;throw e}const d=j.candidates?.[0]?.content?.parts?.find(p=>p.inlineData)?.inlineData?.data;if(!d)throw new Error('No audio returned');return {buf:wav(Buffer.from(d,'base64')),mime:'audio/wav'}}
      const voice=OV[g][hsh(seed)%3];const r=await fetch((k.base_url||PROVIDERS[k.provider].base).replace(/\/$/,'')+'/audio/speech',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+sec},body:JSON.stringify({model,voice,input:String(text).slice(0,900),response_format:'mp3'})});if(!r.ok){const t=await r.text().catch(()=>'');const e=new Error(`${r.status} ${t.slice(0,120)}`);e.status=r.status;throw e}return {buf:Buffer.from(await r.arrayBuffer()),mime:'audio/mpeg'} }) },
    async stt(buf,mime='audio/webm',lang='hi'){ return withKey('stt',async(k,model,sec)=>{
      if(k.provider==='gemini'){const r=await fetch(`${gbase(k)}/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':sec},body:JSON.stringify({contents:[{parts:[{text:'Transcribe this audio exactly as spoken. The speaker may use Hindi, Hinglish (Roman Hindi) or English. Output only the transcript text, nothing else. If there is no speech, output an empty string.'},{inline_data:{mime_type:String(mime).split(';')[0],data:buf.toString('base64')}}]}]})});const j=await r.json();if(!r.ok){const e=new Error(j.error?.message||r.statusText);e.status=r.status;throw e}return (j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'').trim()}
      const fd=new FormData();fd.append('file',new Blob([buf],{type:String(mime).split(';')[0]}),'audio.webm');fd.append('model',model);const r=await fetch((k.base_url||PROVIDERS[k.provider].base).replace(/\/$/,'')+'/audio/transcriptions',{method:'POST',headers:{authorization:'Bearer '+sec},body:fd});const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error?.message||r.statusText);e.status=r.status;throw e}return String(j.text||'').trim() }) },
    list:()=>keys.map(mask),
    summary:()=>({tts:!!pickCap('tts'),stt:!!pickCap('stt'),keys:keys.filter(k=>k.enabled&&isLLM(k.provider)).length,providers:[...new Set(keys.filter(k=>k.enabled&&isLLM(k.provider)).map(k=>k.provider))],search:[...new Set(keys.filter(k=>k.enabled&&PROVIDERS[k.provider]?.search).map(k=>k.provider))]}),
    available:()=>keys.some(k=>k.enabled&&isLLM(k.provider)&&k.cooldown_until<Date.now()+60000),
    add({provider,label,secret:sec,baseUrl,models,weight}){
      if(!PROVIDERS[provider])throw new Error('Unknown provider'); if(!sec||String(sec).length<8)throw new Error('API key looks too short'); if(provider==='compatible'&&!baseUrl)throw new Error('Base URL required for compatible providers')
      const m=models||{}; const row={id:crypto.randomUUID(),provider,label:label||PROVIDERS[provider].label,secret_enc:enc(String(sec).trim()),last4:String(sec).trim().slice(-4),base_url:baseUrl||'',models:JSON.stringify({fast:m.fast||PROVIDERS[provider].fast,deep:m.deep||PROVIDERS[provider].deep,tts:m.tts===undefined?PROVIDERS[provider].tts:m.tts,stt:m.stt===undefined?PROVIDERS[provider].stt:m.stt}),weight:Math.max(1,+weight||1)}
      store.aiKeys.add(row); reload(); return mask(keys.find(k=>k.id===row.id))},
    update(id,p){const u={};if(p.enabled!==undefined)u.enabled=p.enabled?1:0,u.cooldown_until=0;if(p.weight)u.weight=Math.max(1,+p.weight);if(p.label)u.label=String(p.label).slice(0,80);if(p.models)u.models=JSON.stringify(p.models);store.aiKeys.update(id,u);reload()},
    remove(id){store.aiKeys.del(id);reload()},
    secretOf(provider){const k=keys.find(x=>x.provider===provider&&x.enabled);try{return k?dec(k.secret_enc):null}catch{return null}},
    pick({tier='fast',provider,exclude=new Set()}={}){
      const now=Date.now(),c=keys.filter(k=>k.enabled&&isLLM(k.provider)&&k.cooldown_until<now&&!exclude.has(k.id)&&(!provider||k.provider===provider)); if(!c.length)return null
      c.sort((a,b)=>(inflight.get(a.id)||0)/a.weight-(inflight.get(b.id)||0)/b.weight||a.uses-b.uses); const key=c[0],m=JSON.parse(key.models||'{}')
      return {key,model:m[tier]||m.fast||m.deep||PROVIDERS[key.provider].fast}},
    async stream({system,messages,tier='fast',provider,maxTokens=700},onDelta){
      const tried=new Set(); let emitted=false,last
      for(let a=0;a<4;a++){ const pk=api.pick({tier,provider,exclude:tried}); if(!pk)break; const k=pk.key; tried.add(k.id); inflight.set(k.id,(inflight.get(k.id)||0)+1)
        try{ await callStream(k,pk.model,{system,messages,maxTokens},t=>{emitted=true;onDelta(t)}); store.aiKeys.update(k.id,{uses:k.uses+1}); k.uses++; return {key:k.id,model:pk.model} }
        catch(e){ last=e; k.errors++; const u={errors:k.errors,last_error:String(e.message).slice(0,160)}; if(e.status===401||e.status===403){u.enabled=0;k.enabled=0}else{k.cooldown_until=Date.now()+(e.status===429?60000:20000);u.cooldown_until=k.cooldown_until} store.aiKeys.update(k.id,u); if(emitted)throw e }
        finally{ inflight.set(k.id,Math.max(0,(inflight.get(k.id)||1)-1)) } }
      throw new Error(last?`All AI keys failed: ${last.message}`:'No AI key configured') },
    async complete(o){let t='';await api.stream({...o,messages:o.messages||[{role:'user',content:o.prompt}]},d=>t+=d);return t},
    async image(prompt,models){return {imageUrl:`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&model=flux&seed=${Math.floor(Math.random()*1e6)}`}},
    async test(id){const k=keys.find(x=>x.id===id);if(!k)throw new Error('No such key');if(!isLLM(k.provider))return {ok:true,note:'Search keys are verified on first use'};const m=JSON.parse(k.models||'{}');let t='';try{await callStream(k,m.fast||PROVIDERS[k.provider].fast,{system:'',messages:[{role:'user',content:'Reply with the single word: ok'}],maxTokens:10},d=>t+=d);return {ok:true,note:t.slice(0,30)||'ok'}}catch(e){return {ok:false,note:e.message}}},
  }
  return api
}
async function callStream(k,model,{system,messages,maxTokens},onDelta){
  const P=PROVIDERS[k.provider],base=(k.base_url||P.base).replace(/\/$/,''),sec=K_dec(k)
  const res=P.kind==='anthropic'
    ?await fetch(base+'/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':sec,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:maxTokens,system,messages,stream:true})})
    :await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+sec},body:JSON.stringify({model,messages:[{role:'system',content:system||'You are a helpful assistant.'},...messages],stream:true,max_tokens:maxTokens})})
  if(!res.ok){const t=await res.text().catch(()=>'');const e=new Error(`${res.status} ${t.slice(0,160)}`);e.status=res.status;throw e}
  const rd=res.body.getReader(),dc=new TextDecoder();let buf=''
  for(;;){const {done,value}=await rd.read();if(done)return;buf+=dc.decode(value,{stream:true});let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line.startsWith('data:'))continue;const d=line.slice(5).trim();if(d==='[DONE]')return
    try{const j=JSON.parse(d);const t=P.kind==='anthropic'?(j.type==='content_block_delta'?j.delta?.text:''):j.choices?.[0]?.delta?.content;if(t)onDelta(t)}catch{}}}
}
let K_dec=()=>{throw new Error('vault not ready')}
export function bindVault(secret){const K=crypto.scryptSync(secret,'lexon-office-vault',32);K_dec=k=>{const [iv,tag,ct]=k.secret_enc.split(':').map(h=>Buffer.from(h,'hex')),d=crypto.createDecipheriv('aes-256-gcm',K,iv);d.setAuthTag(tag);return Buffer.concat([d.update(ct),d.final()]).toString('utf8')}}
// ---------- prompts ----------
const fmt=t=>t?`${t.title} (${t.status}, ${t.progress}%)`:''
const LANG='Reply in the same language and style the boss uses: Hindi (Devanagari), Hinglish (Roman Hindi) or English — mirror their tone and emotion. Sound like a real colleague: natural, warm, concise (1–3 sentences unless asked for depth). Never mention being an AI, a model or a prompt.'
export function historyOf(st,conv,limit=14){
  const raw=(st.messages[conv]||[]).filter(m=>!m.system&&m.text).slice(-limit).map(m=>({role:m.from==='owner'?'user':'assistant',content:m.text}))
  const out=[];for(const m of raw){if(out.length&&out[out.length-1].role===m.role)out[out.length-1].content+='\n'+m.content;else out.push({...m})}
  while(out.length&&out[0].role!=='user')out.shift(); return out
}
export function workerSystem(st,e,{voice}={}){
  const mine=st.tasks.filter(t=>t.chain.includes(e.id)&&t.status!=='done').map(fmt).join('; ')||'none'
  return `You are ${e.name}, ${e.role} (${e.dept}). ${e.gender==='female'?'She':'He'} works in the office team; the person talking to you is the boss/owner.\nRight now you are ${String(e.state).toLowerCase()} — "${e.task}" (${e.progress}%). Your open tasks: ${mine}.\nSkills: ${(e.skills||[]).join(', ')}. Knowledge: ${(e.knowledge||[]).join(' | ')}. ${e.instructions||''}\n${st.settings.globalInstructions||''}\nIf asked for work outside your role, say you'll pass it to the manager.\n${LANG}${voice?' This is a spoken phone call: keep replies to 1–2 short sentences, no lists.':''}\nCurrent time: ${new Date().toLocaleString()}.`
}
export function managerSystem(st,m,{voice}={}){
  const team=Object.values(st.people).filter(p=>!p.isManager).slice(0,60).map(p=>`${p.name} — ${p.role} — ${p.presence}, ${String(p.state).toLowerCase()}${p.task?`: ${p.task}`:''}`).join('\n')
  const open=st.tasks.filter(t=>t.status!=='done').slice(0,12).map(t=>`${fmt(t)} → ${st.people[t.assignee]?.name||'?'}`).join('\n')||'none'
  return `You are ${m.name}, the manager of this office team. You lead ${Object.keys(st.people).length-1} people and report to the boss (the user).\nTeam:\n${team}\nOpen tasks:\n${open}\n${st.settings.globalInstructions||''}\nYou can act: when the boss asks for work to be done, answer naturally AND add, on its own last line, one marker per task: [[TASK: short imperative description in English]]. When the boss wants people to gather somewhere, add [[CALL: room|who]] with room one of ${ROOM_DEFS.map(r=>r.id).join(', ')} and who = all or comma-separated first names. Never explain or show markers in your sentences. Be decisive and brief.\n${LANG}${voice?' This is a spoken call: 1–2 short sentences.':''}\nCurrent time: ${new Date().toLocaleString()}.`
}
export function markerFilter(emit){
  let buf='';const markers=[]
  return {push(t){buf+=t;let out='';for(;;){const i=buf.indexOf('[[');if(i<0){if(buf.endsWith('[')){out+=buf.slice(0,-1);buf='['}else{out+=buf;buf=''}break}
    out+=buf.slice(0,i);buf=buf.slice(i);const j=buf.indexOf(']]');if(j<0)break;markers.push(buf.slice(2,j));buf=buf.slice(j+2)}if(out)emit(out)},
    end(){if(buf&&!buf.startsWith('[['))emit(buf);return markers}}
}
