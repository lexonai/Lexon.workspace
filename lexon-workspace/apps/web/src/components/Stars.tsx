import { Star } from 'lucide-react'

export default function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-400">Not rated</span>
  return (
    <span className="inline-flex" aria-label={`Rating ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14} className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  )
}
