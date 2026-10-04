"use client"

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { NumberField } from "@base-ui/react/number-field"

import { fontWeights } from "@/lib/font-weight"
import { useShape } from "@/lib/shape-context"
import { useSize } from "@/lib/size-context"
import { cn } from "@/lib/utils"

import type { ReactNode } from "react"

interface ColorInputProps {
  value: string
  onCommit: (next: string) => void
  ariaLabel: string
  width?: string
  className?: string
  inputClassName?: string
  align?: "left" | "center" | "right"
  prefix?: ReactNode
  inputMode?: "numeric" | "decimal" | "text"
  nudgeStep?: number
  nudgeShiftStep?: number
  hasPercent?: boolean
  decimals?: number
  scrubbable?: boolean
  min?: number
  max?: number
  wrap?: boolean
}

const TextColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  (
    {
      value,
      onCommit,
      ariaLabel,
      width,
      className,
      inputClassName,
      align = "left",
      prefix,
      inputMode = "text",
      nudgeStep,
      nudgeShiftStep,
      hasPercent = false,
      decimals,
      min,
      max,
      wrap = false,
    },
    ref,
  ) => {
    const [draft, setDraft] = useState(value)
    const interactingRef = useRef(false)
    const shape = useShape()
    const sizeClasses = useSize()

    useEffect(() => {
      if (!interactingRef.current) setDraft(value)
    }, [value])

    const formatNumber = (n: number) =>
      decimals != null ? n.toFixed(decimals) : String(Math.round(n))

    const commitNumber = (n: number) => {
      let bounded = n
      if (wrap && min != null && max != null) {
        const range = max - min
        bounded = ((((bounded - min) % range) + range) % range) + min
      } else {
        if (min != null) bounded = Math.max(min, bounded)
        if (max != null) bounded = Math.min(max, bounded)
      }
      const formatted = formatNumber(bounded)
      const withSuffix = hasPercent ? `${formatted}%` : formatted
      setDraft(withSuffix)
      onCommit(withSuffix)
    }

    const nudge = (direction: 1 | -1, shift: boolean) => {
      const baseStep = shift ? (nudgeShiftStep ?? 10) : (nudgeStep ?? 1)
      const cur = parseFloat(draft.replace("%", ""))
      if (Number.isNaN(cur)) return
      commitNumber(cur + direction * baseStep)
    }

    return (
      <div
        className={cn(
          "hover:bg-hover active:bg-active flex items-center bg-transparent px-2 ring-1 ring-transparent transition-[background-color,box-shadow] duration-80 select-none focus-within:ring-(--focus-ring)",
          sizeClasses.control,
          shape.input,
          className,
        )}
        style={{ width }}
      >
        {prefix && (
          <span className={cn("text-muted-foreground mr-1 select-none", sizeClasses.caption)}>
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => {
            interactingRef.current = true
            e.currentTarget.select()
          }}
          onBlur={() => {
            interactingRef.current = false
            if (draft !== value) {
              const numeric = parseFloat(draft.replace("%", ""))
              if (!Number.isNaN(numeric) && (min != null || max != null)) {
                commitNumber(numeric)
              } else {
                onCommit(draft)
              }
            } else setDraft(value)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur()
            } else if (e.key === "Escape") {
              setDraft(value)
              e.currentTarget.blur()
            } else if (
              (nudgeStep != null || nudgeShiftStep != null) &&
              (e.key === "ArrowUp" || e.key === "ArrowDown")
            ) {
              e.preventDefault()
              nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey)
            }
          }}
          inputMode={inputMode}
          aria-label={ariaLabel}
          className={cn(
            "text-foreground min-w-0 flex-1 bg-transparent tabular-nums outline-none",
            sizeClasses.text,
            align === "center" && "text-center",
            align === "right" && "text-right",
            inputClassName,
          )}
          style={{ fontVariationSettings: fontWeights.medium }}
        />
      </div>
    )
  },
)

TextColorInput.displayName = "TextColorInput"

const ScrubColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  (
    {
      value,
      onCommit,
      ariaLabel,
      width,
      className,
      inputClassName,
      align = "left",
      prefix,
      inputMode = "numeric",
      nudgeStep,
      nudgeShiftStep,
      hasPercent = false,
      decimals,
      min,
      max,
      wrap = false,
    },
    ref,
  ) => {
    const shape = useShape()
    const sizeClasses = useSize()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [editing, setEditing] = useState(false)
    const pointerDownRef = useRef(false)

    const numeric = parseFloat(String(value).replace("%", ""))
    const fieldValue = Number.isNaN(numeric) ? null : numeric

    const format = useMemo(() => {
      const f: Intl.NumberFormatOptions = { useGrouping: false }
      if (decimals != null) {
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
      } else {
        f.maximumFractionDigits = 0
      }
      if (hasPercent) {
        f.style = "unit"
        f.unit = "percent"
      }
      return f
    }, [decimals, hasPercent])

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )

    const commit = useCallback(
      (n: number) => {
        let bounded = n
        if (wrap && min != null && max != null) {
          if (bounded < min || bounded > max) {
            const range = max - min
            bounded = ((((bounded - min) % range) + range) % range) + min
          }
        } else {
          if (min != null) bounded = Math.max(min, bounded)
          if (max != null) bounded = Math.min(max, bounded)
        }
        const formatted = decimals != null ? bounded.toFixed(decimals) : String(Math.round(bounded))
        onCommit(hasPercent ? `${formatted}%` : formatted)
      },
      [wrap, min, max, decimals, hasPercent, onCommit],
    )

    return (
      <NumberField.Root
        value={fieldValue}
        onValueChange={(next, eventDetails) => {
          if (next == null) return
          const reason = eventDetails.reason
          if (reason === "input-change" || reason === "input-paste" || reason === "input-clear") {
            return
          }
          commit(next)
        }}
        onValueCommitted={(_, eventDetails) => {
          if (eventDetails.reason === "scrub") {
            pointerDownRef.current = false
            inputRef.current?.blur()
          }
        }}
        min={wrap ? undefined : min}
        max={wrap ? undefined : max}
        step={nudgeStep ?? 1}
        largeStep={nudgeShiftStep ?? 10}
        format={format}
        className={cn(
          "hover:bg-hover active:bg-active flex items-center bg-transparent ring-1 ring-transparent transition-[background-color,box-shadow] duration-80 select-none focus-within:ring-(--focus-ring)",
          sizeClasses.control,
          shape.input,
          className,
        )}
        style={{ width }}
      >
        <NumberField.ScrubArea
          direction="horizontal"
          pixelSensitivity={1}
          onPointerDownCapture={() => {
            pointerDownRef.current = true
          }}
          onClick={() => {
            pointerDownRef.current = false
            setEditing(true)
            inputRef.current?.focus()
            inputRef.current?.select()
          }}
          className={cn(
            "flex min-w-0 flex-1 items-center self-stretch px-2",
            !editing && "cursor-ew-resize",
          )}
        >
          <NumberField.ScrubAreaCursor className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
            <svg
              width={24}
              height={14}
              viewBox="0 0 24 14"
              fill="#000"
              stroke="#fff"
              strokeWidth={1}
              aria-hidden="true"
            >
              <path d="M0.5 7l5-5v3.5h13V2l5 5-5 5V8.5h-13V12l-5-5z" />
            </svg>
          </NumberField.ScrubAreaCursor>
          {prefix && (
            <span className={cn("text-muted-foreground mr-1 select-none", sizeClasses.caption)}>
              {prefix}
            </span>
          )}
          <NumberField.Input
            ref={setInputRef}
            aria-label={ariaLabel}
            inputMode={inputMode}
            onPointerDown={(e) => {
              if (editing) e.stopPropagation()
            }}
            onFocus={(e) => {
              if (pointerDownRef.current) return
              setEditing(true)
              e.currentTarget.select()
            }}
            onBlur={() => {
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur()
              } else if (e.key === "Escape") {
                const input = e.currentTarget
                const setter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  "value",
                )?.set?.bind(input)
                if (setter && fieldValue != null) {
                  const restored =
                    decimals != null ? fieldValue.toFixed(decimals) : String(Math.round(fieldValue))
                  setter(hasPercent ? `${restored}%` : restored)
                  input.dispatchEvent(new Event("input", { bubbles: true }))
                }
                input.blur()
              }
            }}
            className={cn(
              "text-foreground min-w-0 flex-1 bg-transparent tabular-nums outline-none",
              sizeClasses.text,
              align === "center" && "text-center",
              align === "right" && "text-right",
              !editing && "pointer-events-none",
              inputClassName,
            )}
            style={{ fontVariationSettings: fontWeights.medium }}
          />
        </NumberField.ScrubArea>
      </NumberField.Root>
    )
  },
)

ScrubColorInput.displayName = "ScrubColorInput"

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  ({ scrubbable = false, ...props }, ref) =>
    scrubbable ? <ScrubColorInput ref={ref} {...props} /> : <TextColorInput ref={ref} {...props} />,
)

ColorInput.displayName = "ColorInput"
