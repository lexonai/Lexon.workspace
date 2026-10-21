// LW mark.
// Exact brand mark: black rounded tile, white "LW" (same geometry as public/icon.svg).
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className="shrink-0 select-none" role="img" aria-label="Lexon Workspace logo">
      <rect width="512" height="512" rx="112" fill="#000" />
      <text x="256" y="322" fontFamily="'Arial Black', Arial, 'Liberation Sans', sans-serif" fontSize="230" fontWeight="900" letterSpacing="-14" textAnchor="middle" fill="#fff">LW</text>
    </svg>
  )
}
