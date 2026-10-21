import type { SeriesPoint } from '../types'

// Dependency-free SVG chart; values come from the database.
export default function LineChart({ data }: { data: SeriesPoint[] }) {
  const W = 640, H = 220, P = { l: 32, r: 12, t: 12, b: 28 }
  const max = Math.max(5, ...data.map(d => d.value))
  const step = Math.ceil(data.length / 8)
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1)
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ')
  const area = `${line} L${x(data.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(max * t))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tasks completed per day">
      {ticks.map(t => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#eef1f6" />
          <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{t}</text>
        </g>
      ))}
      <path d={area} fill="#2563eb" opacity="0.08" />
      <path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
          {i % step === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.label}</text>}
        </g>
      ))}
    </svg>
  )
}
