'use client'
import { useOffice } from '@/store/officeStore'
export const useActivity=()=>useOffice(s=>s.activity)
