import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, RefreshCw } from 'lucide-react'
import { DEMO } from '../../lib/env'
import { callFn } from '../../lib/functions'
import { useWorkspace } from '../../lib/useWorkspace'

// Lexon Office runs on its own server but has NO login or password: it opens only from here, with a short-lived
// single-sign-on token minted by the office-sso function from your Workspace session and role.
export default function Office() {
  const { ws, can } = useWorkspace()
  const [src, setSrc] = useState<string | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [noAccess, setNoAccess] = useState(false)
  const [nonce, setNonce] = useState(0)

  const open = useCallback(async () => {
    if (!ws || DEMO) return
    setErr(null); setSrc(null)
    try {
      setLinked(true)
      const r = await callFn<{ url: string; token: string }>('central-api', { service: 'office', workspaceId: ws.workspaceId, action: 'token' })
      const u = new URL(r.url.replace(/\/$/, '') + '/office/')
      u.searchParams.set('embed', '1'); u.searchParams.set('officeToken', r.token); u.searchParams.set('officeApi', r.url.replace(/\/$/, ''))
      setSrc(u.toString())
    } catch (e) { const m = (e as Error).message; if (/not linked/i.test(m)) setLinked(false); else if (/do not have access|403/i.test(m)) setNoAccess(true); else setErr(m) }
  }, [ws])
  useEffect(() => { open() }, [open, nonce])
  // Tokens last 12 h: mint a new one before they expire while the page stays open.
  useEffect(() => { const t = setInterval(() => setNonce(n => n + 1), 11 * 3600e3); return () => clearInterval(t) }, [])

  if (DEMO) return <div className="card p-10 text-center text-slate-500">Office opens here once Lexon Office is linked.</div>
  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[520px] flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between"><h1 className="text-2xl font-semibold">Office</h1>
        {src && <button onClick={() => setNonce(n => n + 1)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><RefreshCw size={13} /> Reload</button>}</div>
      {noAccess && <div className="card p-10 text-center" role="alert"><p className="text-lg font-semibold">No access to Lexon Office</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Your account does not have the Office permission. Ask an Admin to grant it in your member profile.</p></div>}
      {err && <p role="alert" className="shrink-0 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {linked === false && (
        <div className="card p-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-white"><Building2 size={26} /></span>
          <p className="mt-4 text-lg font-semibold">Lexon Office is not linked yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{can('integrations.manage') ? 'Link your Office server once. After that everyone with a Workspace account opens Office from here with no extra login.' : 'Ask an Admin to link Lexon Office in Integrations.'}</p>
          {can('integrations.manage') && <Link to="/integrations" className="btn-primary mt-4 inline-flex">Link Office</Link>}
        </div>
      )}
      {src && <iframe key={nonce} title="Lexon Office" src={src} allow="microphone; fullscreen; autoplay" className="min-h-0 w-full flex-1 rounded-2xl border border-line bg-white" />}
      {linked && !src && !err && <p className="text-sm text-slate-400">Opening Office…</p>}
    </div>
  )
}
