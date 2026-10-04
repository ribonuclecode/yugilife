import { animate } from "framer-motion"

import type { ValueAnimationTransition } from "framer-motion"

export const donateTiming = {
  beat: 1.1,
  spin: 3.4,
  swell: 0.34,
  fall: 0.34,
  arrive: 0.58,
  back: 0.42,
  backDelay: 0.15,
  settle: 0.22,
} as const

export const ease = {
  power2In: (t: number) => t * t,
  power2Out: (t: number) => 1 - (1 - t) * (1 - t),
  power2InOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  fallIn: (t: number) => t * t * (0.3 + 0.7 * t),
  power3Out: (t: number) => 1 - (1 - t) ** 3,
  power4In: (t: number) => t ** 4,
  power4Out: (t: number) => 1 - (1 - t) ** 4,
  backOut: (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
} as const

export const donateSpring = {
  fold: { type: "spring", duration: 0.34, bounce: 0 },
  tile: { type: "spring", duration: 0.46, bounce: 0.28 },
  stagger: 0.07,
} as const

export type AnimationHandle = ReturnType<typeof animate>

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function finish(handles: Iterable<AnimationHandle>) {
  for (const handle of handles) handle.complete()
}

export function tween<Key extends string>(
  target: Record<Key, number>,
  key: Key,
  to: number,
  options: Omit<ValueAnimationTransition<number>, "onUpdate">,
) {
  return animate(target[key], to, {
    ...options,
    onUpdate: (value) => {
      target[key] = value
    },
  })
}
