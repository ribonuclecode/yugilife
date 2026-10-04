import { linearSliderScale } from "@/lib/slider-scale"

import type { SliderScale } from "@/lib/slider-scale"
import type { MotionStyle } from "framer-motion"
import type { CSSProperties, HTMLAttributes } from "react"

export type SliderValue = number | [number, number]
export type SliderValues = [number] | [number, number]
export type NonEmptyNumberArray = [number, ...number[]]
type ValuePosition = "left" | "right" | "top" | "bottom" | "tooltip"

export interface SliderEngineProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> {
  value: SliderValue
  onChange: (value: SliderValue) => void
  min?: number
  max?: number
  step?: number
  steps?: number[]
  showSteps?: boolean
  showValue?: boolean
  valuePosition?: ValuePosition
  formatValue?: (v: number) => string
  label?: string
  disabled?: boolean
  trackClassName?: string
  trackStyle?: CSSProperties
  fillClassName?: string
  fillStyle?: CSSProperties
  hideFill?: boolean
  thumbColor?: string
  thumbBorderColor?: string
  scale?: SliderScale
}

export const THUMB_SIZE = 20
export const THUMB_SIZE_REST = 16
export const TRACK_BG_HEIGHT = 18
export const DOT_SIZE = 4
export const PIP_SIZE = 5
export const TRACK_INSET = (THUMB_SIZE - TRACK_BG_HEIGHT) / 2

export function clampSliderPosition(position: number): number {
  return Math.max(0, Math.min(1, position))
}

export function valueToPixel(
  v: number,
  min: number,
  max: number,
  trackWidth: number,
  scale: SliderScale = linearSliderScale,
): number {
  if (max === min) return 0
  const usable = trackWidth - THUMB_SIZE
  return clampSliderPosition(scale.valueToPosition(v, min, max)) * usable
}

export function at<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) {
    throw new Error(`Slider value index ${index} is out of bounds`)
  }
  return value
}

export function toNonEmptyNumberArray(values: number[]): NonEmptyNumberArray | null {
  const [first, ...rest] = values
  return first === undefined ? null : [first, ...rest]
}

export function lastNumber(values: NonEmptyNumberArray): number {
  const last = values.at(-1)
  if (last === undefined) {
    throw new Error("Expected a non-empty slider step list")
  }
  return last
}

export function nearestStepIndex(v: number, steps: NonEmptyNumberArray): number {
  let idx = 0
  let nearest = steps[0]
  for (let i = 1; i < steps.length; i++) {
    const candidate = at(steps, i)
    if (Math.abs(candidate - v) < Math.abs(nearest - v)) {
      idx = i
      nearest = candidate
    }
  }
  return idx
}

export function pixelToValue(
  px: number,
  min: number,
  max: number,
  step: number,
  trackWidth: number,
  stepValues: NonEmptyNumberArray | null = null,
  scale: SliderScale = linearSliderScale,
): number {
  const usable = trackWidth - THUMB_SIZE
  if (usable <= 0) return min
  const raw = scale.positionToValue(clampSliderPosition(px / usable), min, max)
  if (stepValues) return at(stepValues, nearestStepIndex(raw, stepValues))
  const snapped = Math.round((raw - min) / step) * step + min
  return Math.max(min, Math.min(max, snapped))
}

export function toRadixValue(value: SliderValue): SliderValues {
  return typeof value === "number" ? [value] : value
}

export function mergeMotionStyles(
  ...styles: Array<CSSProperties | MotionStyle | undefined>
): MotionStyle {
  const merged: MotionStyle = {}
  for (const style of styles) {
    if (!style) continue
    for (const [property, value] of Object.entries(style) as Array<[string, unknown]>) {
      if (value !== undefined) Object.assign(merged, { [property]: value })
    }
  }
  return merged
}

export function omitProps<T extends object, K extends keyof T>(
  object: T,
  keys: readonly K[],
): Omit<T, K> {
  const omitted = new Set<PropertyKey>(keys)
  const result = {} as Omit<T, K>
  for (const [key, value] of Object.entries(object) as Array<[string, unknown]>) {
    if (!omitted.has(key)) Object.assign(result, { [key]: value })
  }
  return result
}
