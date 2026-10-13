import type { SeriesPoint } from '../types'

export default function BarChart({ data, color = '#2563eb' }: { data: SeriesPoint[]; color?: string }) {
  const W = 640, H = 220, P = { l: 32, r: 12, t: 12, b: 28 }
  const max = Math.max(4, ...data.map(d => d.value))
  const step = Math.ceil(data.length / 8)
  const bw = (W - P.l - P.r) / Math.max(1, data.length)
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
      {[0, 0.5, 1].map(t => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} stroke="#eef1f6" /><text x={P.l - 6} y={y(max * t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(max * t)}</text></g>)}
      {data.map((d, i) => (
        <g key={i}>
          <rect x={P.l + i * bw + bw * 0.15} width={bw * 0.7} y={y(d.value)} height={H - P.b - y(d.value)} rx="3" fill={color} />
          {i % step === 0 && <text x={P.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.label}</text>}
        </g>
      ))}
    </svg>
  )
}
