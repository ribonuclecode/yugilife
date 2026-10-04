import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import * as TabsPrimitive from "@radix-ui/react-tabs"
import { AnimatePresence, motion } from "framer-motion"

import { useProximityHover } from "@/hooks/use-proximity-hover"
import { fontWeights } from "@/lib/font-weight"
import { useShape } from "@/lib/shape-context"
import { SizeProvider, useSize } from "@/lib/size-context"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { FocusRing } from "./highlights"

import type { IconComponent } from "@/lib/icon-context"
import type { SizeVariant } from "@/lib/size-context"
import type { HTMLAttributes, ReactNode } from "react"

interface TabsSubtleContextValue {
  registerTab: (index: number, element: HTMLElement | null) => void
  hoveredIndex: number | null
  selectedIndex: number
  idPrefix: string | undefined
  activeLabel: boolean
}

const TabsSubtleContext = createContext<TabsSubtleContextValue | null>(null)

function useTabsSubtle() {
  const ctx = useContext(TabsSubtleContext)
  if (!ctx) throw new Error("useTabsSubtle must be used within a TabsSubtle")
  return ctx
}

interface TabsSubtleProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  children: ReactNode
  selectedIndex: number
  onSelect: (index: number) => void
  idPrefix?: string
  activeLabel?: boolean
  size?: SizeVariant
}

const TabsSubtle = forwardRef<HTMLDivElement, TabsSubtleProps>(
  (
    { children, selectedIndex, onSelect, idPrefix, activeLabel = false, size, className, ...props },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isMouseInside, setIsMouseInside] = useState(false)
    const shape = useShape()

    const {
      activeIndex: hoveredIndex,
      setActiveIndex: setHoveredIndex,
      itemRects: tabRects,
      handlers,
      registerItem,
      measureItems: measureTabs,
    } = useProximityHover(containerRef, { axis: "x" })

    const tabElementsRef = useRef(new Map<number, HTMLElement>())
    const registerTab = useCallback(
      (index: number, element: HTMLElement | null) => {
        registerItem(index, element)
        if (element) {
          tabElementsRef.current.set(index, element)
        } else {
          tabElementsRef.current.delete(index)
        }
      },
      [registerItem],
    )

    useEffect(() => {
      measureTabs()
    }, [measureTabs, children])

    useEffect(() => {
      const elements = tabElementsRef.current
      if (elements.size === 0) return
      const ro = new ResizeObserver(() => measureTabs())
      elements.forEach((el) => ro.observe(el))
      return () => ro.disconnect()
    }, [measureTabs, children])

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        setIsMouseInside(true)
        handlers.onMouseMove(e)
      },
      [handlers],
    )

    const handleMouseLeave = useCallback(() => {
      setIsMouseInside(false)
      handlers.onMouseLeave()
    }, [handlers])

    const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

    const selectedRect = tabRects[selectedIndex]
    const hoverRect = hoveredIndex !== null ? tabRects[hoveredIndex] : null
    const focusRect = focusedIndex !== null ? tabRects[focusedIndex] : null
    const isHoveringSelected = hoveredIndex === selectedIndex
    const isHovering = hoveredIndex !== null && !isHoveringSelected

    const root = (
      <TabsSubtleContext.Provider
        value={{ registerTab, hoveredIndex, selectedIndex, idPrefix, activeLabel }}
      >
        <TabsPrimitive.Root
          asChild
          value={String(selectedIndex)}
          onValueChange={(value) => onSelect(Number(value))}
          activationMode="manual"
        >
          <TabsPrimitive.List
            ref={(node: HTMLDivElement | null) => {
              containerRef.current = node
              if (typeof ref === "function") ref(node)
              else if (ref) ref.current = node
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onFocus={(e: React.FocusEvent<HTMLDivElement>) => {
              const indexAttr = (e.target as HTMLElement)
                .closest("[data-proximity-index]")
                ?.getAttribute("data-proximity-index")
              if (indexAttr != null) {
                const idx = Number(indexAttr)
                setHoveredIndex(idx)
                setFocusedIndex((e.target as HTMLElement).matches(":focus-visible") ? idx : null)
              }
            }}
            onBlur={(e: React.FocusEvent<HTMLDivElement>) => {
              if (containerRef.current?.contains(e.relatedTarget)) return
              setFocusedIndex(null)
              if (isMouseInside) return
              setHoveredIndex(null)
            }}
            className={cn(
              "scrollbar-hide relative -mx-1 -my-1 flex max-w-[calc(100%+8px)] items-center gap-0.5 overflow-x-auto px-1 py-1 select-none",
              className,
            )}
            {...props}
          >
            {selectedRect && (
              <motion.div
                className={cn("bg-active pointer-events-none absolute", shape.bg)}
                initial={false}
                animate={{
                  left: selectedRect.left,
                  width: selectedRect.width,
                  top: selectedRect.top,
                  height: selectedRect.height,
                  opacity: isHovering ? 0.8 : 1,
                }}
                transition={{
                  ...spring.moderate,
                  opacity: { duration: 0.08 },
                }}
              />
            )}
            <AnimatePresence>
              {hoverRect && !isHoveringSelected && selectedRect && (
                <motion.div
                  className={cn("bg-active pointer-events-none absolute", shape.bg)}
                  initial={{
                    left: selectedRect.left,
                    width: selectedRect.width,
                    top: selectedRect.top,
                    height: selectedRect.height,
                    opacity: 0,
                  }}
                  animate={{
                    left: hoverRect.left,
                    width: hoverRect.width,
                    top: hoverRect.top,
                    height: hoverRect.height,
                    opacity: 0.4,
                  }}
                  exit={
                    !isMouseInside && selectedRect
                      ? {
                          left: selectedRect.left,
                          width: selectedRect.width,
                          top: selectedRect.top,
                          height: selectedRect.height,
                          opacity: 0,
                          transition: { ...spring.moderate, opacity: { duration: 0.06 } },
                        }
                      : { opacity: 0, transition: spring.fast.exit }
                  }
                  transition={{
                    ...spring.fast,
                    opacity: { duration: 0.08 },
                  }}
                />
              )}
            </AnimatePresence>
            <FocusRing className={shape.focusRing} rect={focusRect} />
            {children}
          </TabsPrimitive.List>
        </TabsPrimitive.Root>
      </TabsSubtleContext.Provider>
    )

    return size ? <SizeProvider size={size}>{root}</SizeProvider> : root
  },
)

TabsSubtle.displayName = "TabsSubtle"

interface TabsSubtleItemProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: IconComponent
  label: string
  index: number
}

const TabsSubtleItem = forwardRef<HTMLButtonElement, TabsSubtleItemProps>(
  ({ icon: Icon, label, index, className, ...props }, ref) => {
    const internalRef = useRef<HTMLButtonElement | null>(null)
    const [labelWidth, setLabelWidth] = useState<number | null>(null)
    const labelRoRef = useRef<ResizeObserver | null>(null)
    const measureLabel = useCallback((el: HTMLSpanElement | null) => {
      labelRoRef.current?.disconnect()
      labelRoRef.current = null
      if (!el) return
      const update = () => setLabelWidth(el.offsetWidth)
      update()
      labelRoRef.current = new ResizeObserver(update)
      labelRoRef.current.observe(el)
    }, [])
    const shape = useShape()
    const sizeClasses = useSize()
    const { registerTab, hoveredIndex, selectedIndex, idPrefix, activeLabel } = useTabsSubtle()

    useEffect(() => {
      registerTab(index, internalRef.current)
      return () => registerTab(index, null)
    }, [index, registerTab])

    const isSelected = selectedIndex === index
    const isActive = hoveredIndex === index || isSelected
    const collapseLabel = activeLabel && !!Icon
    const showLabel = !collapseLabel || isSelected

    const labelContent = (
      <span ref={measureLabel} className="inline-grid whitespace-nowrap">
        <span
          className="invisible col-start-1 row-start-1 [text-box:trim-both_cap_alphabetic]"
          style={{ fontVariationSettings: fontWeights.semibold }}
          aria-hidden="true"
        >
          {label}
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80 [text-box:trim-both_cap_alphabetic]",
            isActive ? "text-foreground" : "text-muted-foreground",
          )}
          style={{
            fontVariationSettings: isSelected ? fontWeights.semibold : fontWeights.normal,
          }}
        >
          {label}
        </span>
      </span>
    )

    return (
      <TabsPrimitive.Trigger
        ref={(node: HTMLButtonElement | null) => {
          internalRef.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        value={String(index)}
        data-proximity-index={index}
        id={idPrefix ? `${idPrefix}-tab-${index}` : undefined}
        aria-controls={idPrefix ? `${idPrefix}-panel-${index}` : undefined}
        aria-label={collapseLabel && !showLabel ? label : undefined}
        className={cn(
          "relative z-10 flex cursor-pointer items-center border-none bg-transparent outline-none",
          sizeClasses.control,
          sizeClasses.text,
          sizeClasses.px,
          !collapseLabel && sizeClasses.gap,
          shape.bg,
          className,
        )}
        data-cursor="button"
        {...props}
      >
        {Icon && (
          <Icon
            size={sizeClasses.icon}
            strokeWidth={isActive ? 2 : 1.5}
            className={cn(
              "shrink-0 transition-[color,stroke-width] duration-80",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          />
        )}
        {collapseLabel ? (
          <AnimatePresence initial={false}>
            {showLabel && (
              <motion.span
                key="label"
                className="overflow-hidden"
                {...(labelWidth == null ? { style: { width: "auto" } } : {})}
                initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                animate={{
                  ...(labelWidth != null ? { width: labelWidth } : null),
                  opacity: 1,
                  marginLeft: sizeClasses.variant === "compact" ? 6 : 8,
                }}
                exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                transition={{
                  ...spring.fast,
                  opacity: { duration: 0.06 },
                }}
              >
                {labelContent}
              </motion.span>
            )}
          </AnimatePresence>
        ) : (
          labelContent
        )}
      </TabsPrimitive.Trigger>
    )
  },
)

TabsSubtleItem.displayName = "TabsSubtleItem"

interface TabsSubtlePanelProps extends HTMLAttributes<HTMLDivElement> {
  index: number
  selectedIndex: number
  idPrefix: string
  children: ReactNode
}

const TabsSubtlePanel = forwardRef<HTMLDivElement, TabsSubtlePanelProps>(
  ({ index, selectedIndex, idPrefix, children, className, ...props }, ref) => {
    const isSelected = selectedIndex === index

    return (
      <div
        ref={ref}
        id={`${idPrefix}-panel-${index}`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${index}`}
        hidden={!isSelected}
        tabIndex={-1}
        className={cn("outline-none", className)}
        {...props}
      >
        {isSelected && children}
      </div>
    )
  },
)

TabsSubtlePanel.displayName = "TabsSubtlePanel"

export { TabsSubtle, TabsSubtleItem, TabsSubtlePanel }
