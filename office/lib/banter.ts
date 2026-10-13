'use client'
import { useOffice } from '@/store/officeStore'
import { postAI } from './ai-client'
let last=0,busy=false
/** AI-written casual lines shown as speech bubbles (throttled; needs backend + an AI key; otherwise silent — nothing is scripted). */
export async function banter(a:string,b:string,ctx:string){
  const o=useOffice.getState(); if(busy||Date.now()-last<12000||!o.backend.connected||!o.ai.keys||document.hidden)return; busy=true;last=Date.now()
  try{const r=await postAI('/api/ai/banter',{a,b,ctx});(r.lines||[]).forEach((l:any,i:number)=>setTimeout(()=>useOffice.getState().say(l.id,l.text,4500),i*2600))}catch{}finally{busy=false}
}
