'use client'
import { useRef } from 'react'
import { player } from '@/3d/player'
export default function Joystick(){
  const knob=useRef<HTMLDivElement>(null),base=useRef<HTMLDivElement>(null),on=useRef(false)
  const upd=(e:React.PointerEvent)=>{const r=base.current!.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=(e.clientX-cx)/(r.width/2),dy=(e.clientY-cy)/(r.height/2);const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l};player.jx=dx;player.jz=dy;knob.current!.style.transform=`translate(${dx*34}px,${dy*34}px)`}
  const end=()=>{on.current=false;player.jx=0;player.jz=0;if(knob.current)knob.current.style.transform='translate(0,0)'}
  return <div className="joy" ref={base} onPointerDown={e=>{on.current=true;(e.target as HTMLElement).setPointerCapture(e.pointerId);upd(e)}} onPointerMove={e=>on.current&&upd(e)} onPointerUp={end} onPointerCancel={end}><div className="knob" ref={knob}/></div>
}
