'use client'
import { RefObject } from 'react'
import { useOffice } from '@/store/officeStore'
const MODES:[string,string][]=[['live','Live'],['tour','Auto Tour'],['follow','Follow'],['room','Follow Room'],['free','Free'],['walk','Free Walk']]
export default function CameraControls({vp}:{vp:RefObject<HTMLDivElement|null>}){
  const o=useOffice(); const sel=o.selected as any
  const setMode=(m:string)=>{ if(m==='follow'){ if(!sel)return; o.set({mode:'follow',follow:sel}) } else if(m==='room'){ if(!sel)return; o.set({mode:'room'}) } else o.set({mode:m as any}) }
  return <div className="ctl">{MODES.map(([m,l])=><button key={m} className={o.mode===m?'on':''} onClick={()=>setMode(m)}>{l}</button>)}
    <button onClick={()=>o.set({zoom:Math.min(2.5,o.zoom+0.2)})}>＋</button><button onClick={()=>o.set({zoom:Math.max(0.6,o.zoom-0.2)})}>－</button><button onClick={()=>document.documentElement.requestFullscreen?.()}>⛶</button></div>
}
