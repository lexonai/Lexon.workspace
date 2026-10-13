'use client'
import { SC, initials } from '@/lib/ui'
export default function Avatar({p,size=36,dot=true}:{p:any;size?:number;dot?:boolean}){
  return <span className="avatar" style={{width:size,height:size,fontSize:size*0.36,background:`linear-gradient(135deg,${p.shirt||'#334'},#1b1d22)`}}>{initials(p.name||'?')}{dot&&<i style={{background:SC[p.presence||'offline']}}/>}</span>
}
