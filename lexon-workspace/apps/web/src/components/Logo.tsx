// LW mark: black tile, sharp white letters.
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.4 }} className="grid shrink-0 select-none place-items-center rounded-[22%] bg-black font-extrabold leading-none tracking-[-0.06em] text-white" aria-label="Lexon Workspace logo">LW</span>
  )
}
