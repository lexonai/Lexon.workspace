'use client'
import { useOffice } from '@/store/officeStore'
export const usePresence=(id:string)=>useOffice(s=>s.people[id].presence)
