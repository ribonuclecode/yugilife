import { useEffect, useRef } from "react"

import { useReducedMotion } from "framer-motion"

const formatter = new Intl.NumberFormat("en-US")
const durationMs = 1400

export function CountUp({ start, value }: { start: boolean; value: number }) {
  const reducedMotion = useReducedMotion() ?? false
  const ref = useRef<HTMLSpanElement>(null)
  const final = formatter.format(value)

  useEffect(() => {
    const element = ref.current
    if (!element || !start || reducedMotion) return
    let frame = 0
    const begin = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - begin) / durationMs)
      const eased = 1 - (1 - progress) ** 4
      element.textContent = formatter.format(Math.round(value * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      element.textContent = final
    }
  }, [final, reducedMotion, start, value])

  return (
    <span className="tabular-nums">
      <span aria-hidden="true" ref={ref}>
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  )
}
