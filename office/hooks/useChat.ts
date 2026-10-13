'use client'
import { useOffice } from '@/store/officeStore'
export const useChat=()=>useOffice(s=>({messages:s.messages,send:s.sendOwner,unread:s.unread}))
