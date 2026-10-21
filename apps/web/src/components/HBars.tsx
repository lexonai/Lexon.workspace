export default function HBars({ items, suffix = '', color = 'bg-brand' }: { items: { label: string; value: number }[]; suffix?: string; color?: string }) {
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <ul className="space-y-3">
      {items.map(i => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between text-sm"><span className="truncate">{i.label}</span><span className="text-slate-500">{i.value}{suffix}</span></div>
          <div className="h-1.5 rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}
