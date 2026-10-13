'use client'
import { useOffice } from '@/store/officeStore'
export const useWorkflow=()=>useOffice(s=>s.tasks.find((t:any)=>t.status==='working'||t.status==='review')||null)
