'use client'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { HUMAN_GLB } from '@/config/assets.config'
import { useLoaderExt } from '../loaders'
export default function GlbHuman({url,anim}:{url:string;anim:string}){
  const ext=useLoaderExt(); const {scene,animations}=useGLTF(url,true,true,ext); const obj=useMemo(()=>clone(scene),[scene]); const ref=useRef<THREE.Group>(null!)
  const {actions}=useAnimations(animations,ref)
  const pick=(k:string)=>(HUMAN_GLB.clips[k]||[]).find(n=>actions[n])
  const seated=anim==='Sit'||anim==='Typing', hasSitClip=!!(pick('Sit')||pick('Typing'))
  const bones=useMemo(()=>{ const b:Record<string,THREE.Object3D>={}; obj.traverse(o=>{ const n=o.name; if(/LeftUpLeg$/.test(n))b.lu=o; if(/RightUpLeg$/.test(n))b.ru=o; if(/LeftLeg$/.test(n))b.ll=o; if(/RightLeg$/.test(n))b.rl=o }); return b },[obj])
  useEffect(()=>{
    const name=pick(anim)||pick('Idle'); const a=name?actions[name]:Object.values(actions)[0]; if(!a)return
    a.reset().fadeIn(0.3).play(); a.paused=!name&&anim!=='Walk'&&!!Object.values(actions).length
    return()=>{a.fadeOut(0.3)}
  },[anim,actions])
  useFrame(()=>{ if(seated&&!hasSitClip&&HUMAN_GLB.seatedBonePose&&bones.lu){ bones.lu.rotation.x=-Math.PI/2; bones.ru.rotation.x=-Math.PI/2; bones.ll.rotation.x=Math.PI/2; bones.rl.rotation.x=Math.PI/2 } })
  return <group ref={ref} scale={HUMAN_GLB.scale} position={HUMAN_GLB.offset} rotation-y={HUMAN_GLB.rotationY}><primitive object={obj}/></group>
}
