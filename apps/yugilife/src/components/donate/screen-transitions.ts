import { animate, stagger } from "framer-motion"

import { createPathInterpolator } from "@/lib/path-morph"

import { donateTiming, ease, finish, prefersReducedMotion } from "./motion"

import type { AnimationHandle } from "./motion"

export interface ScreenParts {
  readonly glow: HTMLElement
  readonly screen: HTMLElement
  readonly fogCanvas: HTMLCanvasElement
  readonly sheet: HTMLElement
  readonly band: SVGPathElement
}

export interface Arrival {
  readonly ready: Promise<void>
  cancel(): void
}

function coverRadius(x: number, y: number) {
  const { innerHeight, innerWidth } = window
  return Math.max(
    Math.hypot(x, y),
    Math.hypot(innerWidth - x, y),
    Math.hypot(x, innerHeight - y),
    Math.hypot(innerWidth - x, innerHeight - y),
  )
}

export function arrive(
  { fogCanvas, glow, screen, sheet }: ScreenParts,
  x: number,
  y: number,
): Arrival {
  const reduced = prefersReducedMotion()
  const reach = coverRadius(x, y)
  const handles = new Set<AnimationHandle>()

  glow.style.setProperty("--gx", `${x}px`)
  glow.style.setProperty("--gy", `${y}px`)
  glow.style.setProperty("--glow", "22px")
  glow.style.opacity = "1"
  handles.add(
    animate(22, reach * 1.35, {
      duration: reduced ? 0.08 : 0.4,
      ease: ease.power2Out,
      onUpdate: (radius) => glow.style.setProperty("--glow", `${radius}px`),
    }),
  )
  handles.add(
    animate(1, 0, {
      delay: reduced ? 0.06 : 0.22,
      duration: reduced ? 0.06 : 0.54,
      ease: ease.power2InOut,
      onUpdate: (opacity) => {
        glow.style.opacity = String(opacity)
      },
    }),
  )

  fogCanvas.style.transformOrigin = `${x}px ${y}px`
  handles.add(
    animate(0, 1, {
      duration: reduced ? 0.05 : 0.86,
      ease: ease.power2Out,
      onUpdate: (t) => {
        fogCanvas.style.filter = `brightness(${1.32 - 0.32 * t}) saturate(${0.55 + 0.45 * t})`
        fogCanvas.style.transform = `scale(${1.14 - 0.14 * t})`
      },
    }),
  )

  handles.add(
    animate(
      Array.from(sheet.children),
      { opacity: [0, 1], y: [14, 0] },
      {
        delay: stagger(reduced ? 0 : 0.036, { startDelay: donateTiming.arrive * 0.6 }),
        duration: reduced ? 0.001 : 0.38,
        ease: ease.power3Out,
      },
    ),
  )

  screen.style.opacity = "0"
  const fade = animate(0, 1, {
    duration: reduced ? 0.1 : donateTiming.arrive * 0.9,
    ease: ease.power3Out,
    onUpdate: (opacity) => {
      screen.style.opacity = String(opacity)
    },
  })
  handles.add(fade)

  return {
    ready: fade.then(() => {
      screen.style.opacity = ""
    }),
    cancel() {
      finish(handles)
      handles.clear()
      glow.style.opacity = "0"
      fogCanvas.style.filter = ""
      fogCanvas.style.transform = ""
    },
  }
}

const bandPaths = {
  cover: {
    empty: "M 0 0 V 0 Q .5 0 1 0 V 0 z",
    curve: "M 0 0 V .5 Q .5 1 1 .5 V 0 z",
    full: "M 0 0 V 1 Q .5 1 1 1 V 0 z",
  },
  clear: {
    full: "M 0 1 V 0 Q .5 0 1 0 V 1 z",
    curve: "M 0 1 V .5 Q .5 1 1 .5 V 1 z",
    empty: "M 0 1 V 1 Q .5 1 1 1 V 1 z",
  },
} as const

const bandTiming = {
  coverLead: 0.364,
  coverSettle: 0.106,
  clearLead: 0.109,
  clearCarry: 0.461,
} as const

type Phase = readonly [to: string, duration: number, easing: (t: number) => number]

async function morph(band: SVGPathElement, from: string, phases: readonly Phase[]) {
  let previous = from
  band.setAttribute("d", previous)
  for (const [to, duration, easing] of phases) {
    const shape = createPathInterpolator(previous, to)
    await animate(0, 1, {
      duration,
      ease: easing,
      onUpdate: (progress) => band.setAttribute("d", shape(progress)),
    })
    previous = to
  }
}

export function sink({ band, sheet }: ScreenParts) {
  const reduced = prefersReducedMotion()
  const cover = bandTiming.coverLead + bandTiming.coverSettle
  const scale = reduced ? 0.06 / cover : 1
  return Promise.all([
    animate(
      Array.from(sheet.children),
      { opacity: 0, y: 36 },
      { duration: cover * scale * 0.85, ease: ease.power4In },
    ),
    morph(band, bandPaths.cover.empty, [
      [bandPaths.cover.curve, bandTiming.coverLead * scale, ease.power4In],
      [bandPaths.cover.full, bandTiming.coverSettle * scale, ease.power4Out],
    ]),
  ]).then(() => undefined)
}

export async function sweepOut({ band }: ScreenParts) {
  const reduced = prefersReducedMotion()
  const clear = bandTiming.clearLead + bandTiming.clearCarry
  const scale = reduced ? 0.06 / clear : 1
  await morph(band, bandPaths.clear.full, [
    [bandPaths.clear.curve, bandTiming.clearLead * scale, ease.power4In],
    [bandPaths.clear.empty, bandTiming.clearCarry * scale, ease.power4Out],
  ])
  band.setAttribute("d", bandPaths.cover.empty)
}
