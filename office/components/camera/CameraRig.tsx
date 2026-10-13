'use client'
import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useOffice } from '@/store/officeStore'
import { CAMS, ROOM_CAM } from '@/config/office.config'
import { world } from '@/3d/world'
export function Rig(){
  const {camera}=useThree(), tgt=useRef(new THREE.Vector3(0,0,3)), P=useRef(new THREE.Vector3()), T=useRef(new THREE.Vector3())
  const mode=useOffice(s=>s.mode)
  useFrame(({size},dt)=>{
    const o=useOffice.getState(); const cam=CAMS.find(c=>c.id===(o.mode==='room'&&o.selected?ROOM_CAM[o.people[o.selected].room]:o.camId))!
    const k=1-Math.exp(-dt*2.2); const cp=camera as THREE.PerspectiveCamera
    cp.zoom+=(o.zoom-cp.zoom)*k; cp.updateProjectionMatrix()
    if(o.mode==='free'||o.mode==='walk')return
    if(o.mode==='follow'&&o.follow){const w=world[o.follow]; if(!w)return;P.current.set(w.x+3,4,w.z+6);T.current.set(w.x,1.1,w.z)}
    else{ T.current.set(...(cam.target as [number,number,number])); if(cam.id==='cam1'){const t=Math.tan(THREE.MathUtils.degToRad(cp.fov/2)),d=Math.max(27/(t*size.width*size.height**-1),16/t)*1.1;P.current.set(T.current.x,T.current.y+Math.sin(0.95)*d,T.current.z+Math.cos(0.95)*d)} else P.current.set(...(cam.pos as [number,number,number])) }
    camera.position.lerp(P.current,k);tgt.current.lerp(T.current,k);camera.lookAt(tgt.current)
  })
  return mode==='free'?<OrbitControls makeDefault enableDamping target={[0,0,3]} maxPolarAngle={Math.PI/2.05}/>:null
}

