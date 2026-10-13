'use client'
import { useOffice } from '@/store/officeStore'
export const useTasks=()=>useOffice(s=>s.tasks)
