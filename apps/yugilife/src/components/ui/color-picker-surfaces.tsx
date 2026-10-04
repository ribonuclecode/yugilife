"use client"

import { useCallback, useRef, useState } from "react"

import { motion } from "framer-motion"

import { Slider } from "@/components/ui/slider"
import { clamp01, hsvToRgb } from "@/lib/color-space"
import { useShape } from "@/lib/shape-context"
import { cn } from "@/lib/utils"

export const PANEL_WIDTH = 280
const SQUARE_HEIGHT = 156

interface SaturationSquareProps {
  h: number
  s: number
  v: number
  onChange: (s: number, v: number) => void
}

export function SaturationSquare({ h, s, v, onChange }: SaturationSquareProps) {
  const ref = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const [dragging, setDragging] = useState(false)
  const hasMoved = useRef(false)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const shape = useShape()

  const getRect = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect() ?? null
    rectRef.current = rect
    return rect
  }, [])

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = rectRef.current ?? getRect()
      if (!rect) return
      const x = clamp01((clientX - rect.left) / rect.width)
      const y = clamp01((clientY - rect.top) / rect.height)
      onChange(x, 1 - y)
    },
    [getRect, onChange],
  )

  const updateCursorPos = useCallback(
    (clientX: number, clientY: number) => {
      const rect = rectRef.current ?? getRect()
      if (!rect) return
      const cursor = cursorRef.current
      if (!cursor) return
      cursor.style.left = `${clamp01((clientX - rect.left) / rect.width) * 100}%`
      cursor.style.top = `${clamp01((clientY - rect.top) / rect.height) * 100}%`
    },
    [getRect],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      e.preventDefault()
      getRect()
      setDragging(true)
      hasMoved.current = false
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      updateFromPointer(e.clientX, e.clientY)
    },
    [getRect, updateFromPointer],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      updateCursorPos(e.clientX, e.clientY)
      if (!dragging) return
      hasMoved.current = true
      updateFromPointer(e.clientX, e.clientY)
    },
    [dragging, updateFromPointer, updateCursorPos],
  )

  const onPointerUp = useCallback(() => {
    setDragging(false)
    hasMoved.current = false
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 0.1 : 0.01
      let nextS = s,
        nextV = v,
        handled = true
      if (e.key === "ArrowLeft") nextS = clamp01(s - step)
      else if (e.key === "ArrowRight") nextS = clamp01(s + step)
      else if (e.key === "ArrowUp") nextV = clamp01(v + step)
      else if (e.key === "ArrowDown") nextV = clamp01(v - step)
      else handled = false
      if (handled) {
        e.preventDefault()
        onChange(nextS, nextV)
      }
    },
    [onChange, s, v],
  )

  const { r, g, b } = hsvToRgb(h, s, v)
  const thumbColor = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`

  return (
    <div
      ref={ref}
      role="application"
      aria-label="Saturation and brightness"
      tabIndex={0}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) setFocused(true)
      }}
      onBlur={() => setFocused(false)}
      onPointerEnter={(e) => {
        getRect()
        updateCursorPos(e.clientX, e.clientY)
        setHovered(true)
      }}
      onPointerLeave={() => {
        rectRef.current = null
        setHovered(false)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        "relative w-full cursor-none touch-none transition-shadow duration-80 outline-none select-none",
        shape.bg,
      )}
      data-cursor="drag"
      style={{
        height: SQUARE_HEIGHT,
        boxShadow: focused ? "0 0 0 2px var(--focus-ring)" : "0 0 0 2px transparent",
      }}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden",
          shape.bg === "rounded-[20px]" ? "rounded-2xl" : shape.bg,
        )}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`,
        }}
      />
      <motion.div
        className="pointer-events-none absolute rounded-full"
        initial={false}
        animate={{
          left: `${s * 100}%`,
          top: `${(1 - v) * 100}%`,
          width: 18,
          height: 18,
        }}
        transition={{ duration: 0 }}
        style={{
          transform: "translate(-50%, -50%)",
          border: "1px solid white",
          boxShadow: "0 0 0 1px rgba(0,0,0,1)",
          backgroundColor: thumbColor,
        }}
      />
      <div
        aria-hidden="true"
        ref={cursorRef}
        className="pointer-events-none absolute rounded-full"
        style={{
          left: "0%",
          top: "0%",
          width: 18,
          height: 18,
          transform: "translate(-50%, -50%)",
          border: "2px solid rgba(255, 255, 255, 0.55)",
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.2)",
          opacity: hovered && !dragging ? 1 : 0,
        }}
      />
    </div>
  )
}

type ColorSliderValue = number | [number, number]

function firstSliderValue(value: ColorSliderValue): number {
  return typeof value === "number" ? value : value[0]
}

export function HueSlider({ h, onChange }: { h: number; onChange: (h: number) => void }) {
  const hueColor = `hsl(${h}, 100%, 50%)`
  return (
    <Slider
      value={h}
      onChange={(v: ColorSliderValue) => onChange(firstSliderValue(v))}
      min={0}
      max={360}
      step={1}
      showValue={false}
      hideFill
      thumbColor={hueColor}
      thumbBorderColor="rgba(255,255,255,0.9)"
      trackStyle={{
        background:
          "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
        borderColor: "transparent",
      }}
      aria-label="Hue"
    />
  )
}

export function AlphaSlider({
  a,
  solidColor,
  solidR,
  solidG,
  solidB,
  onChange,
}: {
  a: number
  solidColor: string
  solidR: number
  solidG: number
  solidB: number
  onChange: (a: number) => void
}) {
  const transparentColor = `rgba(${solidR}, ${solidG}, ${solidB}, 0)`
  return (
    <Slider
      value={Math.round(a * 100)}
      onChange={(v: ColorSliderValue) => onChange(firstSliderValue(v) / 100)}
      min={0}
      max={100}
      step={1}
      showValue={false}
      hideFill
      thumbColor={solidColor}
      thumbBorderColor="rgba(255,255,255,0.9)"
      trackStyle={{
        backgroundImage: `linear-gradient(to right, ${transparentColor} 0%, ${solidColor} 98%), conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%, var(--checker-a) 0 75%, var(--checker-b) 0)`,
        backgroundSize: "100% 100%, 8px 8px",
        borderWidth: 0,
      }}
      aria-label="Alpha"
    />
  )
}
