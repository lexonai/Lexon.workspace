'use client'
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useLoaderExt } from './loaders'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
export default function GlbStatic({url}:{url:string}){ const ext=useLoaderExt(); const {scene}=useGLTF(url,true,true,ext); const o=useMemo(()=>clone(scene),[scene]); return <primitive object={o}/> }
