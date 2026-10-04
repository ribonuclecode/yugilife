import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { useReducedMotion } from "framer-motion"

import { foregroundForCssColor } from "@/lib/color-contrast"

export const FIGURE_TYPE = {
  title: "text-[18px] leading-[1.35] font-medium tracking-[-0.01em]",
  heading: "text-title font-medium",
  label: "text-subtitle",
  value: "text-title font-medium",
  description: "text-subtitle leading-[1.6]",
  footnote: "text-subtitle leading-[1.6]",
  table: "text-subtitle",
  axis: "text-caption",
  note: "text-caption",
} as const

export const CHART_ACCENT = "var(--chart-accent)"

const CHART_RAMP = [
  "var(--chart-ramp-1)",
  "var(--chart-ramp-2)",
  "var(--chart-ramp-3)",
  "var(--chart-ramp-4)",
] as const

export function chartRampPosition(index: number, length: number) {
  if (length <= 1) return 0
  return Math.min(
    CHART_RAMP.length - 1,
    Math.round((index / (length - 1)) * (CHART_RAMP.length - 1)),
  )
}

export function chartRampStep(index: number, length: number) {
  return CHART_RAMP[chartRampPosition(index, length)] ?? CHART_RAMP[0]
}

export function useRampInks() {
  const [inks, setInks] = useState<readonly string[]>(() =>
    CHART_RAMP.map(() => "var(--user-accent-foreground)"),
  )

  useEffect(() => {
    if (typeof document === "undefined") return
    const probe = document.createElement("span")
    probe.setAttribute("aria-hidden", "true")
    probe.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none"
    document.body.append(probe)

    const measure = () => {
      const backdrop = getComputedStyle(document.body).backgroundColor
      setInks(
        CHART_RAMP.map((token) => {
          probe.style.color = token
          return foregroundForCssColor(getComputedStyle(probe).color, backdrop)
        }),
      )
    }
    measure()

    const observer = new MutationObserver(measure)
    observer.observe(document.documentElement, { attributeFilter: ["class", "style"] })
    return () => {
      observer.disconnect()
      probe.remove()
    }
  }, [])

  return inks
}

const CHART_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const

export function chartSlot(index: number) {
  return CHART_SLOTS[index] ?? CHART_SLOTS[0]
}

export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setWidth(element.clientWidth)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

export function useChartReveal<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setRevealed(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setRevealed(true)
        observer.disconnect()
      },
      { threshold: 0.25 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, revealed] as const
}

export const CHART_DRAW = {
  line: { duration: 0.9, ease: "easeInOut" },
  sparkline: { duration: 0.6, ease: "easeInOut" },
  afterLine: { delay: 0.75, duration: 0.3 },
  afterBar: { delay: 0.22, duration: 0.25 },
} as const

export function chartStagger(index: number, reduceMotion: boolean) {
  return reduceMotion ? 0 : index * 0.055
}

export function useChartMotion() {
  return useReducedMotion() === true
}
