'use client'
import Link from 'next/link'
import { useOffice } from '@/store/officeStore'
import Icon from '../ui/Icon'
const NAV:[string,string,string][]=[['office','Office','office'],['people','People','people'],['chat','Chat','chat'],['tasks','Tasks','tasks'],['activity','Activity','activity'],['schedule','Schedule','schedule'],['settings','Settings','settings']]
export default function OfficeNavigation({section}:{section:string}){
  const unread=useOffice(s=>Object.values(s.unread).reduce((a:number,b:any)=>a+b,0)), open=useOffice(s=>s.tasks.filter((t:any)=>t.status!=='done').length)
  return <nav className="nav"><div className="brand"><span className="logo">L</span><div>LEXON<small>OFFICE</small></div></div>
    {NAV.map(([id,label,ic])=><Link key={id} href={'/'+id} className={section===id?'on':''}><Icon n={ic}/><span>{label}</span>{id==='chat'&&unread>0&&<em>{unread}</em>}{id==='tasks'&&open>0&&<em className="soft">{open}</em>}</Link>)}</nav>
}
