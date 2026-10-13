import { useId, useState } from 'react'
import type { SeriesPoint } from '../types'

// Dependency-free SVG charts with gradients, smooth curves, hover tooltips and entrance animations.
const PALETTE = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']
export const palette = (i: number) => PALETTE[i % PALETTE.length]

function smooth(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`
  }
  return d
}
const nice = (max: number) => { const m = Math.max(4, max); const step = Math.pow(10, Math.floor(Math.log10(m / 4))); const f = [1, 2, 5, 10].find(k => m / 4 <= k * step) ?? 10; return Math.ceil(m / (f * step)) * f * step }

export function AreaChart({ data, color = '#2563eb', height = 240, unit = '' }: { data: SeriesPoint[]; color?: string; height?: number; unit?: string }) {
  const id = useId().replace(/:/g, ''); const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = height, P = { l: 34, r: 14, t: 16, b: 28 }
  const max = nice(Math.max(...data.map(d => d.value), 0))
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1)
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }))
  const line = smooth(pts)
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x},${H - P.b} L${pts[0].x},${H - P.b} Z` : ''
  const step = Math.ceil(data.length / 7)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Area chart" onMouseLeave={() => setHover(null)}
        onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (data.length - 1))))) }}>
        <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0, 0.25, 0.5, 0.75, 1].map(t => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} stroke="#eef1f6" strokeDasharray={t ? '3 4' : ''} /><text x={P.l - 8} y={y(max * t) + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(max * t)}</text></g>)}
        {area && <path d={area} fill={`url(#g${id})`} className="animate-fade" />}
        {line && <path d={line} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" pathLength={1} className="draw-line" />}
        {hover !== null && <><line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke={color} strokeOpacity=".25" /><circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill="#fff" stroke={color} strokeWidth="2.5" /></>}
        {data.map((d, i) => i % step === 0 && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.label}</text>)}
      </svg>
      {hover !== null && <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-pop" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100 - 2}%` }}><b>{data[hover].value}{unit}</b> <span className="text-slate-300">{data[hover].label}</span></div>}
    </div>
  )
}

export function GroupedBars({ labels, series, height = 240 }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = height, P = { l: 34, r: 12, t: 16, b: 28 }
  const max = nice(Math.max(0, ...series.flatMap(s => s.values)))
  const gw = (W - P.l - P.r) / Math.max(1, labels.length), bw = Math.min(16, (gw * 0.7) / series.length)
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  const step = Math.ceil(labels.length / 8)
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-slate-500">{series.map(s => <span key={s.name} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}</div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grouped bar chart" onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map(t => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} stroke="#eef1f6" strokeDasharray={t ? '3 4' : ''} /><text x={P.l - 8} y={y(max * t) + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(max * t)}</text></g>)}
          {labels.map((l, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={P.l + i * gw} y={P.t} width={gw} height={H - P.t - P.b} fill={hover === i ? '#f1f5f9' : 'transparent'} rx="6" />
              {series.map((s, k) => { const v = s.values[i] ?? 0; const x0 = P.l + i * gw + gw / 2 - (bw * series.length) / 2 + k * bw; return <rect key={s.name} x={x0} y={y(v)} width={bw - 2} height={Math.max(0, H - P.b - y(v))} rx="3" fill={s.color} className="bar-grow" style={{ animationDelay: `${i * 12}ms` }} /> })}
              {i % step === 0 && <text x={P.l + i * gw + gw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{l}</text>}
            </g>
          ))}
        </svg>
        {hover !== null && <div className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-pop" style={{ left: `${((P.l + hover * gw + gw / 2) / W) * 100}%`, top: 0 }}><div className="text-slate-300">{labels[hover]}</div>{series.map(s => <div key={s.name}><i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.name}: <b>{s.values[hover] ?? 0}</b></div>)}</div>}
      </div>
    </div>
  )
}

export function DonutChart({ items, centerLabel = 'Total' }: { items: { label: string; value: number; color?: string }[]; centerLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = items.reduce((s, i) => s + i.value, 0)
  const R = 54, C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Donut chart">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
          {total > 0 && items.map((it, i) => { const len = (it.value / total) * C; const el = <circle key={it.label} cx="70" cy="70" r={R} fill="none" stroke={it.color ?? palette(i)} strokeWidth={hover === i ? 19 : 16} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} strokeLinecap="butt" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'stroke-width .15s' }} />; acc += len; return el })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-2xl font-semibold leading-none">{hover !== null ? items[hover].value : total}</p><p className="mt-1 text-[11px] text-slate-400">{hover !== null ? items[hover].label : centerLabel}</p></div></div>
      </div>
      <ul className="min-w-[140px] flex-1 space-y-2 text-sm">
        {items.map((it, i) => <li key={it.label} className="flex items-center justify-between gap-3" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: it.color ?? palette(i) }} />{it.label}</span><span className="text-slate-500">{it.value}{total ? ` · ${Math.round((it.value / total) * 100)}%` : ''}</span></li>)}
      </ul>
    </div>
  )
}

export function Sparkline({ values, color = '#2563eb' }: { values: number[]; color?: string }) {
  const id = useId().replace(/:/g, ''); const W = 96, H = 32, max = Math.max(1, ...values)
  const pts = values.map((v, i) => ({ x: (i * W) / Math.max(1, values.length - 1), y: H - 3 - (v / max) * (H - 6) }))
  const line = smooth(pts)
  if (!line) return null
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-24" aria-hidden><defs><linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".25" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs><path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#s${id})`} /><path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" pathLength={1} className="draw-line" /></svg>
}
