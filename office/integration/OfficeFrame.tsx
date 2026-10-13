'use client'
// Copy this single file into LEXON WORKSPACE (or any React app). It only depends on React.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { OfficeEvent, OfficeCommand } from './workspace-events'
import type { OfficeSnapshot } from './workspace-types'
export type OfficeFrameHandle={ send:(c:OfficeCommand)=>void; snapshot:()=>Promise<OfficeSnapshot> }
type Props={ src:string; /* e.g. https://office.example.com/office/ */ bare?:boolean; onEvent?:(e:OfficeEvent)=>void; className?:string; style?:React.CSSProperties }
const OfficeFrame=forwardRef<OfficeFrameHandle,Props>(({src,bare,onEvent,className,style},ref)=>{
  const f=useRef<HTMLIFrameElement>(null); const origin=new URL(src,typeof location!=='undefined'?location.href:'http://x').origin
  const send=(c:OfficeCommand)=>f.current?.contentWindow?.postMessage({target:'lexon-office',...c},origin)
  useImperativeHandle(ref,()=>({send,snapshot:()=>new Promise(res=>{const id=Math.random().toString(36).slice(2);const h=(e:MessageEvent)=>{if(e.origin===origin&&e.data?.source==='lexon-office'&&e.data.type==='office.snapshot'&&e.data.id===id){window.removeEventListener('message',h);res(e.data.data)}};window.addEventListener('message',h);send({type:'office.snapshot.request',id} as any)})}))
  useEffect(()=>{ const h=(e:MessageEvent)=>{ if(e.origin===origin&&e.data?.source==='lexon-office')onEvent?.(e.data) }; window.addEventListener('message',h); return()=>window.removeEventListener('message',h) },[origin,onEvent])
  return <iframe ref={f} src={`${src}${src.includes('?')?'&':'?'}embed=${bare?'bare':'1'}`} allow="microphone; fullscreen; autoplay" className={className} style={{border:0,width:'100%',height:'100%',...style}}/>
})
OfficeFrame.displayName='OfficeFrame'; export default OfficeFrame
