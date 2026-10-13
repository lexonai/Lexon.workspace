'use client'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useOffice } from '@/store/officeStore'
import { applyLevel } from '@/3d/perf'
/** Keeps the office smooth on weaker machines: in Auto mode it steps quality down when the frame rate stays low. Manual presets: high / medium / low. */
export function PerfGovernor(){
  const acc=useRef({t:0,n:0,bad:0,cool:0,applied:-1})
  useFrame((_,dt)=>{
    const o=useOffice.getState(),q=o.settings.quality||'auto',a=acc.current; if(document.hidden||dt>0.5)return
    const manual=q==='high'?0:q==='medium'?1:q==='low'?3:-1
    if(manual>=0){ if(a.applied!==manual){a.applied=manual;applyLevel(manual);o.set({perfLevel:manual})} return }
    if(a.applied<0){a.applied=o.perfLevel;applyLevel(o.perfLevel)}
    a.t+=dt;a.n++;a.cool-=dt
    if(a.n>=90){ const fps=a.n/a.t; a.t=0;a.n=0
      if(fps<38&&a.cool<=0&&o.perfLevel<3){ a.bad++; if(a.bad>=2){a.bad=0;a.cool=6;const l=o.perfLevel+1;a.applied=l;applyLevel(l);o.set({perfLevel:l});o.log(`Graphics quality lowered automatically (${Math.round(fps)} fps)`,'system')} } else a.bad=0 }
  })
  return null
}
