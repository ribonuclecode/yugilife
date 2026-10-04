"use client"

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react"

import * as SliderPrimitive from "@radix-ui/react-slider"
import { animate, motion, useMotionValue, useTransform } from "framer-motion"

import { useShape } from "@/lib/shape-context"
import { useSize } from "@/lib/size-context"
import { linearSliderScale } from "@/lib/slider-scale"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { at, clampSliderPosition, mergeMotionStyles, PIP_SIZE } from "./slider-engine"
import { Tooltip } from "./tooltip"

import type { SliderScale } from "@/lib/slider-scale"
import type { MotionValue } from "framer-motion"
import type { HTMLAttributes } from "react"

interface SliderComfortableProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  | "onChange"
  | "defaultValue"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onDragOver"
  | "onAnimationStart"
> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  variant?: "pips" | "scrubber"
  label?: string
  formatValue?: (v: number) => string
  disabled?: boolean
  scale?: SliderScale
}

export const ComfortableSlider = forwardRef<HTMLDivElement, SliderComfortableProps>(
  (
    {
      value,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      variant = "pips",
      label,
      formatValue = String,
      disabled = false,
      scale = linearSliderScale,
      className,
      style: containerStyle,
      ...props
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const dragging = useRef(false)
    const handleDragging = useRef(false)
    const [isHovered, setIsHovered] = useState(false)
    const [isPressed, setIsPressed] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    const [hoverPreview, setHoverPreview] = useState<{
      left: number
      width: number
      snappedValue: number
      cursorX: number
    } | null>(null)
    const [showHoverTooltip, setShowHoverTooltip] = useState(false)
    const hoverDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const shape = useShape()
    const sizeClasses = useSize("default")

    useEffect(() => {
      if (isHovered) {
        hoverDelayRef.current = setTimeout(() => setShowHoverTooltip(true), 100)
      } else {
        if (hoverDelayRef.current) clearTimeout(hoverDelayRef.current)
      }
      return () => {
        if (hoverDelayRef.current) clearTimeout(hoverDelayRef.current)
      }
    }, [isHovered])

    const mergedRef = useCallback(
      (el: HTMLDivElement | null) => {
        containerRef.current = el
        if (typeof ref === "function") ref(el)
        else if (ref) ref.current = el
      },
      [ref],
    )

    const pipSteps = useMemo(
      () => Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step),
      [min, max, step],
    )
    const pipCount = pipSteps.length

    const fillPercent = useMotionValue(
      max === min ? 0 : clampSliderPosition(scale.valueToPosition(value, min, max)),
    )
    const zeroTarget = variant === "pips" ? 8 : 17
    const zeroOffset = useMotionValue(value === min ? zeroTarget : 0)

    const fillWidthStyle = useTransform(fillPercent, (p) => `${p * 100}%`)
    const handleLeftStyle = useTransform(
      [fillPercent, zeroOffset] as MotionValue<number>[],
      ([p, zo]) => `calc(${(p as number) * 100}% - 8px + ${zo as number}px)`,
    )
    const handleLineLeftStyle = useTransform(
      [fillPercent, zeroOffset] as MotionValue<number>[],
      ([p, zo]) => `calc(${(p as number) * 100}% - 9px + ${zo as number}px)`,
    )
    const pipsFillWidthStyle = useTransform(
      [fillPercent, zeroOffset] as MotionValue<number>[],
      ([p, zo]) =>
        `calc(${(p as number) * 100}% + ${20 - 20 * (p as number) - (zo as number) * 2.5}px)`,
    )
    const pipsHandleLineLeftStyle = useTransform(
      fillPercent,
      (p) => `calc(${p * 100}% + ${11 - 24 * p}px)`,
    )
    const pipsMaskStyle = useTransform(
      [fillPercent, zeroOffset] as MotionValue<number>[],
      ([p, zo]) => {
        const offset = 20 - 20 * (p as number) - (zo as number) * 2.5
        return `linear-gradient(to right, transparent calc(${(p as number) * 100}% + ${offset}px), black calc(${(p as number) * 100}% + ${offset + 2}px))`
      },
    )

    const computeHoverPreview = useCallback(
      (clientX: number) => {
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const w = el.clientWidth
        if (w <= 0 || rect.width <= 0) return
        const visualScale = rect.width / el.offsetWidth
        const borderLeftLayout = (el.offsetWidth - w) / 2
        const visualX = clientX - rect.left
        const layoutX = visualX / visualScale - borderLeftLayout
        const clamped = Math.max(0, Math.min(w, layoutX))

        let snappedVal: number
        if (variant === "pips") {
          if (pipCount <= 1) return
          const index = Math.max(
            0,
            Math.min(pipCount - 1, Math.round((clamped / w) * (pipCount - 1))),
          )
          snappedVal = at(pipSteps, index)
        } else {
          const raw = scale.positionToValue(clamped / w, min, max)
          snappedVal = Math.max(min, Math.min(max, Math.round((raw - min) / step) * step + min))
        }
        const snappedPercent =
          variant === "scrubber"
            ? clampSliderPosition(scale.valueToPosition(snappedVal, min, max))
            : max === min
              ? 0
              : (snappedVal - min) / (max - min)
        const snappedX = snappedPercent * w

        const currentPercent = fillPercent.get()
        let handleX: number
        if (variant === "pips") {
          const zo = zeroOffset.get()
          handleX = currentPercent * w + (20 - 20 * currentPercent - zo * 2.5)
        } else {
          handleX = currentPercent * w
        }

        const edgeX = snappedVal === min ? 0 : snappedVal === max ? w : snappedX
        const left = Math.min(handleX, edgeX)
        const width = Math.abs(edgeX - handleX)
        setHoverPreview({ left, width, snappedValue: snappedVal, cursorX: snappedX })
      },
      [variant, pipSteps, pipCount, min, max, step, scale, fillPercent, zeroOffset],
    )

    useEffect(() => {
      if (dragging.current || handleDragging.current) return
      const percent = max === min ? 0 : clampSliderPosition(scale.valueToPosition(value, min, max))
      animate(fillPercent, percent, spring.fast)
      animate(zeroOffset, value === min ? zeroTarget : 0, spring.fast)
    }, [value, min, max, variant, scale, fillPercent, zeroOffset, zeroTarget])

    const getValueFromX = useCallback(
      (clientX: number) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return min
        const x = clientX - rect.left
        const clamped = Math.max(0, Math.min(rect.width, x))
        if (variant === "pips") {
          if (pipCount <= 1) return min
          const index = Math.max(
            0,
            Math.min(pipCount - 1, Math.round((clamped / rect.width) * (pipCount - 1))),
          )
          return at(pipSteps, index)
        } else {
          const raw = scale.positionToValue(clamped / rect.width, min, max)
          const snapped = Math.round((raw - min) / step) * step + min
          return Math.max(min, Math.min(max, snapped))
        }
      },
      [variant, pipSteps, pipCount, min, max, step, scale],
    )

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return
        if (e.pointerType === "mouse" && e.button !== 0) return
        e.preventDefault()
        dragging.current = true
        setIsPressed(true)
        const newVal = getValueFromX(e.clientX)
        onChange(newVal)
        const newPercent =
          max === min ? 0 : clampSliderPosition(scale.valueToPosition(newVal, min, max))
        animate(fillPercent, newPercent, spring.fast)
        animate(zeroOffset, newVal === min ? zeroTarget : 0, spring.fast)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      },
      [disabled, getValueFromX, onChange, fillPercent, zeroOffset, zeroTarget, min, max, scale],
    )

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return
        const newVal = getValueFromX(e.clientX)
        onChange(newVal)
        const newPercent =
          max === min ? 0 : clampSliderPosition(scale.valueToPosition(newVal, min, max))
        if (variant === "scrubber") {
          fillPercent.set(newPercent)
        } else {
          animate(fillPercent, newPercent, spring.fast)
        }
        animate(zeroOffset, newVal === min ? zeroTarget : 0, spring.fast)
      },
      [getValueFromX, onChange, variant, fillPercent, zeroOffset, zeroTarget, min, max, scale],
    )

    const handlePointerUp = useCallback(() => {
      dragging.current = false
      setIsPressed(false)
      setHoverPreview(null)
    }, [])

    const handleResizePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (disabled) return
        if (e.pointerType === "mouse" && e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        handleDragging.current = true
        setIsPressed(true)
        const newVal = getValueFromX(e.clientX)
        onChange(newVal)
        fillPercent.set(
          max === min ? 0 : clampSliderPosition(scale.valueToPosition(newVal, min, max)),
        )
        animate(zeroOffset, newVal === min ? zeroTarget : 0, spring.fast)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      },
      [disabled, getValueFromX, onChange, fillPercent, zeroOffset, zeroTarget, min, max, scale],
    )

    const handleResizePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!handleDragging.current) return
        const newVal = getValueFromX(e.clientX)
        onChange(newVal)
        fillPercent.set(
          max === min ? 0 : clampSliderPosition(scale.valueToPosition(newVal, min, max)),
        )
        animate(zeroOffset, newVal === min ? zeroTarget : 0, spring.fast)
      },
      [getValueFromX, onChange, fillPercent, zeroOffset, zeroTarget, min, max, scale],
    )

    const handleResizePointerUp = useCallback(() => {
      handleDragging.current = false
      setIsPressed(false)
      setHoverPreview(null)
    }, [])

    const handleRadixChange = useCallback(
      (newValues: number[]) => {
        onChange(at(newValues, 0))
      },
      [onChange],
    )

    const isActive = isHovered || isFocused

    return (
      <div
        className="relative w-full touch-none"
        onPointerEnter={() => {
          if (!disabled) setIsHovered(true)
        }}
        onPointerLeave={() => {
          if (!disabled) {
            setIsHovered(false)
            setHoverPreview(null)
            setShowHoverTooltip(false)
          }
        }}
        onMouseMove={(e) => {
          if (disabled || dragging.current || handleDragging.current) return
          computeHoverPreview(e.clientX)
        }}
      >
        <div
          className="absolute cursor-ew-resize"
          style={{ left: -8, right: -8, top: 0, bottom: 0 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {hoverPreview && showHoverTooltip && !isPressed && (
          <Tooltip
            content={<span className="tabular-nums">{formatValue(hoverPreview.snappedValue)}</span>}
            delayDuration={0}
            forceOpen
            side="top"
            sideOffset={4}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 size-0"
              style={{ left: hoverPreview.cursorX }}
            />
          </Tooltip>
        )}

        <motion.div
          ref={mergedRef}
          className={cn(
            "border-border relative w-full touch-none overflow-hidden border outline-offset-2 select-none",
            sizeClasses.control,
            variant === "scrubber"
              ? "flex cursor-ew-resize items-center gap-3 px-4"
              : "cursor-ew-resize",
            shape.bg,
            disabled && "pointer-events-none opacity-50",
            className,
          )}
          initial={false}
          animate={{
            outline: isFocused ? "1px solid var(--focus-ring)" : "1px solid transparent",
          }}
          transition={spring.fast}
          style={mergeMotionStyles(containerStyle)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          {...props}
          data-cursor="drag"
        >
          <SliderPrimitive.Root
            value={[value]}
            onValueChange={handleRadixChange}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="pointer-events-none absolute inset-0 opacity-0 **:pointer-events-none"
          >
            <SliderPrimitive.Track className="h-full w-full">
              <SliderPrimitive.Range />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              aria-label={label}
              className="block outline-none"
              onFocus={(e) => {
                if (e.currentTarget.matches(":focus-visible")) setIsFocused(true)
              }}
              onBlur={() => setIsFocused(false)}
            />
          </SliderPrimitive.Root>

          <motion.div
            className="pointer-events-none absolute inset-y-0 z-3"
            initial={false}
            animate={{
              opacity: hoverPreview && !isPressed ? 1 : 0,
            }}
            transition={{ opacity: { duration: 0.15 } }}
            style={{
              left: hoverPreview ? hoverPreview.left : 0,
              width: hoverPreview ? hoverPreview.width : 0,
              backgroundColor: "color-mix(in srgb, var(--color-accent) 40%, transparent)",
            }}
          />

          {variant === "pips" && (
            <motion.div
              className="pointer-events-none absolute inset-0 z-1"
              style={{ WebkitMaskImage: pipsMaskStyle, maskImage: pipsMaskStyle }}
            >
              {pipSteps.map((pipValue) => {
                const isActivePip = pipValue === value
                const pipPercent =
                  max === min ? 0 : clampSliderPosition(scale.valueToPosition(pipValue, min, max))
                return (
                  <div
                    key={pipValue}
                    className="absolute flex items-center justify-center"
                    style={{
                      left: `calc(12px + ${pipPercent} * (100% - ${24 + PIP_SIZE}px))`,
                      top: "50%",
                      width: PIP_SIZE,
                      height: PIP_SIZE,
                      transform: "translateY(-50%)",
                    }}
                  >
                    <motion.div
                      className="rounded-full"
                      initial={false}
                      animate={{
                        backgroundColor: isActivePip
                          ? "var(--foreground)"
                          : "var(--muted-foreground)",
                        opacity: isActivePip ? 1 : 0.3,
                      }}
                      transition={spring.fast}
                      style={{ width: PIP_SIZE, height: PIP_SIZE }}
                    />
                  </div>
                )
              })}
            </motion.div>
          )}

          {variant === "pips" && (
            <div
              className="pointer-events-none absolute inset-0 z-2 flex items-center px-2"
              aria-hidden
            >
              {label && (
                <span
                  className={cn(
                    "bg-background px-2 text-transparent select-none",
                    sizeClasses.body,
                  )}
                >
                  {label}
                </span>
              )}
              <span
                className={cn(
                  "bg-background ml-auto px-2 text-transparent tabular-nums select-none",
                  sizeClasses.body,
                )}
                style={{ minWidth: `${String(formatValue(max)).length}ch` }}
              >
                {formatValue(value)}
              </span>
            </div>
          )}

          {variant === "pips" && (
            <motion.div
              className="pointer-events-none absolute top-0 bottom-0 left-0 z-3"
              style={{
                width: pipsFillWidthStyle,
                backgroundColor: "var(--active)",
              }}
            />
          )}

          {variant === "pips" && (
            <motion.div
              className="pointer-events-none absolute z-3 rounded-full"
              initial={false}
              animate={{
                top: isActive ? 7 : 8,
                bottom: isActive ? 7 : 8,
                backgroundColor: isFocused
                  ? "var(--foreground)"
                  : isHovered
                    ? "color-mix(in srgb, var(--foreground) 50%, transparent)"
                    : "color-mix(in srgb, var(--foreground) 25%, transparent)",
              }}
              transition={spring.fast}
              style={{
                left: pipsHandleLineLeftStyle,
                width: 2,
              }}
            />
          )}

          {variant === "pips" && (
            <div className="pointer-events-none absolute inset-0 z-4 flex items-center px-2">
              {label && (
                <motion.span
                  className={cn("px-2", sizeClasses.body)}
                  initial={false}
                  animate={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
                  transition={spring.fast}
                >
                  {label}
                </motion.span>
              )}
              <motion.span
                className={cn("ml-auto px-2 tabular-nums", sizeClasses.body)}
                initial={false}
                animate={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
                transition={spring.fast}
                style={{ minWidth: `${String(formatValue(max)).length}ch`, textAlign: "right" }}
              >
                {formatValue(value)}
              </motion.span>
            </div>
          )}

          {variant === "scrubber" && (
            <motion.div
              className="pointer-events-none absolute top-0 bottom-0 left-0"
              style={{
                width: fillWidthStyle,
                backgroundColor: "var(--active)",
              }}
            />
          )}

          {variant === "scrubber" && (
            <motion.div
              className="pointer-events-none absolute z-10 rounded-full"
              initial={false}
              animate={{
                top: isActive ? 7 : 8,
                bottom: isActive ? 7 : 8,
                backgroundColor: isFocused
                  ? "var(--foreground)"
                  : isHovered
                    ? "color-mix(in srgb, var(--foreground) 50%, transparent)"
                    : "color-mix(in srgb, var(--foreground) 25%, transparent)",
              }}
              transition={spring.fast}
              style={{
                left: handleLineLeftStyle,
                width: 2,
              }}
            />
          )}

          {variant === "scrubber" && label && (
            <motion.span
              className={cn("z-10 shrink-0", sizeClasses.body)}
              initial={false}
              animate={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
              transition={spring.fast}
            >
              {label}
            </motion.span>
          )}

          {variant === "scrubber" && (
            <>
              <div className="flex-1" />
              <motion.span
                className={cn("z-10 shrink-0 text-right tabular-nums", sizeClasses.body)}
                initial={false}
                animate={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
                transition={spring.fast}
                style={{ minWidth: `${String(formatValue(max)).length}ch` }}
              >
                {formatValue(value)}
              </motion.span>
            </>
          )}

          {variant === "scrubber" && (
            <motion.div
              className="absolute top-0 bottom-0 z-20 w-2 cursor-ew-resize"
              style={{ left: handleLeftStyle }}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
            />
          )}
        </motion.div>
      </div>
    )
  },
)

ComfortableSlider.displayName = "SliderComfortable"
