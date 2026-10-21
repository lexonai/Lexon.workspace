import { useEffect, useRef } from 'react'

// Makes a page exactly as tall as the visible area under the header, so the page itself never scrolls,
// slides sideways or pinch-zooms. Only elements inside it that opt in (overflow-y-auto) scroll.
export function useFixedPage<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const prev = { overflow: root.style.overflow, touch: root.style.touchAction, over: root.style.overscrollBehavior }
    root.style.overflow = 'hidden'; root.style.touchAction = 'pan-y'; root.style.overscrollBehavior = 'none'
    const fit = () => {
      const main = el.closest('main')
      const top = main ? main.getBoundingClientRect().top + parseFloat(getComputedStyle(main).paddingTop) : el.getBoundingClientRect().top
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) : 0
      el.style.height = `${Math.max(320, Math.floor(window.innerHeight - top - bottom))}px`
    }
    window.scrollTo(0, 0); fit()
    window.addEventListener('resize', fit)
    window.visualViewport?.addEventListener('resize', fit)
    return () => {
      window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit)
      root.style.overflow = prev.overflow; root.style.touchAction = prev.touch; root.style.overscrollBehavior = prev.over
    }
  }, [])
  return ref
}
