import { useEffect, useRef } from "react"

import { ArrowUpRight } from "lucide-react"

import type { CSSProperties } from "react"

const ribbon = [-2, -1, 0, 1, 2]
const loopMs = 900
const settleEase = "cubic-bezier(0.3, 0.6, 0.4, 1)"
const shortestSettleMs = 320

export function ArrowDisc({ className }: { className?: string }) {
  const ribbonRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = ribbonRef.current
    const tile = element?.closest<HTMLElement>(".bento-link")
    if (!element || !tile || typeof element.animate !== "function") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    let animation: Animation | undefined
    let running = false

    const stepPx = () =>
      parseFloat(getComputedStyle(element).getPropertyValue("--bento-arrow-step")) || 24
    const progress = (step: number) =>
      Math.min(1, Math.max(0, (parseFloat(getComputedStyle(element).translate) || 0) / step))
    const at = (step: number, steps: number) => ({
      translate: `${steps * step}px ${-steps * step}px`,
    })
    const startNow = (next: Animation, offsetMs = 0) => {
      const now = document.timeline.currentTime
      next.startTime = typeof now === "number" ? now - offsetMs : null
      if (next.startTime === null) next.currentTime = offsetMs
      return next
    }

    const run = () => {
      if (running) return
      running = true
      const step = stepPx()
      const from = progress(step)
      animation?.cancel()
      animation = startNow(
        element.animate([at(step, 0), at(step, 1)], {
          duration: loopMs,
          easing: "linear",
          iterations: Infinity,
        }),
        from * loopMs,
      )
    }

    const settle = () => {
      if (!running) return
      running = false
      const step = stepPx()
      const from = progress(step)
      animation?.cancel()
      animation = startNow(
        element.animate([at(step, from), at(step, 1)], {
          duration: Math.max(shortestSettleMs, 2 * (1 - from) * loopMs),
          easing: settleEase,
        }),
      )
    }

    const onFocus = () => {
      if (tile.matches(":focus-visible")) run()
    }
    const onBlur = () => {
      if (!tile.matches(":hover")) settle()
    }
    const onLeave = () => {
      if (!tile.matches(":focus-visible")) settle()
    }

    tile.addEventListener("pointerenter", run)
    tile.addEventListener("pointerleave", onLeave)
    tile.addEventListener("focus", onFocus)
    tile.addEventListener("blur", onBlur)
    return () => {
      tile.removeEventListener("pointerenter", run)
      tile.removeEventListener("pointerleave", onLeave)
      tile.removeEventListener("focus", onFocus)
      tile.removeEventListener("blur", onBlur)
      animation?.cancel()
    }
  }, [])

  return (
    <span aria-hidden="true" className={`bento-arrow ${className ?? ""}`}>
      <span ref={ribbonRef} className="bento-arrow-ribbon">
        {ribbon.map((step) => (
          <ArrowUpRight key={step} strokeWidth={1.5} style={{ "--step": step } as CSSProperties} />
        ))}
      </span>
    </span>
  )
}
