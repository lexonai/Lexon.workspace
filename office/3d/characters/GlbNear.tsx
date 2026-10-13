'use client'
import * as THREE from 'three'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useOffice } from '@/store/officeStore'
import { world, seat } from '../world'
import { archOf } from '../archetypes'
import { ARCH_URL, useLoaderExt } from '../loaders'
import { useGlbAvail } from '../useGlbAvail'
import GlbHuman from './GlbHuman'
export const glbActive=new Set<string>()
function GlbPerson({id,url}:{id:string;url:string}){
  const g=useRef<THREE.Group>(null!),[anim,setAnim]=useState('Idle'),cur=useRef('Idle')
  useFrame(()=>{ const P=useOffice.getState().people[id],w=world[id]; if(!P||!w)return; const s=seat(id); g.current.position.set(w.x,0,w.z);g.current.rotation.y=w.ry
    const sit=!w.moving&&P.state!=='WALKING'&&(w.pose?w.pose==='sit':(s.sit&&Math.hypot(w.x-s.x,w.z-s.z)<0.2)); g.current.position.y=sit?-0.45:0
    const a=w.moving?'Walk':sit?(P.state==='TYPING'||P.state==='WORKING'?'Typing':'Sit'):(P.state==='TALKING'||P.state==='MEETING')?'Talk':'Idle'; if(a!==cur.current){cur.current=a;setAnim(a)} })
  return <group ref={g}><Suspense fallback={null}><GlbHuman url={url} anim={anim}/></Suspense></group>
}
/** If photoreal character GLBs are present (public/models/humans/{m1,m2,f1,f2,mgr}.glb), the ≤6 nearest people in focus mode use them; everyone else stays on the instanced low-cost bodies. */
export function GlbNear(){
  const avail=useGlbAvail(),ext=useLoaderExt(),[ids,setIds]=useState<string[]>([]),last=useRef(0)
  useEffect(()=>{ for(const k of Object.keys(avail))if(avail[k])useGLTF.preload(ARCH_URL(k),true,true,ext) },[avail,ext])
  useFrame(({camera,clock})=>{ if(clock.elapsedTime-last.current<0.5)return;last.current=clock.elapsedTime; const o=useOffice.getState()
    const any=Object.values(avail).some(Boolean); if(!o.focusCam||!any){if(glbActive.size){glbActive.clear();setIds([])}return}
    const d=Object.keys(o.people).filter(id=>world[id]&&avail[archOf(o.people[id])]).map(id=>({id,d:Math.hypot(world[id].x-camera.position.x,world[id].z-camera.position.z)})).filter(x=>x.d<9).sort((a,b)=>a.d-b.d).slice(0,6).map(x=>x.id)
    glbActive.clear();d.forEach(i=>glbActive.add(i)); if(d.join()!==ids.join())setIds(d) })
  return <>{ids.map(id=><GlbPerson key={id} id={id} url={ARCH_URL(archOf(useOffice.getState().people[id]))}/>)}</>
}
