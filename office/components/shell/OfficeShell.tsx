'use client'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useOffice } from '@/store/officeStore'
import { startBackend } from '@/lib/backend'
import { rtc } from '@/lib/rtc'
import { embedMode, ingestAuth } from '@/lib/embed'
import { startBridge } from '@/lib/embedBridge'
import { CAMS } from '@/config/office.config'
import ProfilerHUD from '../scene/ProfilerHUD'
import OfficeNavigation from './OfficeNavigation'
import OfficeHeader from './OfficeHeader'
import PersonPanel from '../overlays/PersonPanel'
import MeetingChat from '../overlays/MeetingChat'
import Joystick from '../camera/Joystick'
import CallWindow from '../overlays/CallWindow'
import IncomingCall from '../overlays/IncomingCall'
import CameraControls from '../camera/CameraControls'
import OfficePage from '../pages/OfficePage'
import PeoplePage from '../pages/PeoplePage'
import ChatPage from '../pages/ChatPage'
import TasksPage from '../pages/TasksPage'
import ActivityPage from '../pages/ActivityPage'
import SchedulePage from '../pages/SchedulePage'
import SettingsPage from '../pages/SettingsPage'
const Scene = dynamic(()=>import('../scene/OfficeScene'),{ssr:false,loading:()=><div className="loading">Loading office…</div>})
const PAGES:Record<string,any>={office:OfficePage,people:PeoplePage,chat:ChatPage,tasks:TasksPage,activity:ActivityPage,schedule:SchedulePage,settings:SettingsPage}
export default function OfficeShell({children}:{children:React.ReactNode}){
  const path=usePathname()||'/office'; const section=path.split('/').filter(Boolean)[0]||'office'
  const router=useRouter(); const [embed,setEmbed]=useState('')
  useEffect(()=>{ setEmbed(embedMode()); return startBridge(p=>router.push(p)) },[])
  const o=useOffice(); const Page=PAGES[section]||OfficePage; const full=section==='office'&&!!o.focusCam
  useEffect(()=>{ ingestAuth(); let stop=()=>{}; Promise.resolve(useOffice.persist.rehydrate()).then(()=>{ useOffice.getState().afterHydrate(); stop=startBackend() })
    rtc.init(new URLSearchParams(location.search).get('as')||localStorage.getItem('office.as')||'owner')
    const a=setInterval(()=>useOffice.getState().tick(),15000), b=setInterval(()=>useOffice.getState().ambient(),45000); return()=>{stop();clearInterval(a);clearInterval(b)} },[])
  useEffect(()=>{ document.documentElement.classList.toggle('calm',!!o.settings.reduceMotion) },[o.settings.reduceMotion])
  useEffect(()=>{ if(section!=='office'&&o.focusCam)o.set({focusCam:null}) },[section])
  return <div className={'app'+(embed?' embed':'')+(embed==='bare'?' embed-bare':'')}>{children}
    <OfficeNavigation section={section}/>
    <main className="main"><OfficeHeader/>
      <div className="content" key={section}>{o.ready&&<Page/>}</div>
      <div className={'scene-host '+(full?'full':'off')}>{o.ready&&<Scene/>}
        {full&&<><div className="fbar"><button onClick={()=>o.set({focusCam:null,mode:'live',follow:null})}>← All cameras</button>{CAMS.map(c=><button key={c.id} className={o.camId===c.id?'on':''} onClick={()=>o.set({camId:c.id,mode:'live'})}>{c.label}</button>)}</div><PersonPanel/><MeetingChat/>{o.mode==='walk'&&<><Joystick/><div className="walkhint">WASD / joystick to walk · drag to look · wheel to zoom · click a person</div></>}<CameraControls vp={{current:null}}/></>}</div>
    </main><CallWindow/><IncomingCall/><ProfilerHUD/></div>
}
