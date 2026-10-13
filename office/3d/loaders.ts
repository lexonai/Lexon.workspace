import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
export const BASE=process.env.NEXT_PUBLIC_BASE_PATH||''
useGLTF.setDecoderPath(BASE+'/draco/')            // Draco decoder served locally (works offline / in the desktop app)
let ktx:KTX2Loader|null=null
/** Loader extension used for every GLB: KTX2 (basis) textures; Draco + Meshopt are enabled in drei's useGLTF. */
export function useLoaderExt(){ const gl=useThree(s=>s.gl); return useMemo(()=>(l:any)=>{ if(!ktx)ktx=new KTX2Loader().setTranscoderPath(BASE+'/basis/').detectSupport(gl); l.setKTX2Loader(ktx) },[gl]) }
export const ARCH_URL=(a:string)=>`${BASE}/models/humans/${a}.glb`
