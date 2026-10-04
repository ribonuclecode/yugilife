"use client"

import {
  createElement,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Popover } from "@base-ui/react/popover"
import { motion } from "framer-motion"

import { Tooltip } from "@/components/ui/tooltip"
import {
  buildParsed,
  clamp01,
  formatValueByFormat,
  hslToRgb,
  hsvToRgb,
  oklchToRgb,
  parseColor,
  resolveCssColor,
  rgbToHexStr,
  rgbToHsl,
  rgbToHsv,
  rgbToOklch,
} from "@/lib/color-space"
import { fontWeights } from "@/lib/font-weight"
import { useIcon } from "@/lib/icon-context"
import { useShape } from "@/lib/shape-context"
import { SizeProvider, useSize } from "@/lib/size-context"
import { spring } from "@/lib/springs"
import { surfaceClasses } from "@/lib/surface-classes"
import { SurfaceProvider, useSurface } from "@/lib/surface-context"
import { cn } from "@/lib/utils"

import { FormatDropdown } from "./color-picker-format-menu"
import { ColorInput } from "./color-picker-inputs"
import { ColorPickerPortalContainerContext } from "./color-picker-portal"
import { AlphaSlider, HueSlider, PANEL_WIDTH, SaturationSquare } from "./color-picker-surfaces"

import type { ColorFormat, ParsedColor } from "@/lib/color-space"
import type { SizeVariant } from "@/lib/size-context"
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"

const CHECKER_BG: CSSProperties = {
  backgroundImage:
    "conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%, var(--checker-a) 0 75%, var(--checker-b) 0)",
  backgroundSize: "8px 8px",
}

function ColorPickerPortalContainer({
  value,
  children,
}: {
  value: HTMLElement | null
  children: ReactNode
}) {
  return (
    <ColorPickerPortalContainerContext.Provider value={value}>
      {children}
    </ColorPickerPortalContainerContext.Provider>
  )
}

interface ColorPickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string, parsed: ParsedColor) => void
  format?: ColorFormat
  defaultFormat?: ColorFormat
  onFormatChange?: (format: ColorFormat) => void
  swatches?: string[]
  hideEyedropper?: boolean
  formatOpen?: boolean
  defaultFormatOpen?: boolean
  size?: SizeVariant
}

interface ColorPickerPopoverProps extends ColorPickerProps {
  triggerLabel?: string
  triggerLabelPosition?: "left" | "right"
  triggerShowValue?: boolean
  triggerShowRemove?: boolean
  onTriggerRemove?: () => void
  triggerClassName?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

interface ColorSwatchProps extends Omit<HTMLAttributes<HTMLButtonElement>, "color"> {
  color: string
  size?: number
  selected?: boolean
}

interface EyeDropperGlobal {
  open(): Promise<{ sRGBHex: string }>
}

function EyeDropperButton({ onPick }: { onPick: (hex: string) => void }) {
  const [supported, setSupported] = useState(false)
  const shape = useShape()
  const sizeClasses = useSize()
  const PipetteIcon = useIcon("pipette")

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSupported(typeof window !== "undefined" && "EyeDropper" in window)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  if (!supported) return null

  const handleClick = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: new () => EyeDropperGlobal }).EyeDropper
      const eye = new Ctor()
      const result = await eye.open()
      onPick(result.sRGBHex)
    } catch {
      // user cancelled
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-label="Pick color from screen"
      className={cn(
        "text-muted-foreground hover:bg-hover hover:text-foreground active:bg-active flex cursor-pointer items-center justify-center bg-transparent ring-1 ring-transparent transition-[color,background-color,box-shadow] duration-80 outline-none focus-visible:ring-(--focus-ring)",
        sizeClasses.control,
        sizeClasses.px,
        shape.input,
      )}
    >
      {createElement(PipetteIcon, { size: sizeClasses.icon, strokeWidth: 1.5 })}
    </button>
  )
}

interface ColorTileProps {
  color: string
  size?: number
  className?: string
  style?: CSSProperties
}

function ColorTile({ color, size = 24, className, style }: ColorTileProps) {
  const shape = useShape()
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden", shape.bg, className)}
      style={{
        width: size,
        height: size,
        ...CHECKER_BG,
        boxShadow: "inset 0 0 0 1px rgba(127,127,127,0.25)",
        ...style,
      }}
    >
      <span className="absolute inset-0" style={{ backgroundColor: color }} />
    </span>
  )
}

const ColorSwatch = forwardRef<HTMLButtonElement, ColorSwatchProps>(
  ({ color, size = 28, selected, className, onMouseEnter, onMouseLeave, ...props }, ref) => {
    const shape = useShape()
    const [hovered, setHovered] = useState(false)
    const ring = selected
      ? "inset 0 0 0 1px rgba(127,127,127,0.25), 0 0 0 2px var(--background), 0 0 0 4px var(--focus-ring)"
      : hovered
        ? "inset 0 0 0 1px rgba(127,127,127,0.25), 0 0 0 2px var(--background), 0 0 0 4px rgba(127,127,127,0.4)"
        : "inset 0 0 0 1px rgba(127,127,127,0.25), 0 0 0 2px transparent, 0 0 0 4px transparent"
    return (
      <button
        ref={ref}
        type="button"
        aria-label={`Select color ${color}`}
        className={cn(
          "relative shrink-0 cursor-pointer overflow-hidden transition-shadow duration-100 outline-none",
          shape.bg,
          className,
        )}
        style={{
          width: size,
          height: size,
          ...CHECKER_BG,
          boxShadow: ring,
        }}
        onMouseEnter={(e) => {
          setHovered(true)
          onMouseEnter?.(e)
        }}
        onMouseLeave={(e) => {
          setHovered(false)
          onMouseLeave?.(e)
        }}
        {...props}
      >
        <span className="absolute inset-0" style={{ backgroundColor: color }} />
      </button>
    )
  },
)

ColorSwatch.displayName = "ColorSwatch"

function SwatchStrip({
  swatches,
  current,
  onPick,
}: {
  swatches: string[]
  current: string
  onPick: (color: string) => void
}) {
  const normalizedCurrent = useMemo(() => {
    const p = parseColor(current)
    return p ? rgbToHexStr(p.r, p.g, p.b, p.a).toLowerCase() : ""
  }, [current])

  const [resolvedSwatches, setResolvedSwatches] = useState<Record<string, string>>({})
  useEffect(() => {
    const next: Record<string, string> = {}
    for (const sw of swatches) {
      if (!parseColor(sw)) {
        const p = resolveCssColor(sw)
        if (p) next[sw] = rgbToHexStr(p.r, p.g, p.b, p.a).toLowerCase()
      }
    }
    const frame = requestAnimationFrame(() => setResolvedSwatches(next))
    return () => cancelAnimationFrame(frame)
  }, [swatches])

  return (
    <div className="flex flex-wrap gap-2">
      {swatches.map((sw, i) => {
        const parsed = parseColor(sw)
        const normalized = parsed
          ? rgbToHexStr(parsed.r, parsed.g, parsed.b, parsed.a).toLowerCase()
          : (resolvedSwatches[sw] ?? sw.toLowerCase())
        const isSelected = normalized === normalizedCurrent
        return (
          <ColorSwatch
            key={`${sw}-${i}`}
            color={sw}
            size={28}
            selected={isSelected}
            onClick={() => onPick(sw)}
          />
        )
      })}
    </div>
  )
}

const ColorPicker = memo(
  forwardRef<HTMLDivElement, ColorPickerProps>(
    (
      {
        value,
        defaultValue = "#6B97FF",
        onValueChange,
        format,
        defaultFormat = "hex",
        onFormatChange,
        swatches,
        hideEyedropper,
        formatOpen,
        defaultFormatOpen,
        size,
        title = "Color",
        className,
        ...props
      },
      ref,
    ) => {
      const isControlled = value !== undefined
      const [internalValue, setInternalValue] = useState(value ?? defaultValue)
      const currentRawValue = isControlled ? value : internalValue

      const isFormatControlled = format !== undefined
      const [internalFormat, setInternalFormat] = useState<ColorFormat>(defaultFormat)
      const currentFormat = isFormatControlled ? format : internalFormat

      const [hsv, setHsv] = useState(() => {
        const p = parseColor(currentRawValue)
        if (!p) return { h: 0, s: 1, v: 1, a: 1 }
        const hsv = rgbToHsv(p.r, p.g, p.b)
        return { h: hsv.s === 0 ? 0 : hsv.h, s: hsv.s, v: hsv.v, a: p.a }
      })

      const [oklchHue, setOklchHue] = useState<number | null>(null)

      const lastEmittedRef = useRef<string>("")
      useEffect(() => {
        if (!isControlled) return
        const emitted = lastEmittedRef.current
        const cur = value
        if (cur === emitted) return
        const p = parseColor(cur)
        if (!p) return
        const newHsv = rgbToHsv(p.r, p.g, p.b)
        const frame = requestAnimationFrame(() => {
          setOklchHue(null)
          setHsv((prev) => ({
            h: newHsv.s === 0 ? prev.h : newHsv.h,
            s: newHsv.s,
            v: newHsv.v,
            a: p.a,
          }))
        })
        return () => cancelAnimationFrame(frame)
      }, [value, isControlled])

      const parsed = useMemo(() => buildParsed(hsv.h, hsv.s, hsv.v, hsv.a), [hsv])

      const updateHsv = useCallback(
        (next: { h?: number; s?: number; v?: number; a?: number }) => {
          const merged = { ...hsv, ...next }
          setHsv(merged)
          const p = buildParsed(merged.h, merged.s, merged.v, merged.a)
          const formatted = formatValueByFormat(p, currentFormat)
          lastEmittedRef.current = formatted
          if (!isControlled) setInternalValue(formatted)
          onValueChange?.(formatted, p)
        },
        [hsv, currentFormat, isControlled, onValueChange],
      )

      const handleFormatChange = useCallback(
        (f: ColorFormat) => {
          if (!isFormatControlled) setInternalFormat(f)
          onFormatChange?.(f)
          const formatted = formatValueByFormat(parsed, f)
          lastEmittedRef.current = formatted
          if (!isControlled) setInternalValue(formatted)
          onValueChange?.(formatted, parsed)
        },
        [isFormatControlled, isControlled, onFormatChange, onValueChange, parsed],
      )

      const handleHexCommit = useCallback(
        (input: string) => {
          const p = resolveCssColor(input)
          if (!p) return
          setOklchHue(null)
          const newHsv = rgbToHsv(p.r, p.g, p.b)
          const merged = {
            h: newHsv.s === 0 ? hsv.h : newHsv.h,
            s: newHsv.s,
            v: newHsv.v,
            a: p.a,
          }
          setHsv(merged)
          const next = buildParsed(merged.h, merged.s, merged.v, merged.a)
          const formatted = formatValueByFormat(next, currentFormat)
          lastEmittedRef.current = formatted
          if (!isControlled) setInternalValue(formatted)
          onValueChange?.(formatted, next)
        },
        [hsv.h, currentFormat, isControlled, onValueChange],
      )

      const handleSwatchPick = useCallback(
        (sw: string) => {
          handleHexCommit(sw)
        },
        [handleHexCommit],
      )

      const handleEyedrop = useCallback(
        (hex: string) => {
          handleHexCommit(hex)
        },
        [handleHexCommit],
      )

      const solidHueRgb = useMemo(() => hsvToRgb(hsv.h, hsv.s, hsv.v), [hsv.h, hsv.s, hsv.v])
      const solidR = Math.round(solidHueRgb.r)
      const solidG = Math.round(solidHueRgb.g)
      const solidB = Math.round(solidHueRgb.b)
      const solidColorString = `rgb(${solidR}, ${solidG}, ${solidB})`
      const shape = useShape()
      const sizeClasses = useSize(size)
      const substrate = useSurface()
      const pickerLevel = Math.max(substrate, 3)

      const root = (
        <SurfaceProvider value={pickerLevel}>
          <div
            ref={ref}
            className={cn(
              "flex flex-col gap-2 p-3",
              surfaceClasses(pickerLevel, 1),
              shape.container,
              className,
            )}
            style={{ width: PANEL_WIDTH }}
            {...props}
          >
            {title && (
              <div
                className={cn("text-foreground px-1 pb-1", sizeClasses.subtitle)}
                style={{ fontVariationSettings: fontWeights.medium }}
              >
                {title}
              </div>
            )}

            <SaturationSquare
              h={hsv.h}
              s={hsv.s}
              v={hsv.v}
              onChange={(s, v) => updateHsv({ s, v })}
            />

            <div className="flex flex-col *:mb-0 [&>*+*]:-mt-px">
              <HueSlider
                h={hsv.h}
                onChange={(h) => {
                  setOklchHue(null)
                  updateHsv({ h })
                }}
              />
              <AlphaSlider
                a={hsv.a}
                solidColor={solidColorString}
                solidR={solidR}
                solidG={solidG}
                solidB={solidB}
                onChange={(a) => updateHsv({ a })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FormatDropdown
                value={currentFormat}
                onChange={handleFormatChange}
                {...(formatOpen === undefined ? {} : { open: formatOpen })}
                {...(defaultFormatOpen === undefined ? {} : { defaultOpen: defaultFormatOpen })}
              />
              {!hideEyedropper && <EyeDropperButton onPick={handleEyedrop} />}
            </div>

            <ColorInputsRow
              parsed={parsed}
              format={currentFormat}
              oklchHue={oklchHue}
              onChannelChange={(channel, value) => {
                const p = { ...parsed }
                switch (channel) {
                  case "hex":
                    handleHexCommit(value)
                    return
                  case "r":
                  case "g":
                  case "b": {
                    setOklchHue(null)
                    const r = channel === "r" ? Number(value) : p.r
                    const g = channel === "g" ? Number(value) : p.g
                    const b = channel === "b" ? Number(value) : p.b
                    const hsvVal = rgbToHsv(r, g, b)
                    updateHsv({
                      h: hsvVal.s === 0 ? hsv.h : hsvVal.h,
                      s: hsvVal.s,
                      v: hsvVal.v,
                    })
                    return
                  }
                  case "hSL":
                  case "sSL":
                  case "lSL": {
                    if (channel === "hSL") setOklchHue(null)
                    const hsl = rgbToHsl(p.r, p.g, p.b)
                    const h2 = channel === "hSL" ? Number(value) : hsl.h
                    const s2 = channel === "sSL" ? Number(value) / 100 : hsl.s
                    const l2 = channel === "lSL" ? Number(value) / 100 : hsl.l
                    const rgb = hslToRgb(h2, clamp01(s2), clamp01(l2))
                    const hsvVal = rgbToHsv(rgb.r, rgb.g, rgb.b)
                    updateHsv({
                      h: hsvVal.s === 0 ? h2 : hsvVal.h,
                      s: hsvVal.s,
                      v: hsvVal.v,
                    })
                    return
                  }
                  case "L":
                  case "C":
                  case "H": {
                    const cur = rgbToOklch(p.r, p.g, p.b)
                    const baseH = oklchHue ?? cur.H
                    const L = channel === "L" ? Number(value) / 100 : cur.L
                    const C = channel === "C" ? Number(value) : cur.C
                    const H = channel === "H" ? Number(value) : baseH
                    setOklchHue(H)
                    const rgb = oklchToRgb(clamp01(L), Math.max(0, C), H)
                    const hsvVal = rgbToHsv(rgb.r, rgb.g, rgb.b)
                    updateHsv({
                      h: hsvVal.s === 0 ? hsv.h : hsvVal.h,
                      s: hsvVal.s,
                      v: hsvVal.v,
                    })
                    return
                  }
                  case "alphaPercent": {
                    const a = clamp01(Number(value) / 100)
                    updateHsv({ a })
                    return
                  }
                }
              }}
            />

            {swatches && swatches.length > 0 && (
              <SwatchStrip swatches={swatches} current={parsed.hex} onPick={handleSwatchPick} />
            )}
          </div>
        </SurfaceProvider>
      )

      return size ? <SizeProvider size={size}>{root}</SizeProvider> : root
    },
  ),
)

ColorPicker.displayName = "ColorPicker"

type ChannelKey = "hex" | "r" | "g" | "b" | "hSL" | "sSL" | "lSL" | "L" | "C" | "H" | "alphaPercent"

function ColorInputsRow({
  parsed,
  format,
  oklchHue,
  onChannelChange,
}: {
  parsed: ParsedColor
  format: ColorFormat
  oklchHue?: number | null
  onChannelChange: (key: ChannelKey, value: string) => void
}) {
  const alphaPct = Math.round(parsed.a * 100)

  if (format === "hex") {
    const hexNoHash = parsed.hex.replace(/^#/, "").toUpperCase()
    return (
      <div className="grid grid-cols-2 gap-2">
        <ChannelTooltip label="Hex">
          <ColorInput
            value={hexNoHash}
            onCommit={(next) => onChannelChange("hex", next.startsWith("#") ? next : `#${next}`)}
            ariaLabel="Hex value"
            prefix="#"
          />
        </ChannelTooltip>
        <AlphaInput value={alphaPct} onCommit={(n) => onChannelChange("alphaPercent", String(n))} />
      </div>
    )
  }

  if (format === "rgb") {
    return (
      <div className="grid grid-cols-4 gap-1">
        <ChannelTooltip label="Red">
          <ColorInput
            value={String(parsed.r)}
            onCommit={(n) => onChannelChange("r", n)}
            ariaLabel="Red"
            align="center"
            inputMode="numeric"
            nudgeStep={1}
            nudgeShiftStep={10}
            scrubbable
            min={0}
            max={255}
          />
        </ChannelTooltip>
        <ChannelTooltip label="Green">
          <ColorInput
            value={String(parsed.g)}
            onCommit={(n) => onChannelChange("g", n)}
            ariaLabel="Green"
            align="center"
            inputMode="numeric"
            nudgeStep={1}
            nudgeShiftStep={10}
            scrubbable
            min={0}
            max={255}
          />
        </ChannelTooltip>
        <ChannelTooltip label="Blue">
          <ColorInput
            value={String(parsed.b)}
            onCommit={(n) => onChannelChange("b", n)}
            ariaLabel="Blue"
            align="center"
            inputMode="numeric"
            nudgeStep={1}
            nudgeShiftStep={10}
            scrubbable
            min={0}
            max={255}
          />
        </ChannelTooltip>
        <AlphaInput value={alphaPct} onCommit={(n) => onChannelChange("alphaPercent", String(n))} />
      </div>
    )
  }

  if (format === "hsl") {
    const hsl = rgbToHsl(parsed.r, parsed.g, parsed.b)
    return (
      <div className="grid grid-cols-4 gap-1">
        <ChannelTooltip label="Hue">
          <ColorInput
            value={String(Math.round(hsl.h))}
            onCommit={(n) => onChannelChange("hSL", n)}
            ariaLabel="Hue"
            align="center"
            inputMode="numeric"
            nudgeStep={1}
            nudgeShiftStep={10}
            scrubbable
            min={0}
            max={360}
            wrap
          />
        </ChannelTooltip>
        <ChannelTooltip label="Saturation">
          <ColorInput
            value={String(Math.round(hsl.s * 100))}
            onCommit={(n) => onChannelChange("sSL", n)}
            ariaLabel="Saturation"
            align="center"
            inputMode="numeric"
            nudgeStep={1}
            nudgeShiftStep={10}
            scrubbable
            min={0}
            max={100}
          />
        </ChannelTooltip>
        <ChannelTooltip label="Lightness">
          <ColorInput
            value={String(Math.round(hsl.l * 100))}
            onCommit={(n) => onChannelChange("lSL", n)}
            ariaLabel="Lightness"
            align="center"
            inputMode="numeric"
            nudgeStep={1}
            nudgeShiftStep={10}
            scrubbable
            min={0}
            max={100}
          />
        </ChannelTooltip>
        <AlphaInput value={alphaPct} onCommit={(n) => onChannelChange("alphaPercent", String(n))} />
      </div>
    )
  }

  const oklch = rgbToOklch(parsed.r, parsed.g, parsed.b)
  const displayH = oklchHue ?? oklch.H
  return (
    <div className="grid grid-cols-4 gap-1">
      <ChannelTooltip label="Lightness">
        <ColorInput
          value={(oklch.L * 100).toFixed(0)}
          onCommit={(n) => onChannelChange("L", n)}
          ariaLabel="Lightness"
          align="center"
          inputMode="decimal"
          nudgeStep={1}
          nudgeShiftStep={10}
          scrubbable
          min={0}
          max={100}
        />
      </ChannelTooltip>
      <ChannelTooltip label="Chroma">
        <ColorInput
          value={oklch.C.toFixed(2)}
          onCommit={(n) => onChannelChange("C", n)}
          ariaLabel="Chroma"
          align="center"
          inputMode="decimal"
          nudgeStep={0.01}
          nudgeShiftStep={0.1}
          decimals={2}
          scrubbable
          min={0}
          max={0.4}
        />
      </ChannelTooltip>
      <ChannelTooltip label="Hue">
        <ColorInput
          value={displayH.toFixed(0)}
          onCommit={(n) => onChannelChange("H", n)}
          ariaLabel="Hue"
          align="center"
          inputMode="numeric"
          nudgeStep={1}
          nudgeShiftStep={10}
          scrubbable
          min={0}
          max={360}
          wrap
        />
      </ChannelTooltip>
      <AlphaInput value={alphaPct} onCommit={(n) => onChannelChange("alphaPercent", String(n))} />
    </div>
  )
}

function ChannelTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={label} delayDuration={300}>
      <div>{children}</div>
    </Tooltip>
  )
}

function AlphaInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  return (
    <ChannelTooltip label="Alpha">
      <ColorInput
        value={`${value}%`}
        onCommit={(input) => {
          const n = parseFloat(input.replace("%", ""))
          if (Number.isNaN(n)) return
          onCommit(Math.max(0, Math.min(100, Math.round(n))))
        }}
        ariaLabel="Alpha"
        align="center"
        inputMode="numeric"
        nudgeStep={1}
        nudgeShiftStep={10}
        hasPercent
        scrubbable
        min={0}
        max={100}
      />
    </ChannelTooltip>
  )
}

const ColorPickerPopover = memo(
  forwardRef<HTMLDivElement, ColorPickerPopoverProps>(
    (
      {
        triggerLabel,
        triggerLabelPosition = "left",
        triggerShowValue = true,
        triggerShowRemove = false,
        onTriggerRemove,
        triggerClassName,
        open: openProp,
        defaultOpen = false,
        onOpenChange,
        size,
        ...pickerProps
      },
      ref,
    ) => {
      const isOpenControlled = openProp !== undefined
      const [internalOpen, setInternalOpen] = useState(defaultOpen)
      const open = isOpenControlled ? openProp : internalOpen
      const actionsRef = useRef<{ unmount: () => void; close: () => void } | null>(null)
      const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null)
      const shape = useShape()
      const sizeClasses = useSize(size)
      const compact = sizeClasses.variant === "compact"
      const substrate = useSurface()
      const level = Math.min(substrate + 2, 8)

      const handleOpenChange = useCallback(
        (next: boolean) => {
          if (!isOpenControlled) setInternalOpen(next)
          onOpenChange?.(next)
        },
        [isOpenControlled, onOpenChange],
      )

      const isControlled = pickerProps.value !== undefined
      const [internalValue, setInternalValue] = useState(
        pickerProps.value ?? pickerProps.defaultValue ?? "#936bff",
      )
      const currentValue = isControlled ? (pickerProps.value as string) : internalValue
      const externalOnValueChange = pickerProps.onValueChange
      const pickerClassName = pickerProps.className

      const handleValueChange = useCallback(
        (v: string, parsed: ParsedColor) => {
          if (!isControlled) setInternalValue(v)
          externalOnValueChange?.(v, parsed)
        },
        [externalOnValueChange, isControlled],
      )

      useEffect(() => {
        if (open) return
        const id = setTimeout(() => actionsRef.current?.unmount(), 150)
        return () => clearTimeout(id)
      }, [open])

      const XIcon = useIcon("x")
      const parsed = useMemo(() => parseColor(currentValue), [currentValue])
      const swatchColor = parsed
        ? rgbToHexStr(parsed.r, parsed.g, parsed.b, parsed.a)
        : currentValue
      const valueLabel = parsed
        ? rgbToHexStr(parsed.r, parsed.g, parsed.b, 1).replace(/^#/, "").toUpperCase()
        : currentValue

      const root = (
        <Popover.Root
          open={open}
          onOpenChange={handleOpenChange}
          actionsRef={actionsRef}
          modal={false}
        >
          <div ref={ref} className="inline-flex">
            <Popover.Trigger
              className={cn(
                "border-border hover:bg-hover flex cursor-pointer items-center border bg-transparent ring-1 ring-transparent transition-[background-color,border-color,box-shadow] duration-80 outline-none focus-visible:ring-(--focus-ring)",
                sizeClasses.gap,
                sizeClasses.control,
                compact ? "px-1.5" : "px-2",
                shape.input,
                triggerClassName,
              )}
              style={{ fontVariationSettings: fontWeights.medium }}
            >
              {triggerLabel && triggerLabelPosition === "left" && (
                <span className={cn("text-muted-foreground px-1 select-none", sizeClasses.text)}>
                  {triggerLabel}
                </span>
              )}
              <ColorTile color={swatchColor} size={compact ? 16 : 20} />
              {triggerShowValue && (
                <span className={cn("text-foreground tabular-nums", sizeClasses.text)}>
                  {valueLabel}
                </span>
              )}
              {triggerLabel && triggerLabelPosition === "right" && (
                <span className={cn("text-muted-foreground px-1 select-none", sizeClasses.text)}>
                  {triggerLabel}
                </span>
              )}
              {triggerShowRemove && (
                <span
                  role="button"
                  aria-label="Remove color"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onTriggerRemove?.()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation()
                      e.preventDefault()
                      onTriggerRemove?.()
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground ml-1 flex cursor-pointer items-center"
                >
                  {createElement(XIcon, { size: 14, strokeWidth: 1.5 })}
                </span>
              )}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner
                side="bottom"
                align="start"
                sideOffset={6}
                className="z-50 outline-none"
              >
                <motion.div
                  initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
                  animate={
                    open ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -4, scaleY: 0.96 }
                  }
                  transition={open ? spring.moderate : spring.moderate.exit}
                  style={{ transformOrigin: "top left" }}
                  onAnimationComplete={() => {
                    if (!open) actionsRef.current?.unmount()
                  }}
                >
                  <Popover.Popup render={<div ref={setPanelEl} />} className="outline-none">
                    <ColorPickerPortalContainer value={panelEl}>
                      <SurfaceProvider value={level}>
                        <ColorPicker
                          {...pickerProps}
                          value={currentValue}
                          onValueChange={handleValueChange}
                          className={cn(surfaceClasses(level, 3), pickerClassName)}
                        />
                      </SurfaceProvider>
                    </ColorPickerPortalContainer>
                  </Popover.Popup>
                </motion.div>
              </Popover.Positioner>
            </Popover.Portal>
          </div>
        </Popover.Root>
      )

      return size ? <SizeProvider size={size}>{root}</SizeProvider> : root
    },
  ),
)

ColorPickerPopover.displayName = "ColorPickerPopover"

export { ColorPicker, ColorPickerPopover }

export type {
  ColorFormat,
  ColorPickerPopoverProps,
  ColorPickerProps,
  ColorSwatchProps,
  ParsedColor,
}
