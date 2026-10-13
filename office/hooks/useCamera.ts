'use client'
import { useOffice } from '@/store/officeStore'
export const useCamera=()=>useOffice(s=>({camId:s.camId,mode:s.mode,zoom:s.zoom,set:s.set}))
