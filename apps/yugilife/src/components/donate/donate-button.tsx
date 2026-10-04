import { useEffect, useRef, useState } from "react"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { createPortal, flushSync } from "react-dom"

import { fontWeights } from "@/lib/font-weight"
import { useSize } from "@/lib/size-context"
import { cn } from "@/lib/utils"

import { DonateSheet } from "./donate-sheet"
import { createFog } from "./fog"
import { createHeartSprite } from "./heart-sprite"
import { arrive, sink, sweepOut } from "./screen-transitions"

import type { Fog } from "./fog"
import type { HeartSprite } from "./heart-sprite"
import type { Arrival, ScreenParts } from "./screen-transitions"

export function DonateButton() {
  const sizeClasses = useSize()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const slotRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<SVGPathElement>(null)
  const screenRef = useRef<HTMLElement>(null)
  const fogCanvasRef = useRef<HTMLCanvasElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const spriteRef = useRef<HeartSprite | null>(null)
  const fogRef = useRef<Fog | null>(null)
  const arrivalRef = useRef<Arrival | null>(null)
  const busy = useRef(false)
  const closeRequested = useRef(false)
  const pointerInside = useRef(false)
  const focused = useRef(false)

  const [open, setOpen] = useState(false)
  const [screenShown, setScreenShown] = useState(false)
  const [flatHeart, setFlatHeart] = useState(false)

  const isActive = () => (pointerInside.current || focused.current) && !busy.current
  const syncActive = () => spriteRef.current?.setActive(isActive())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    let sprite: HeartSprite | null = null
    void createHeartSprite({
      canvas,
      seat: () => slotRef.current?.getBoundingClientRect(),
    }).then((made) => {
      if (disposed) {
        made?.dispose()
        return
      }
      sprite = made
      spriteRef.current = made
      if (made) made.setActive((pointerInside.current || focused.current) && !busy.current)
      else setFlatHeart(true)
    })
    return () => {
      disposed = true
      sprite?.dispose()
      spriteRef.current = null
    }
  }, [])

  useEffect(() => {
    const fogCanvas = fogCanvasRef.current
    if (!fogCanvas) return
    const fog = createFog(fogCanvas)
    fogRef.current = fog
    return () => {
      fog.dispose()
      fogRef.current = null
    }
  }, [])

  const parts = (): ScreenParts | undefined => {
    const glow = glowRef.current
    const screen = screenRef.current
    const fogCanvas = fogCanvasRef.current
    const sheet = sheetRef.current
    const band = bandRef.current
    if (!glow || !screen || !fogCanvas || !sheet || !band) return undefined
    return { band, fogCanvas, glow, screen, sheet }
  }

  const openSheet = async () => {
    if (busy.current) return
    busy.current = true
    closeRequested.current = false
    syncActive()
    flushSync(() => setOpen(true))

    const sprite = spriteRef.current
    const [x, y] = sprite
      ? await sprite.breakOnFloor()
      : [window.innerWidth / 2, window.innerHeight - 30]

    const screenParts = parts()
    if (!screenParts) {
      busy.current = false
      return
    }
    flushSync(() => setScreenShown(true))
    fogRef.current?.start()
    const arrival = arrive(screenParts, x, y)
    arrivalRef.current = arrival
    await arrival.ready

    sprite?.reset()
    sprite?.setVisible(false)
    screenParts.sheet.focus({ preventScroll: true })
    busy.current = false
    if (closeRequested.current) void closeSheet()
  }

  const closeSheet = async () => {
    if (busy.current) {
      closeRequested.current = true
      return
    }
    closeRequested.current = false
    const screenParts = parts()
    if (!screenParts) {
      setOpen(false)
      return
    }
    busy.current = true

    await sink(screenParts)

    setScreenShown(false)
    fogRef.current?.stop()
    arrivalRef.current?.cancel()
    arrivalRef.current = null
    setOpen(false)

    const sprite = spriteRef.current
    const falling = sprite ? sprite.dropIn() : Promise.resolve()
    sprite?.setVisible(true)
    await Promise.all([sweepOut(screenParts), falling])

    busy.current = false
    syncActive()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "relative inline-flex aspect-square cursor-pointer items-center justify-center",
          "rounded-full select-none",
          sizeClasses.control,
          sizeClasses.text,
          "lg:aspect-auto lg:w-auto lg:justify-start lg:pr-4 lg:pl-[10px]",
          "bg-[linear-gradient(180deg,#ff3563_0%,#e51a4b_55%,#d11341_100%)] text-white",
          "shadow-[0_1px_1px_rgba(120,10,40,0.22),0_10px_22px_-10px_rgba(225,29,72,0.85),inset_0_1px_0_rgba(255,255,255,0.28)]",
          "tracking-[-0.2px]",
          "[transition:translate_90ms_cubic-bezier(0.22,1,0.36,1),scale_90ms_cubic-bezier(0.22,1,0.36,1),box-shadow_200ms_cubic-bezier(0.22,1,0.36,1)]",
          "hover:-translate-y-px",
          "hover:shadow-[0_2px_2px_rgba(120,10,40,0.22),0_14px_28px_-10px_rgba(225,29,72,0.95),inset_0_1px_0_rgba(255,255,255,0.34)]",
          "active:translate-y-0 active:scale-[0.978]",
          "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#e11d48]",
          "motion-reduce:transition-none",
        )}
        style={{ fontVariationSettings: fontWeights.semibold }}
        aria-label="Support"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-cursor="button"
        onClick={() => void openSheet()}
        onPointerEnter={() => {
          pointerInside.current = true
          syncActive()
        }}
        onPointerLeave={() => {
          pointerInside.current = false
          syncActive()
        }}
        onPointerCancel={() => {
          pointerInside.current = false
          syncActive()
        }}
        onFocus={(event) => {
          focused.current = event.currentTarget.matches(":focus-visible")
          syncActive()
        }}
        onBlur={() => {
          focused.current = false
          pointerInside.current = false
          syncActive()
        }}
      >
        <span ref={slotRef} className="relative block size-[17px] shrink-0 lg:mr-1.5">
          {flatHeart ? (
            <svg
              viewBox="0 0 24 24"
              className="block size-[17px] text-[#ffd9e2]"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M12 21C6.1 16.8 3 13.2 3 9.6 3 6.5 5.4 4 8.4 4c1.8 0 3 .9 3.6 2 .6-1.1 1.8-2 3.6-2C18.6 4 21 6.5 21 9.6c0 3.6-3.1 7.2-9 11.4Z"
              />
            </svg>
          ) : null}
        </span>
        <span className="hidden whitespace-nowrap lg:inline">Support</span>
      </button>

      {createPortal(
        <>
          {flatHeart ? null : (
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className={cn(
                "pointer-events-none fixed top-0 left-0 z-40 size-7",
                "brightness-[0.97] data-[active=true]:brightness-100",
                "transition-[filter] duration-[240ms] ease-out motion-reduce:transition-none",
              )}
            />
          )}
          <div
            ref={glowRef}
            aria-hidden="true"
            className={cn(
              "pointer-events-none fixed inset-0 z-[62] opacity-0 [will-change:opacity,background]",
              "bg-[radial-gradient(circle_var(--glow,0px)_at_var(--gx,50%)_var(--gy,100%),#ffffff_0%,#ffffff_46%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0)_100%)]",
            )}
          />
          <svg
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[61] h-[100dvh] w-[100vw]"
            preserveAspectRatio="none"
            viewBox="0 0 1 1"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path ref={bandRef} d="M 0 0 V 0 Q .5 0 1 0 V 0 z" fill="#e11d48" />
          </svg>
          <DialogPrimitive.Root
            open={open}
            onOpenChange={(next) => {
              if (!next) void closeSheet()
            }}
          >
            <section
              ref={screenRef}
              data-cursor-surface="light"
              hidden={!screenShown}
              className={cn(
                "fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-5 py-10",
                "[scrollbar-gutter:stable_both-edges]",
                "bg-white",
                "[&[hidden]]:hidden",
                "pointer-events-auto",
              )}
            >
              <canvas
                ref={fogCanvasRef}
                aria-hidden="true"
                className="fixed inset-0 z-0 block h-full w-full"
              />
              <DialogPrimitive.Content
                asChild
                onOpenAutoFocus={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
              >
                <DonateSheet ref={sheetRef} />
              </DialogPrimitive.Content>
            </section>
          </DialogPrimitive.Root>
        </>,
        document.body,
      )}
    </>
  )
}
