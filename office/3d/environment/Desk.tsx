'use client'
import { Screen } from '@/components/computers/VirtualScreen'
export function Desk({id,x,z}:{id:string;x:number;z:number}){ return <group position={[x,0.77,z-0.2]}><Screen id={id}/></group> }
