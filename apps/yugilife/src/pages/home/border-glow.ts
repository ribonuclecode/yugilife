import { useEffect } from "react"

import type { RefObject } from "react"

import "./border-glow.css"

const fullSpeed = 1.6
const holdMs = 450
const fadeMs = 900
const riseMs = 140

export function useBorderGlow(ref: RefObject<HTMLElement | null>, enabled = false) {
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element || typeof window.matchMedia !== "function") return
    if (!window.matchMedia("(pointer: fine)").matches) return
    element.dataset.borderGlow = ""

    let energy = 0
    let glow = 0
    let frame = 0
    let lastFrame = 0
    let lastX = 0
    let lastY = 0
    let lastTime = Number.NEGATIVE_INFINITY

    const step = (now: number) => {
      const elapsed = Math.min(64, now - lastFrame)
      lastFrame = now
      if (now - lastTime > holdMs) energy *= Math.exp(-elapsed / fadeMs)
      glow += (energy - glow) * (1 - Math.exp(-elapsed / riseMs))
      if (energy < 0.004 && glow < 0.004) {
        energy = 0
        glow = 0
        frame = 0
      } else {
        frame = requestAnimationFrame(step)
      }
      element.style.setProperty("--bento-glow", glow.toFixed(3))
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return
      const elapsed = event.timeStamp - lastTime
      const distance = Math.hypot(event.clientX - lastX, event.clientY - lastY)
      lastX = event.clientX
      lastY = event.clientY
      lastTime = event.timeStamp
      element.style.setProperty("--bento-pointer-x", `${event.clientX}px`)
      element.style.setProperty("--bento-pointer-y", `${event.clientY}px`)
      if (elapsed > 100) return
      energy = Math.max(energy, Math.min(1, distance / Math.max(1, elapsed) / fullSpeed))
      if (!frame) {
        lastFrame = performance.now()
        frame = requestAnimationFrame(step)
      }
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      cancelAnimationFrame(frame)
      delete element.dataset.borderGlow
      for (const property of ["--bento-glow", "--bento-pointer-x", "--bento-pointer-y"]) {
        element.style.removeProperty(property)
      }
    }
  }, [enabled, ref])
}
