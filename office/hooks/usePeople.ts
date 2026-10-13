'use client'
import { useOffice } from '@/store/officeStore'
export const usePeople=()=>useOffice(s=>Object.values(s.people))
