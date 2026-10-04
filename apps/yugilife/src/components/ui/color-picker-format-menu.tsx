"use client"

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Menu } from "@base-ui/react/menu"
import { motion } from "framer-motion"

import { useProximityHover } from "@/hooks/use-proximity-hover"
import { Elevated } from "@/lib/elevated"
import { fontWeights } from "@/lib/font-weight"
import { useIcon } from "@/lib/icon-context"
import { popupShape, useShape } from "@/lib/shape-context"
import { useSize } from "@/lib/size-context"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { ColorPickerPortalContainerContext } from "./color-picker-portal"
import { FocusRing, HoverHighlight, SelectedHighlight } from "./highlights"

import type { ColorFormat } from "@/lib/color-space"

const FORMAT_LABELS: Record<ColorFormat, string> = {
  hex: "HEX",
  rgb: "RGB",
  hsl: "HSL",
  oklch: "OKLCH",
}

const FORMATS = ["hex", "rgb", "hsl", "oklch"] as const

const menuShape = popupShape

interface FormatMenuContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void
  activeIndex: number | null
  checkedIndex?: number
}

const FormatMenuContext = createContext<FormatMenuContextValue | null>(null)

function FormatItem({
  index,
  value,
  label,
  checked,
}: {
  index: number
  value: ColorFormat
  label: string
  checked: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const menuCtx = useContext(FormatMenuContext)
  const shape = useShape()
  const sizeClasses = useSize()
  const compact = sizeClasses.variant === "compact"

  useEffect(() => {
    menuCtx?.registerItem(index, ref.current)
    return () => menuCtx?.registerItem(index, null)
  }, [index, menuCtx])

  const isActive = menuCtx?.activeIndex === index

  return (
    <Menu.RadioItem
      value={value}
      label={label}
      closeOnClick
      render={
        <div
          ref={ref}
          data-proximity-index={index}
          className={cn(
            "relative z-10 flex cursor-pointer items-center outline-none",
            compact ? "px-2.5 py-1.5" : "px-3 py-2",
            sizeClasses.text,
            shape.item,
          )}
        />
      }
    >
      <span className="inline-grid">
        <span
          className="invisible col-start-1 row-start-1"
          style={{ fontVariationSettings: fontWeights.semibold }}
          aria-hidden="true"
        >
          {label}
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80",
            isActive || checked ? "text-foreground" : "text-muted-foreground",
          )}
          style={{
            fontVariationSettings: checked ? fontWeights.semibold : fontWeights.normal,
          }}
        >
          {label}
        </span>
      </span>
    </Menu.RadioItem>
  )
}

export function FormatDropdown({
  value,
  onChange,
  open: openProp,
  defaultOpen = false,
}: {
  value: ColorFormat
  onChange: (f: ColorFormat) => void
  open?: boolean
  defaultOpen?: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen
  const actionsRef = useRef<{ unmount: () => void; close: () => void } | null>(null)
  const shape = useShape()
  const sizeClasses = useSize()
  const portalContainer = useContext(ColorPickerPortalContainerContext)
  const containerRef = useRef<HTMLDivElement>(null)
  const ChevronDownIcon = useIcon("chevron-down")

  const {
    activeIndex,
    setActiveIndex,
    itemRects,
    sessionId,
    handlers,
    registerItem,
    measureItems,
  } = useProximityHover(containerRef)

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (open) return
    const id = setTimeout(() => actionsRef.current?.unmount(), 120)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    let inner: number
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        measureItems()
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [open, measureItems])

  const checkedIndex = FORMATS.indexOf(value)
  const activeRect = activeIndex !== null ? itemRects[activeIndex] : null
  const checkedRect = checkedIndex !== -1 ? itemRects[checkedIndex] : null
  const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null
  const menuCtx = useMemo(
    () => ({ registerItem, activeIndex, checkedIndex }),
    [registerItem, activeIndex, checkedIndex],
  )

  return (
    <Menu.Root
      open={open}
      onOpenChange={(next) => {
        if (!isControlled) setInternalOpen(next)
      }}
      actionsRef={actionsRef}
      modal={false}
    >
      <Menu.Trigger
        className={cn(
          "hover:bg-hover hover:text-foreground flex cursor-pointer items-center justify-between bg-transparent ring-1 ring-transparent transition-[color,background-color,box-shadow] duration-80 outline-none focus-visible:ring-(--focus-ring)",
          sizeClasses.gap,
          sizeClasses.control,
          sizeClasses.px,
          sizeClasses.text,
          open ? "bg-active text-foreground" : "text-muted-foreground active:bg-active",
          shape.input,
        )}
        style={{ fontVariationSettings: fontWeights.medium }}
      >
        <span>{FORMAT_LABELS[value]}</span>
        {createElement(ChevronDownIcon, {
          size: 14,
          strokeWidth: 1.5,
          className: cn(
            "text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          ),
        })}
      </Menu.Trigger>
      <Menu.Portal container={portalContainer ?? undefined}>
        <Menu.Positioner side="bottom" align="start" sideOffset={6} className="z-60 outline-none">
          <motion.div
            initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
            animate={open ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -4, scaleY: 0.96 }}
            transition={open ? spring.fast : spring.fast.exit}
            style={{ transformOrigin: "top center" }}
            onAnimationComplete={() => {
              if (!open) actionsRef.current?.unmount()
            }}
          >
            <FormatMenuContext.Provider value={menuCtx}>
              <Menu.Popup
                render={
                  <Elevated
                    offset={2}
                    shadowLevel={3}
                    ref={(node: HTMLDivElement | null) => {
                      containerRef.current = node
                    }}
                  />
                }
                onMouseEnter={() => {
                  handlers.onMouseEnter()
                  setFocusedIndex(null)
                }}
                onMouseMove={handlers.onMouseMove}
                onMouseLeave={handlers.onMouseLeave}
                onFocus={(e) => {
                  const indexAttr = (e.target as HTMLElement)
                    .closest("[data-proximity-index]")
                    ?.getAttribute("data-proximity-index")
                  if (indexAttr != null) {
                    const idx = Number(indexAttr)
                    setActiveIndex(idx)
                    setFocusedIndex(
                      (e.target as HTMLElement).matches(":focus-visible") ? idx : null,
                    )
                  }
                }}
                onBlur={(e) => {
                  if (containerRef.current?.contains(e.relatedTarget)) return
                  setFocusedIndex(null)
                  setActiveIndex(null)
                }}
                className={cn(
                  `relative flex min-w-(--anchor-width) flex-col gap-0.5 ${menuShape.container} p-1 outline-none select-none`,
                )}
              >
                <SelectedHighlight className={menuShape.bg} rect={checkedRect} />

                <HoverHighlight
                  className={menuShape.bg}
                  from={checkedRect}
                  rect={activeRect}
                  sessionKey={sessionId}
                />

                <FocusRing className={menuShape.focusRing} rect={focusRect} />

                <Menu.RadioGroup
                  value={value}
                  onValueChange={(next) => onChange(next as ColorFormat)}
                  className="contents"
                >
                  {FORMATS.map((fmt, i) => (
                    <FormatItem
                      key={fmt}
                      index={i}
                      value={fmt}
                      label={FORMAT_LABELS[fmt]}
                      checked={value === fmt}
                    />
                  ))}
                </Menu.RadioGroup>
              </Menu.Popup>
            </FormatMenuContext.Provider>
          </motion.div>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
