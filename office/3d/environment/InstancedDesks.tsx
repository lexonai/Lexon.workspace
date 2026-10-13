'use client'
import * as THREE from 'three'
import { Suspense, useLayoutEffect, useRef } from 'react'
import { SLOTS } from '@/config/office.config'
import { useModelUrl } from '../useModelUrl'
import GlbStatic from '../GlbStatic'
import { DESK_GLB } from '@/config/assets.config'
type V=[number,number,number,number?]
function Inst({items,kind,size,color,rough=0.7,metal=0}:{items:V[];kind:'box'|'cyl'|'sphere';size:number[];color:string;rough?:number;metal?:number}){
  const ref=useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(()=>{ const o=new THREE.Object3D(); items.forEach((p,i)=>{o.position.set(p[0],p[1],p[2]);o.rotation.set(0,p[3]||0,0);o.updateMatrix();ref.current.setMatrixAt(i,o.matrix)}); ref.current.instanceMatrix.needsUpdate=true; ref.current.computeBoundingSphere() },[items])
  return <instancedMesh ref={ref} args={[undefined,undefined,items.length]} castShadow receiveShadow>{kind==='box'?<boxGeometry args={size as any}/>:kind==='cyl'?<cylinderGeometry args={size as any}/>:<sphereGeometry args={size as any}/>}<meshStandardMaterial color={color} roughness={rough} metalness={metal}/></instancedMesh>
}
const S=SLOTS as any[], D=S.filter(s=>s.type==='desk') as {x:number;z:number}[]
const at=(f:(x:number,z:number)=>V):V[]=>D.map(d=>f(d.x,d.z))
const legs:V[]=D.flatMap(({x,z})=>[[-0.7,-0.35],[0.7,-0.35],[-0.7,0.35],[0.7,0.35]].map(([a,b])=>[x+a,0.37,z+b] as V))
const seatV=(f:(s:any)=>V):V[]=>S.map(f)
const plants:[number,number][]=[[-22.4,-9.6],[-12.6,-9.6],[-11.0,-9.6],[-1.2,-9.6],[0.9,-9.6],[10.6,-9.6],[13.0,-9.6],[22.4,-9.6],[22.4,-3.2],[-22.4,1.4],[-12.6,7.6],[-22.4,7.6],[-10.8,7.6],[10.8,7.6],[12.6,1.6],[22.4,7.6],[-9,7.6],[9,7.6],[-0.5,1.6],[16,7.9]]
export function InstancedDesks(){
  const glb=useModelUrl(DESK_GLB)
  return <group>
    {glb?D.map((d,i)=><group key={i} position={[d.x,0,d.z]}><Suspense fallback={null}><GlbStatic url={glb}/></Suspense></group>):<>
      <Inst items={at((x,z)=>[x,0.75,z])} kind="box" size={[1.5,0.04,0.8]} color="#a8764a" rough={0.5}/>
      <Inst items={legs} kind="box" size={[0.04,0.74,0.04]} color="#2a2a2d" metal={0.6}/></>}
    <Inst items={at((x,z)=>[x,1.07,z-0.2])} kind="box" size={[0.56,0.34,0.04]} color="#101113" rough={0.4}/>
    <Inst items={at((x,z)=>[x,0.87,z-0.2])} kind="box" size={[0.05,0.2,0.05]} color="#1a1a1c" metal={0.5}/>
    <Inst items={at((x,z)=>[x,0.78,z+0.15])} kind="box" size={[0.42,0.015,0.14]} color="#1d1d20"/>
    <Inst items={at((x,z)=>[x+0.55,0.775,z+0.05])} kind="box" size={[0.07,0.012,0.14]} color="#0e0e10"/>
    <Inst items={at((x,z)=>[x-0.6,0.775,z+0.05])} kind="box" size={[0.07,0.015,0.14]} color="#18181b"/>
    <Inst items={at((x,z)=>[x+0.35,0.8,z-0.05])} kind="cyl" size={[0.03,0.03,0.07,8]} color="#e8eaed"/>
    <Inst items={seatV(s=>[s.sx,0.45,s.sz,s.ry])} kind="box" size={[0.46,0.06,0.46]} color="#262a31"/>
    <Inst items={seatV(s=>[s.sx-Math.sin(s.ry)*0.22,0.75,s.sz-Math.cos(s.ry)*0.22,s.ry])} kind="box" size={[0.44,0.5,0.05]} color="#262a31"/>
    <Inst items={seatV(s=>[s.sx,0.22,s.sz])} kind="cyl" size={[0.03,0.03,0.44,8]} color="#555" metal={0.7}/>
    <Inst items={plants.map(([x,z])=>[x,0.25,z] as V)} kind="cyl" size={[0.22,0.17,0.5,12]} color="#3a3a3d"/>
    <Inst items={plants.map(([x,z])=>[x,0.85,z] as V)} kind="sphere" size={[0.4,12,10]} color="#2f5a3a" rough={1}/>
  </group>
}
