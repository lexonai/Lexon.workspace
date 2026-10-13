import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react'
import { supabase } from '../supabase'
import { DEMO } from '../env'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar } from '../../components/ui'

// Real 1-to-1 WebRTC calling. State lives in Postgres (call_sessions); SDP/ICE travel over Supabase Realtime broadcast.
// Add TURN (VITE_TURN_*) for users behind strict NATs. Group calls / screen share can reuse this signaling model.
export type CallKind = 'audio' | 'video'
interface Peer { id: string; name: string; avatar: string | null }
interface Active { id: string; kind: CallKind; peer: Peer; role: 'caller' | 'callee'; phase: 'ringing' | 'connecting' | 'connected' }
interface Incoming { id: string; kind: CallKind; peer: Peer }
interface Ctx { startCall: (workspaceId: string, otherId: string, kind: CallKind) => Promise<void> }
const CallCtx = createContext<Ctx>({ startCall: async () => {} })
export const useCall = () => useContext(CallCtx)

const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
const turn = import.meta.env.VITE_TURN_URL as string | undefined
if (turn) ICE.push({ urls: turn, username: import.meta.env.VITE_TURN_USER as string, credential: import.meta.env.VITE_TURN_PASS as string })
const FINAL = ['declined', 'ended', 'missed', 'cancelled']

async function peerOf(id: string): Promise<Peer> {
  const { data } = await supabase.from('profiles').select('full_name,avatar_url').eq('id', id).maybeSingle()
  return { id, name: data?.full_name || 'Someone', avatar: data?.avatar_url ?? null }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const [active, setActive] = useState<Active | null>(null)
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const activeRef = useRef<Active | null>(null)
  const incomingRef = useRef<Incoming | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const local = useRef<MediaStream | null>(null)
  const pending = useRef<RTCIceCandidateInit[]>([])
  const ringTimer = useRef<ReturnType<typeof setTimeout>>()
  const remoteEl = useRef<HTMLVideoElement>(null)
  const localEl = useRef<HTMLVideoElement>(null)
  activeRef.current = active; incomingRef.current = incoming

  const send = (payload: Record<string, unknown>) => { chan.current?.send({ type: 'broadcast', event: 'signal', payload }) }

  const finish = useCallback((msg?: string) => {
    clearTimeout(ringTimer.current)
    local.current?.getTracks().forEach(t => t.stop()); local.current = null
    pc.current?.close(); pc.current = null
    if (chan.current) { supabase.removeChannel(chan.current); chan.current = null }
    pending.current = []
    setActive(null); setMuted(false); setCamOff(false)
    if (msg) { setNotice(msg); setTimeout(() => setNotice(null), 4000) }
  }, [])

  const setStatus = async (id: string, status: string, extra: Record<string, unknown> = {}) => {
    await supabase.from('call_sessions').update({ status, ...extra }).eq('id', id)
  }

  const makePc = (callId: string) => {
    const p = new RTCPeerConnection({ iceServers: ICE })
    local.current?.getTracks().forEach(t => p.addTrack(t, local.current!))
    p.ontrack = e => { if (remoteEl.current) remoteEl.current.srcObject = e.streams[0] }
    p.onicecandidate = e => { if (e.candidate) send({ type: 'ice', candidate: e.candidate.toJSON() }) }
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') setActive(a => a && { ...a, phase: 'connected' })
      if (p.connectionState === 'failed') { void setStatus(callId, 'ended', { ended_at: new Date().toISOString() }); finish('Connection failed. A TURN server may be needed on this network.') }
    }
    pc.current = p
    return p
  }

  const flush = async () => { for (const c of pending.current) { try { await pc.current?.addIceCandidate(c) } catch { /* stale */ } } pending.current = [] }

  const onSignal = async (m: any) => {
    const p = pc.current; if (!p) return
    if (m.type === 'ready') { const o = await p.createOffer(); await p.setLocalDescription(o); send({ type: 'offer', sdp: o }) }
    else if (m.type === 'offer') { await p.setRemoteDescription(m.sdp); await flush(); const a = await p.createAnswer(); await p.setLocalDescription(a); send({ type: 'answer', sdp: a }) }
    else if (m.type === 'answer') { await p.setRemoteDescription(m.sdp); await flush() }
    else if (m.type === 'ice') { if (p.remoteDescription) { try { await p.addIceCandidate(m.candidate) } catch { /* ignore */ } } else pending.current.push(m.candidate) }
  }

  const openChannel = (callId: string) => new Promise<void>(resolve => {
    const ch = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'signal' }, ({ payload }) => { void onSignal(payload) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: `id=eq.${callId}` }, p => {
        const s = (p.new as any).status as string
        if (s === 'accepted') setActive(a => a && a.phase === 'ringing' ? { ...a, phase: 'connecting' } : a)
        if (FINAL.includes(s) && activeRef.current?.id === callId) finish(s === 'declined' ? 'Call declined' : s === 'missed' ? 'No answer' : undefined)
      })
      .subscribe(st => { if (st === 'SUBSCRIBED') resolve() })
    chan.current = ch
  })

  const media = async (kind: CallKind) => {
    try { local.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' }); return true }
    catch { setNotice('Microphone/camera permission is required for calls.'); setTimeout(() => setNotice(null), 4000); return false }
  }

  const startCall = useCallback(async (workspaceId: string, otherId: string, kind: CallKind) => {
    if (!userId || DEMO || activeRef.current) return
    if (!(await media(kind))) return
    const { data, error } = await supabase.from('call_sessions').insert({ workspace_id: workspaceId, caller_id: userId, callee_id: otherId, kind }).select('id').single()
    if (error || !data) { local.current?.getTracks().forEach(t => t.stop()); setNotice(error?.message ?? 'Could not start call'); return }
    const peer = await peerOf(otherId)
    setActive({ id: data.id, kind, peer, role: 'caller', phase: 'ringing' })
    makePc(data.id)
    await openChannel(data.id)
    ringTimer.current = setTimeout(async () => { if (activeRef.current?.id === data.id && activeRef.current?.phase === 'ringing') { await setStatus(data.id, 'missed', { ended_at: new Date().toISOString() }); finish('No answer') } }, 45000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const accept = async () => {
    const inc = incomingRef.current; if (!inc || activeRef.current) return
    if (!(await media(inc.kind))) { void decline(); return }
    setIncoming(null)
    setActive({ id: inc.id, kind: inc.kind, peer: inc.peer, role: 'callee', phase: 'connecting' })
    makePc(inc.id)
    await openChannel(inc.id)
    await setStatus(inc.id, 'accepted', { answered_at: new Date().toISOString() })
    send({ type: 'ready' })
  }
  const decline = async () => {
    const inc = incomingRef.current; if (!inc) return
    setIncoming(null)
    await setStatus(inc.id, 'declined', { ended_at: new Date().toISOString() })
  }
  const hangup = async () => {
    const a = activeRef.current; if (!a) return
    await setStatus(a.id, a.role === 'caller' && a.phase === 'ringing' ? 'cancelled' : 'ended', { ended_at: new Date().toISOString() })
    finish()
  }

  // Incoming calls (RLS only delivers rows where I'm the callee)
  useEffect(() => {
    if (!userId || DEMO) return
    const ch = supabase.channel(`incoming:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${userId}` }, async p => {
        const r = p.new as any
        if (r.status !== 'ringing') return
        if (activeRef.current || incomingRef.current) { await setStatus(r.id, 'declined', { ended_at: new Date().toISOString() }); return } // busy
        setIncoming({ id: r.id, kind: r.kind, peer: await peerOf(r.caller_id) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${userId}` }, p => {
        const r = p.new as any
        if (incomingRef.current?.id === r.id && r.status !== 'ringing') setIncoming(null) // caller cancelled / missed
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  useEffect(() => { if (active && localEl.current && local.current) localEl.current.srcObject = local.current }, [active?.id, active?.phase])
  useEffect(() => () => finish(), [finish])

  const toggleMic = () => { local.current?.getAudioTracks().forEach(t => { t.enabled = muted }); setMuted(!muted) }
  const toggleCam = () => { local.current?.getVideoTracks().forEach(t => { t.enabled = camOff }); setCamOff(!camOff) }

  return (
    <CallCtx.Provider value={{ startCall }}>
      {children}
      {notice && <div role="status" className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">{notice}</div>}
      {incoming && !active && (
        <div className="fixed inset-0 z-[65] grid place-items-center bg-slate-900/50 p-4" role="alertdialog" aria-label="Incoming call">
          <div className="card w-full max-w-xs space-y-4 p-6 text-center">
            <div className="mx-auto w-fit"><Avatar name={incoming.peer.name} src={incoming.peer.avatar} size={72} /></div>
            <div><p className="font-semibold">{incoming.peer.name}</p><p className="text-sm text-slate-500">Incoming {incoming.kind} call…</p></div>
            <div className="flex justify-center gap-6">
              <button onClick={decline} aria-label="Decline" className="grid h-14 w-14 place-items-center rounded-full bg-red-500 text-white"><PhoneOff size={22} /></button>
              <button onClick={accept} aria-label="Accept" className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white"><Phone size={22} /></button>
            </div>
          </div>
        </div>
      )}
      {active && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900 text-white">
          <div className="relative flex-1">
            <video ref={remoteEl} autoPlay playsInline className={active.kind === 'video' ? 'h-full w-full object-cover' : 'absolute h-0 w-0 opacity-0'} />
            {(active.kind === 'audio' || active.phase !== 'connected') && (
              <div className="absolute inset-0 grid place-items-center"><div className="text-center"><div className="mx-auto w-fit"><Avatar name={active.peer.name} src={active.peer.avatar} size={96} /></div>
                <p className="mt-4 text-xl font-semibold">{active.peer.name}</p>
                <p className="text-sm text-slate-300">{active.phase === 'ringing' ? 'Ringing…' : active.phase === 'connecting' ? 'Connecting…' : 'Connected'}</p></div></div>
            )}
            {active.kind === 'video' && <video ref={localEl} autoPlay playsInline muted className="absolute bottom-4 right-4 h-36 w-24 rounded-xl border border-white/20 object-cover sm:h-44 sm:w-32" />}
          </div>
          <div className="flex justify-center gap-5 p-6">
            <button onClick={toggleMic} aria-label={muted ? 'Unmute' : 'Mute'} className={`grid h-14 w-14 place-items-center rounded-full ${muted ? 'bg-white text-slate-900' : 'bg-white/15'}`}>{muted ? <MicOff size={22} /> : <Mic size={22} />}</button>
            {active.kind === 'video' && <button onClick={toggleCam} aria-label={camOff ? 'Camera on' : 'Camera off'} className={`grid h-14 w-14 place-items-center rounded-full ${camOff ? 'bg-white text-slate-900' : 'bg-white/15'}`}>{camOff ? <VideoOff size={22} /> : <Video size={22} />}</button>}
            <button onClick={hangup} aria-label="End call" className="grid h-14 w-14 place-items-center rounded-full bg-red-500"><PhoneOff size={22} /></button>
          </div>
        </div>
      )}
    </CallCtx.Provider>
  )
}
