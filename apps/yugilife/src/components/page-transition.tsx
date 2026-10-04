import { useCallback, useId, useLayoutEffect, useRef, useState } from "react"

import { NavigationType, useLocation, useNavigationType } from "react-router"

import { createPathInterpolator } from "@/lib/path-morph"
import { cn } from "@/lib/utils"

import { LogoMark } from "./logo-mark"
import { PageTransitionReadyContext } from "./page-transition-ready"

import type { ReactNode } from "react"
import type { Location } from "react-router"

const paths = {
  enter: {
    unfilled: "M 0 1 V 1 Q .5 1 1 1 V 1 z",
    curve: "M 0 1 V .5 Q .5 0 1 .5 V 1 z",
    filled: "M 0 1 V 0 Q .5 0 1 0 V 1 z",
  },
  exit: {
    filled: "M 0 0 V 1 Q .5 1 1 1 V 0 z",
    curve: "M 0 0 V .5 Q .5 0 1 .5 V 0 z",
    unfilled: "M 0 0 V 0 Q .5 0 1 0 V 0 z",
  },
} as const

function easeInQuart(progress: number) {
  return progress ** 4
}

function easeOutQuart(progress: number) {
  return 1 - (1 - progress) ** 4
}

function transitionPath(
  path: SVGPathElement,
  from: string,
  to: string,
  duration: number,
  easing: (progress: number) => number,
  cancelRef: { current: (() => void) | null },
) {
  return new Promise<boolean>((resolve) => {
    const startedAt = performance.now()
    const interpolate = createPathInterpolator(from, to)
    let frameId = 0
    let cancelled = false

    const cancel = () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
      resolve(false)
    }
    cancelRef.current = cancel

    const frame = (now: number) => {
      if (cancelled) return

      const progress = Math.min(1, (now - startedAt) / duration)
      const d = interpolate(easing(progress))
      path.setAttribute("d", d)

      if (progress >= 1) {
        if (cancelRef.current === cancel) cancelRef.current = null
        resolve(true)
        return
      }

      frameId = window.requestAnimationFrame(frame)
    }

    frameId = window.requestAnimationFrame(frame)
  })
}

export function PageTransition({ children }: { children: (location: Location) => ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [isAnimating, setIsAnimating] = useState(false)
  const displayLocationRef = useRef(location)
  const pathRef = useRef<SVGPathElement>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const readyWaitCancelRef = useRef<(() => void) | null>(null)
  const routeReadyRef = useRef(true)
  const pendingRef = useRef<{ location: Location; navigationType: NavigationType } | null>(null)
  const runningRef = useRef(false)
  const scrollPositionsRef = useRef(new Map<string, { left: number; top: number }>())
  const clipId = useId().replace(/:/g, "")
  const pathId = `${clipId}-path`

  const setRouteReady = useCallback((ready: boolean) => {
    routeReadyRef.current = ready
  }, [])

  const waitForRouteReady = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      let frameId = 0
      let cancelled = false

      const cancel = () => {
        cancelled = true
        window.cancelAnimationFrame(frameId)
        resolve(false)
      }

      readyWaitCancelRef.current = cancel

      const check = () => {
        if (cancelled) return
        if (routeReadyRef.current || pendingRef.current) {
          if (readyWaitCancelRef.current === cancel) readyWaitCancelRef.current = null
          resolve(true)
          return
        }
        frameId = window.requestAnimationFrame(check)
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = window.requestAnimationFrame(check)
      })
    })
  }, [])

  useLayoutEffect(() => {
    if (!("scrollRestoration" in window.history)) return

    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useLayoutEffect(
    () => () => {
      cancelRef.current?.()
      cancelRef.current = null
      readyWaitCancelRef.current?.()
      readyWaitCancelRef.current = null
      pendingRef.current = null
    },
    [],
  )

  const sweep = useCallback(async () => {
    const path = pathRef.current
    if (!path || runningRef.current) return
    runningRef.current = true
    setIsAnimating(true)

    let covered = false
    try {
      while (pendingRef.current) {
        if (!covered) {
          scrollPositionsRef.current.set(displayLocationRef.current.key, {
            left: window.scrollX,
            top: window.scrollY,
          })

          path.setAttribute("d", paths.enter.unfilled)
          const entered = await transitionPath(
            path,
            paths.enter.unfilled,
            paths.enter.curve,
            620,
            easeInQuart,
            cancelRef,
          )
          if (!entered) return
          const filled = await transitionPath(
            path,
            paths.enter.curve,
            paths.enter.filled,
            180,
            easeOutQuart,
            cancelRef,
          )
          if (!filled) return
          covered = true
        }

        const { location: next, navigationType: type } = pendingRef.current
        pendingRef.current = null
        displayLocationRef.current = next
        routeReadyRef.current = true
        setDisplayLocation(next)

        const ready = await waitForRouteReady()
        if (!ready) return

        if (pendingRef.current) continue

        if (type === NavigationType.Pop) {
          const savedPosition = scrollPositionsRef.current.get(next.key)
          window.scrollTo(savedPosition?.left ?? 0, savedPosition?.top ?? 0)
        } else if (next.hash) {
          const encodedHash = next.hash.slice(1)
          let hash = encodedHash
          try {
            hash = decodeURIComponent(encodedHash)
          } catch {
            // Keep the literal fragment when it contains malformed escape sequences.
          }

          const target = document.getElementById(hash)
          if (target) target.scrollIntoView()
          else window.scrollTo(0, 0)
        } else {
          window.scrollTo(0, 0)
        }

        covered = false
        path.setAttribute("d", paths.exit.filled)
        const opening = await transitionPath(
          path,
          paths.exit.filled,
          paths.exit.curve,
          180,
          easeInQuart,
          cancelRef,
        )
        if (!opening) return
        const complete = await transitionPath(
          path,
          paths.exit.curve,
          paths.exit.unfilled,
          760,
          easeOutQuart,
          cancelRef,
        )
        if (!complete) return
      }
    } finally {
      runningRef.current = false
      setIsAnimating(false)
    }
  }, [waitForRouteReady])

  useLayoutEffect(() => {
    const displayed = displayLocationRef.current
    if (
      location.pathname === displayed.pathname &&
      location.search === displayed.search &&
      location.hash === displayed.hash
    ) {
      return
    }

    pendingRef.current = { location, navigationType }
    void sweep()
  }, [location, navigationType, sweep])

  return (
    <>
      <PageTransitionReadyContext.Provider
        value={{ setReady: setRouteReady, transitioning: isAnimating }}
      >
        {children(displayLocation)}
      </PageTransitionReadyContext.Provider>
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 h-[100dvh] w-[100vw] opacity-0"
        preserveAspectRatio="none"
        viewBox="0 0 1 1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path id={pathId} ref={pathRef} d={paths.exit.unfilled} />
          </clipPath>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 [isolation:isolate] z-[9998] h-[100dvh] w-[100vw] overflow-hidden",
          isAnimating && "will-change-[clip-path]",
        )}
        style={{
          clipPath: `url(#${clipId})`,
          pointerEvents: isAnimating ? "auto" : "none",
        }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox="0 0 1 1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <use href={`#${pathId}`} fill="var(--focus-ring)" />
        </svg>

        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-(--user-accent-foreground)">
          <LogoMark className="h-[min(14vw,96px)] w-[min(14vw,96px)]" />
        </div>
      </div>
    </>
  )
}
