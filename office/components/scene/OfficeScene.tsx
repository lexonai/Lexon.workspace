'use client'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { InstancedDesks } from '@/3d/environment/InstancedDesks'
import { useEffect } from 'react'
import { useOffice } from '@/store/officeStore'
import { ROOMS, CAMS } from '@/config/office.config'
import { ensureWorld } from '@/3d/world'
import { Building } from '@/3d/environment/Building'
import { Desk } from '@/3d/environment/Desk'
import { ScreenUpdater } from '@/components/computers/VirtualScreen'
import { GlbNear } from '@/3d/characters/GlbNear'
import { Crowd, CrowdLabels } from '@/3d/characters/Crowd'
import { Sim } from '@/components/workflow/WorkflowSim'
import { Rig } from '@/components/camera/CameraRig'
import { MeetSim, RoomCallSim } from '@/components/workflow/MeetSim'
import { AmbientSim } from '@/components/workflow/AmbientSim'
import { PerfGovernor } from './PerfGovernor'
import { LEVELS } from '@/3d/perf'
import { PlayerRig } from '@/components/camera/PlayerRig'
import { RenderDirector } from '@/components/camera/RenderDirector'
export { world } from '@/3d/world'
function DeskOf({id}:{id:string}){ const d=useOffice(s=>s.people[id]?.desk); return d?<Desk id={id} x={d[0]} z={d[1]}/>:null }
export default function OfficeScene(){
  const clear=useOffice(s=>s.set); const focus=useOffice(s=>!!s.focusCam),level=useOffice(s=>s.perfLevel), shadowsOn=useOffice(s=>s.settings.shadows!==false); const ids=useOffice(s=>Object.keys(s.people).join(',')).split(',').filter(Boolean); ids.forEach(ensureWorld)
  useEffect(()=>{const id=setInterval(()=>{const o=useOffice.getState();if(o.mode==='tour'){const i=CAMS.findIndex(c=>c.id===o.camId);o.set({camId:CAMS[(i+1)%CAMS.length].id})}},8000);return()=>clearInterval(id)},[])
  return <Canvas shadows={shadowsOn&&LEVELS[level].shadows} dpr={focus?LEVELS[level].dpr:1} camera={{position:[0,34,22],fov:42}} onPointerMissed={()=>clear({selected:null})} gl={{antialias:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.05}}>
    <color attach="background" args={['#08090b']}/><fog attach="fog" args={['#08090b',90,180]}/>
    <hemisphereLight args={['#dfe6ef','#2a2d33',0.95]}/>
    <Environment resolution={128} frames={1}><Lightformer form="rect" intensity={1.6} position={[0,12,0]} rotation-x={Math.PI/2} scale={[40,30,1]}/><Lightformer form="rect" intensity={0.8} position={[0,6,20]} scale={[40,6,1]}/></Environment>
    <directionalLight position={[10,25,18]} intensity={1.1} castShadow={shadowsOn&&LEVELS[level].shadows} shadow-mapSize={[1024,1024]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={20} shadow-camera-bottom={-20}/>
        <Building/>
    <InstancedDesks/>
    {ids.map(id=><DeskOf key={id} id={id}/>)}
    <Crowd/><GlbNear/><CrowdLabels/>
    <PerfGovernor/><ScreenUpdater/><RenderDirector/><Sim/><MeetSim/><RoomCallSim/><AmbientSim/><PlayerRig/><Rig/>
  </Canvas>
}
