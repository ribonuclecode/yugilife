import { useCallback, useEffect, useRef } from "react"

import type { KeyboardEvent } from "react"
import type { ArtworkTransform } from "yugilife-core"

export function useRafCoalescedArtworkTransform(onChange: (transform: ArtworkTransform) => void) {
  const onChangeRef = useRef(onChange)
  const pendingRef = useRef<ArtworkTransform | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const flush = useCallback(() => {
    if (frameRef.current !== undefined) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }
    const pending = pendingRef.current
    pendingRef.current = undefined
    if (pending) onChangeRef.current(pending)
  }, [])

  const schedule = useCallback((transform: ArtworkTransform) => {
    pendingRef.current = transform
    if (frameRef.current !== undefined) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined
      const pending = pendingRef.current
      pendingRef.current = undefined
      if (pending) onChangeRef.current(pending)
    })
  }, [])

  const update = useCallback(
    (
      current: ArtworkTransform,
      updateTransform: (transform: ArtworkTransform) => ArtworkTransform,
    ) => {
      schedule(updateTransform(pendingRef.current ?? current))
    },
    [schedule],
  )

  useEffect(() => () => flush(), [flush])

  return { flush, schedule, update }
}

// Keyboard nudges share the slider step so both land on the same values.
export const POSITION_STEP = 0.002
const POSITION_COARSE_STEP = 0.01

export function formatPosition(value: number) {
  const percent = Number((value * 100).toFixed(3))
  return `${percent > 0 ? "+" : ""}${percent}%`
}

export function positionNudge(event: KeyboardEvent<HTMLDivElement>, axis: "x" | "y") {
  if (event.ctrlKey || event.metaKey) return undefined
  const arrowKey = event.key.startsWith("Arrow")
  const direction =
    axis === "x"
      ? event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowRight"
          ? 1
          : undefined
      : event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowDown"
          ? 1
          : undefined
  if (direction === undefined) {
    if (arrowKey) {
      event.preventDefault()
      event.stopPropagation()
    }
    return undefined
  }
  event.preventDefault()
  event.stopPropagation()
  const magnitude = event.shiftKey ? POSITION_COARSE_STEP : POSITION_STEP
  return direction * magnitude
}
