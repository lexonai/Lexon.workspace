'use client'
import { ReactNode, useRef, useState } from 'react'
let Z=60
/** Native-style mini window: drag, resize (CSS), minimize/restore, close, bring-to-front. */
export default function WindowFrame({title,sub,onClose,children,init={x:16,y:16},w=300,fixed=false}:{title:string;sub?:string;onClose:()=>void;children:ReactNode;init?:{x:number;y:number};w?:number;fixed?:boolean}){
  const [pos,setPos]=useState(init),[min,setMin]=useState(false),[z,setZ]=useState(()=>++Z); const d=useRef<{dx:number;dy:number}|null>(null)
  return <div className="win" style={{left:pos.x,top:pos.y,width:w,zIndex:z,position:fixed?'fixed':'absolute',resize:min?'none':'both'}} onPointerDown={()=>setZ(++Z)}>
    <div className="phead" onPointerDown={e=>{d.current={dx:e.clientX-pos.x,dy:e.clientY-pos.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(d.current)setPos({x:Math.max(0,e.clientX-d.current.dx),y:Math.max(0,e.clientY-d.current.dy)})}} onPointerUp={()=>d.current=null}>
      <span><b>{title}</b>{sub&&<small>{sub}</small>}</span>
      <span onPointerDown={e=>e.stopPropagation()}><button title={min?'Restore':'Minimize'} onClick={()=>setMin(!min)}>{min?'▢':'–'}</button><button title="Close" onClick={onClose}>✕</button></span></div>
    {!min&&<div className="wbody">{children}</div>}</div>
}
