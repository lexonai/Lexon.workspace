'use client'
import { useOffice } from '@/store/officeStore'
export const usePerson=(id:string)=>useOffice(s=>s.people[id])
