'use client'
import { ReactNode } from 'react'
export default function Modal({title,onClose,children,wide}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  return <div className="modal-bg" onMouseDown={onClose}><div className={'modal '+(wide?'wide':'')} onMouseDown={e=>e.stopPropagation()}><div className="mh"><b>{title}</b><button className="ghost" onClick={onClose}>✕</button></div><div className="mb">{children}</div></div></div>
}
