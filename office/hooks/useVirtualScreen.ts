'use client'
import { useOffice } from '@/store/officeStore'
export const useVirtualScreen=(id:string)=>useOffice(s=>s.people[id].app)
