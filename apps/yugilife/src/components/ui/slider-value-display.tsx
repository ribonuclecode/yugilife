"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { motion, useTransform } from "framer-motion"

import { fontWeights } from "@/lib/font-weight"
import { useShape } from "@/lib/shape-context"
import { useSize } from "@/lib/size-context"
import { cn } from "@/lib/utils"

import { at, nearestStepIndex, THUMB_SIZE } from "./slider-engine"
import { Tooltip } from "./tooltip"

import type { NonEmptyNumberArray, SliderValues } from "./slider-engine"
import type { MotionValue } from "framer-motion"

interface ValueDisplayProps {
  values: SliderValues
  editingIndex: number | null
  onStartEdit: (index: number) => void
  onCommitEdit: (index: number, v: number) => void
  onCancelEdit: () => void
  min: number
  max: number
  step: number
  stepValues: NonEmptyNumberArray | null
  formatValue: (v: number) => string
  label: string | undefined
  isRange: boolean
  isInteracting: boolean
}

interface EditableValueProps {
  initialValue: string
  index: number
  onCommitEdit: (index: number, v: number) => void
  onCancelEdit: () => void
  min: number
  max: number
  step: number
  stepValues: NonEmptyNumberArray | null
  isRange: boolean
  label: string | undefined
  formatValue: (v: number) => string
  shapeClassName: string
}

function EditableValue({
  initialValue,
  index,
  onCommitEdit,
  onCancelEdit,
  min,
  max,
  step,
  stepValues,
  isRange,
  label,
  formatValue,
  shapeClassName,
}: EditableValueProps) {
  const sizeClasses = useSize("compact")
  const [inputValue, setInputValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.select())
    return () => cancelAnimationFrame(frame)
  }, [])

  const commitEdit = useCallback(() => {
    const parsed = parseFloat(inputValue)
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed))
      const snapped = stepValues
        ? at(stepValues, nearestStepIndex(clamped, stepValues))
        : Math.round((clamped - min) / step) * step + min
      onCommitEdit(index, snapped)
    } else {
      onCancelEdit()
    }
  }, [index, inputValue, max, min, onCancelEdit, onCommitEdit, step, stepValues])

  return (
    <span className={cn("inline-grid", sizeClasses.body)}>
      <span
        className="invisible col-start-1 row-start-1"
        style={{ fontVariationSettings: fontWeights.medium }}
        aria-hidden="true"
      >
        {label ? `${label}: ` : ""}
        {formatValue(max)}
      </span>
      <span className="col-start-1 row-start-1 flex items-center gap-1">
        {label && <span className="text-muted-foreground">{label}:</span>}
        <input
          ref={inputRef}
          type="number"
          value={inputValue}
          min={min}
          max={max}
          step={stepValues ? "any" : step}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit()
            if (e.key === "Escape") onCancelEdit()
          }}
          aria-label={`Edit slider value${isRange ? (index === 0 ? " (start)" : " (end)") : ""}`}
          className={cn(
            "text-foreground border-border w-[5ch] border-b bg-transparent text-center outline-none",
            shapeClassName,
          )}
          style={{ fontVariationSettings: fontWeights.medium }}
        />
      </span>
    </span>
  )
}

export function ValueDisplay({
  values,
  editingIndex,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  min,
  max,
  step,
  stepValues,
  formatValue,
  label,
  isRange,
  isInteracting,
}: ValueDisplayProps) {
  const shape = useShape()
  const sizeClasses = useSize("compact")

  const renderValue = (index: number) => {
    if (editingIndex === index) {
      return (
        <EditableValue
          key={`editable-${index}`}
          initialValue={formatValue(at(values, index))}
          index={index}
          onCommitEdit={onCommitEdit}
          onCancelEdit={onCancelEdit}
          min={min}
          max={max}
          step={step}
          stepValues={stepValues}
          isRange={isRange}
          label={label}
          formatValue={formatValue}
          shapeClassName={shape.input}
        />
      )
    }

    return (
      <span className="cursor-text select-none" onClick={() => onStartEdit(index)}>
        {formatValue(at(values, index))}
      </span>
    )
  }

  const widestValue = isRange
    ? `${label ? `${label}: ` : ""}${formatValue(max)} — ${formatValue(max)}`
    : `${label ? `${label}: ` : ""}${formatValue(max)}`

  return (
    <span
      className={cn(
        "text-muted-foreground inline-grid shrink-0 leading-none transition-[font-variation-settings] duration-100",
        sizeClasses.body,
        "tabular-nums",
      )}
      style={{
        fontVariationSettings: isInteracting ? fontWeights.medium : fontWeights.normal,
      }}
    >
      <span
        className="invisible col-start-1 row-start-1 whitespace-nowrap"
        style={{ fontVariationSettings: fontWeights.medium }}
        aria-hidden="true"
      >
        {widestValue}
      </span>
      <span className="col-start-1 row-start-1 whitespace-nowrap">
        {label && editingIndex === null && <span className="text-muted-foreground">{label}: </span>}
        {isRange ? (
          <>
            {renderValue(0)}
            <span className="text-muted-foreground/50 mx-1">—</span>
            {renderValue(1)}
          </>
        ) : (
          renderValue(0)
        )}
      </span>
    </span>
  )
}

interface TooltipValueProps {
  value: number
  formatValue: (v: number) => string
  motionX: MotionValue<number>
}

export function TooltipValue({ value, formatValue, motionX }: TooltipValueProps) {
  const tooltipX = useTransform(motionX, (x) => x + THUMB_SIZE / 2)
  return (
    <Tooltip
      content={<span className="tabular-nums">{formatValue(value)}</span>}
      delayDuration={0}
      forceOpen
      side="top"
      sideOffset={4}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute top-4 size-0"
        style={{ x: tooltipX }}
      />
    </Tooltip>
  )
}
