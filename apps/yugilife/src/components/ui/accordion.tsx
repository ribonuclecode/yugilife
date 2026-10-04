"use client"

import {
  createContext,
  createElement,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { AnimatePresence, motion } from "framer-motion"

import { useProximityHover } from "@/hooks/use-proximity-hover"
import { fontWeights } from "@/lib/font-weight"
import { useIcon } from "@/lib/icon-context"
import { useShape } from "@/lib/shape-context"
import { SizeProvider, useSize } from "@/lib/size-context"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { FocusRing, HoverHighlight } from "./highlights"

import type { SizeVariant } from "@/lib/size-context"
import type { HTMLAttributes, ReactNode } from "react"

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

interface ItemRect {
  top: number
  left: number
  width: number
  height: number
}

interface AccordionGroupContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void
  registerFullItem: (index: number, element: HTMLElement | null) => void
  activeIndex: number | null
  grouped: true
  remeasure: () => void
  openValues: Set<string>
  openItemRects: Map<number, ItemRect>
}

const AccordionGroupContext = createContext<AccordionGroupContextValue | null>(null)

function useAccordionGroup() {
  return useContext(AccordionGroupContext)
}

interface AccordionItemContextValue {
  index?: number
  value: string
  isOpen: boolean
  triggerRef: React.MutableRefObject<HTMLDivElement | null>
}

const AccordionItemContext = createContext<AccordionItemContextValue | null>(null)

function useAccordionItemContext() {
  const ctx = useContext(AccordionItemContext)
  if (!ctx)
    throw new Error("AccordionTrigger/AccordionContent must be used within an AccordionItem")
  return ctx
}

type AccordionGroupSingleProps = {
  type?: "single"
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  collapsible?: boolean
}

type AccordionGroupMultipleProps = {
  type: "multiple"
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
}

type AccordionGroupProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  size?: SizeVariant
} & (AccordionGroupSingleProps | AccordionGroupMultipleProps)

const AccordionGroup = forwardRef<HTMLDivElement, AccordionGroupProps>((props, ref) => {
  const { children, type = "single", size, className, ...rest } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const fullItemElementsRef = useRef<Map<number, HTMLElement>>(new Map())
  const [openItemRects, setOpenItemRects] = useState<Map<number, ItemRect>>(new Map())
  const openItemRectsRef = useRef(openItemRects)

  const {
    activeIndex,
    setActiveIndex,
    itemRects,
    sessionId,
    handlers,
    registerItem,
    measureItems,
  } = useProximityHover(containerRef)

  const registerFullItem = useCallback((index: number, element: HTMLElement | null) => {
    if (element) {
      fullItemElementsRef.current.set(index, element)
    } else {
      fullItemElementsRef.current.delete(index)
    }
  }, [])

  const measureFullItems = useCallback(() => {
    if (!containerRef.current) return
    const next = new Map<number, ItemRect>()
    fullItemElementsRef.current.forEach((el, idx) => {
      next.set(idx, {
        top: el.offsetTop,
        left: el.offsetLeft,
        width: el.offsetWidth,
        height: el.offsetHeight,
      })
    })
    const prev = openItemRectsRef.current
    let changed = prev.size !== next.size
    if (!changed) {
      for (const [idx, r] of next) {
        const p = prev.get(idx)
        if (
          !p ||
          p.top !== r.top ||
          p.left !== r.left ||
          p.width !== r.width ||
          p.height !== r.height
        ) {
          changed = true
          break
        }
      }
    }
    if (!changed) return
    openItemRectsRef.current = next
    setOpenItemRects(next)
  }, [])

  const [internalSingleValue, setInternalSingleValue] = useState<string>(() => {
    if (type === "single") {
      const sp = props as AccordionGroupSingleProps
      return sp.defaultValue ?? ""
    }
    return ""
  })
  const [internalMultipleValue, setInternalMultipleValue] = useState<string[]>(() => {
    if (type === "multiple") {
      const mp = props as AccordionGroupMultipleProps
      return mp.defaultValue ?? []
    }
    return []
  })
  const singleOnValueChange = (props as AccordionGroupSingleProps).onValueChange
  const multipleOnValueChange = (props as AccordionGroupMultipleProps).onValueChange

  const openValuesList: string[] =
    type === "multiple"
      ? ((props as AccordionGroupMultipleProps).value ?? internalMultipleValue)
      : (() => {
          const v = (props as AccordionGroupSingleProps).value ?? internalSingleValue
          return v ? [v] : []
        })()

  const openValuesKey = JSON.stringify(openValuesList)

  const openValues = useMemo(
    () => new Set(openValuesList),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openValuesKey],
  )

  const handleSingleValueChange = useCallback(
    (value: string) => {
      if (singleOnValueChange) singleOnValueChange(value)
      else setInternalSingleValue(value)
    },
    [singleOnValueChange],
  )

  const handleMultipleValueChange = useCallback(
    (value: string[]) => {
      if (multipleOnValueChange) multipleOnValueChange(value)
      else setInternalMultipleValue(value)
    },
    [multipleOnValueChange],
  )

  useEffect(() => {
    measureItems()
    measureFullItems()
  }, [measureItems, measureFullItems, children])

  useEffect(() => {
    measureItems()
    measureFullItems()
  }, [measureItems, measureFullItems, openValuesKey])

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const activeRect = activeIndex !== null ? itemRects[activeIndex] : null
  const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null
  const isHoveringNonOpen = activeIndex !== null && !openItemRects.has(activeIndex)
  const shape = useShape()

  const htmlProps = Object.fromEntries(
    Object.entries(rest).filter(
      ([key]) => !["value", "defaultValue", "onValueChange", "collapsible"].includes(key),
    ),
  ) as HTMLAttributes<HTMLDivElement>

  const radixProps =
    type === "multiple"
      ? {
          type: "multiple" as const,
          value: (props as AccordionGroupMultipleProps).value ?? internalMultipleValue,
          onValueChange: handleMultipleValueChange,
        }
      : {
          type: "single" as const,
          collapsible: (props as AccordionGroupSingleProps).collapsible ?? true,
          value: (props as AccordionGroupSingleProps).value ?? internalSingleValue,
          onValueChange: handleSingleValueChange,
        }

  const remeasure = useCallback(() => {
    measureItems()
    measureFullItems()
  }, [measureItems, measureFullItems])

  const groupContextValue = useMemo<AccordionGroupContextValue>(
    () => ({
      registerItem,
      registerFullItem,
      activeIndex,
      grouped: true,
      remeasure,
      openValues,
      openItemRects,
    }),
    [registerItem, registerFullItem, activeIndex, remeasure, openValues, openItemRects],
  )

  const group = (
    <AccordionGroupContext.Provider value={groupContextValue}>
      <AccordionPrimitive.Root {...radixProps} asChild>
        <div
          ref={(node) => {
            containerRef.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
          }}
          onMouseEnter={handlers.onMouseEnter}
          onMouseMove={(e) => {
            const container = containerRef.current
            if (container) {
              const cRect = container.getBoundingClientRect()
              const layoutH = container.offsetHeight
              const visualH = cRect.height
              const scale = layoutH > 0 ? visualH / layoutH : 1
              const localY = (e.clientY - cRect.top) / scale + container.scrollTop
              for (const [idx, full] of openItemRects) {
                const trigger = itemRects[idx]
                if (!trigger) continue
                const contentTop = trigger.top + trigger.height
                const contentBottom = full.top + full.height
                if (localY >= contentTop && localY <= contentBottom) {
                  setActiveIndex(null)
                  return
                }
              }
            }
            handlers.onMouseMove(e)
          }}
          onMouseLeave={handlers.onMouseLeave}
          onFocus={(e) => {
            const target = e.target as HTMLElement
            const indexAttr = target
              .closest("[data-proximity-index]")
              ?.getAttribute("data-proximity-index")
            if (indexAttr != null) {
              const idx = Number(indexAttr)
              setActiveIndex(idx)
              setFocusedIndex(target.matches(":focus-visible") ? idx : null)
            }
          }}
          onBlur={(e) => {
            if (containerRef.current?.contains(e.relatedTarget)) return
            setFocusedIndex(null)
            setActiveIndex(null)
          }}
          className={cn("relative flex w-72 max-w-full flex-col gap-0.5", className)}
          {...htmlProps}
        >
          <AnimatePresence>
            {[...openItemRects.entries()].map(([idx, rect]) => (
              <motion.div
                key={`expanded-${idx}`}
                className={`pointer-events-none absolute ${shape.bg} bg-selection-highlight`}
                initial={{
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                  opacity: 0,
                }}
                animate={{
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                  opacity: isHoveringNonOpen ? 0.7 : 1,
                }}
                exit={{ opacity: 0, transition: spring.moderate.exit }}
                transition={{
                  top: { duration: 0 },
                  left: { duration: 0 },
                  width: { duration: 0 },
                  height: { duration: 0 },
                  opacity: { duration: 0.12 },
                }}
              />
            ))}
          </AnimatePresence>

          <HoverHighlight className={shape.bg} rect={activeRect} sessionKey={sessionId} />

          <FocusRing className={shape.focusRing} rect={focusRect} />

          {children}
        </div>
      </AccordionPrimitive.Root>
    </AccordionGroupContext.Provider>
  )

  return size ? <SizeProvider size={size}>{group}</SizeProvider> : group
})

AccordionGroup.displayName = "AccordionGroup"

interface AccordionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  type?: "single" | "multiple"
  collapsible?: boolean
  defaultValue?: string | string[]
  value?: string | string[]
  onValueChange?: ((value: string) => void) | ((value: string[]) => void)
  size?: SizeVariant
}

const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      children,
      type = "single",
      collapsible = true,
      defaultValue,
      value,
      onValueChange,
      size,
      className,
      ...props
    },
    ref,
  ) => {
    const [internalSingleValue, setInternalSingleValue] = useState<string>(() => {
      if (type === "single") {
        return (defaultValue as string) ?? ""
      }
      return ""
    })
    const [internalMultipleValue, setInternalMultipleValue] = useState<string[]>(() => {
      if (type === "multiple") {
        return (defaultValue as string[]) ?? []
      }
      return []
    })

    const openValues = new Set<string>(
      type === "multiple"
        ? ((value as string[] | undefined) ?? internalMultipleValue)
        : (() => {
            const v = (value as string | undefined) ?? internalSingleValue
            return v ? [v] : []
          })(),
    )

    const handleSingleChange = useCallback(
      (v: string) => {
        if (onValueChange) (onValueChange as (v: string) => void)(v)
        else setInternalSingleValue(v)
      },
      [onValueChange],
    )

    const handleMultipleChange = useCallback(
      (v: string[]) => {
        if (onValueChange) (onValueChange as (v: string[]) => void)(v)
        else setInternalMultipleValue(v)
      },
      [onValueChange],
    )

    const radixProps =
      type === "multiple"
        ? {
            type: "multiple" as const,
            value: (value as string[] | undefined) ?? internalMultipleValue,
            onValueChange: handleMultipleChange,
          }
        : {
            type: "single" as const,
            collapsible,
            value: (value as string | undefined) ?? internalSingleValue,
            onValueChange: handleSingleChange,
          }

    const root = (
      <AccordionPrimitive.Root {...radixProps} asChild>
        <div
          ref={ref}
          className={cn("flex w-72 max-w-full flex-col gap-0.5", className)}
          {...props}
        >
          <StandaloneOpenContext.Provider value={openValues}>
            {children}
          </StandaloneOpenContext.Provider>
        </div>
      </AccordionPrimitive.Root>
    )

    return size ? <SizeProvider size={size}>{root}</SizeProvider> : root
  },
)

Accordion.displayName = "Accordion"

const StandaloneOpenContext = createContext<Set<string>>(new Set())

interface AccordionItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string
  index?: number
  disabled?: boolean
  children: ReactNode
}

const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, index, disabled, children, className, ...props }, ref) => {
    const internalRef = useRef<HTMLDivElement>(null)
    const groupCtx = useAccordionGroup()
    const standaloneOpen = useContext(StandaloneOpenContext)
    const shape = useShape()

    const isOpen = groupCtx?.grouped ? groupCtx.openValues.has(value) : standaloneOpen.has(value)

    const triggerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (groupCtx?.grouped && index !== undefined) {
        groupCtx.registerItem(index, triggerRef.current)
        return () => groupCtx.registerItem(index, null)
      }
    }, [index, groupCtx])

    useEffect(() => {
      if (groupCtx?.grouped && index !== undefined) {
        if (isOpen) {
          groupCtx.registerFullItem(index, internalRef.current)
        } else {
          groupCtx.registerFullItem(index, null)
        }
        return () => groupCtx.registerFullItem(index, null)
      }
    }, [index, groupCtx, isOpen])

    return (
      <AccordionItemContext.Provider
        value={{
          ...(index === undefined ? {} : { index }),
          value,
          isOpen,
          triggerRef,
        }}
      >
        <AccordionPrimitive.Item
          ref={(node) => {
            internalRef.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
          }}
          value={value}
          data-proximity-index={index}
          className={cn(!groupCtx?.grouped && "relative", className)}
          {...(disabled === undefined ? {} : { disabled })}
          {...props}
        >
          {!groupCtx?.grouped && (
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  className={`absolute inset-0 ${shape.bg} bg-selection-highlight pointer-events-none`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: spring.fast.exit }}
                  transition={{ duration: 0.08 }}
                />
              )}
            </AnimatePresence>
          )}
          {children}
        </AccordionPrimitive.Item>
      </AccordionItemContext.Provider>
    )
  },
)

AccordionItem.displayName = "AccordionItem"

interface AccordionTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const ChevronRight = useIcon("chevron-right")
    const groupCtx = useAccordionGroup()
    const { index, isOpen, triggerRef } = useAccordionItemContext()
    const shape = useShape()
    const sizeClasses = useSize()
    const [isHovered, setIsHovered] = useState(false)

    const isActive = groupCtx?.grouped ? groupCtx.activeIndex === index : isHovered

    const triggerContent = (
      <AccordionPrimitive.Header asChild>
        <div>
          <AccordionPrimitive.Trigger
            ref={ref}
            className={cn(
              `relative z-10 flex w-full cursor-pointer items-center ${sizeClasses.gap} ${shape.item} ${sizeClasses.px} ${sizeClasses.variant === "compact" ? "py-1" : "py-2"} outline-none select-none`,
              !groupCtx?.grouped &&
                "ring-1 ring-transparent ring-offset-0 transition-shadow duration-80 focus-visible:ring-(--focus-ring)",
              className,
            )}
            {...props}
          >
            <span className={cn("inline-grid flex-1 text-left", sizeClasses.text)}>
              <span
                className="invisible col-start-1 row-start-1"
                style={{ fontVariationSettings: fontWeights.semibold }}
                aria-hidden="true"
              >
                {children}
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80",
                  isOpen || isActive ? "text-foreground" : "text-muted-foreground",
                )}
                style={{
                  fontVariationSettings: isOpen ? fontWeights.semibold : fontWeights.normal,
                }}
              >
                {children}
              </span>
            </span>

            <motion.span
              className="inline-flex shrink-0 items-center justify-center"
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={spring.fast}
            >
              {createElement(ChevronRight, {
                size: sizeClasses.icon,
                strokeWidth: isOpen || isActive ? 2 : 1.5,
                className: cn(
                  "transition-[color,stroke-width] duration-80",
                  isOpen || isActive ? "text-foreground" : "text-muted-foreground",
                ),
              })}
            </motion.span>
          </AccordionPrimitive.Trigger>
        </div>
      </AccordionPrimitive.Header>
    )

    if (groupCtx?.grouped) {
      return <div ref={triggerRef}>{triggerContent}</div>
    }

    return (
      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <AnimatePresence>
          {isHovered && (
            <motion.div
              className={`absolute inset-0 ${shape.bg} bg-hover pointer-events-none`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: spring.fast.exit }}
              transition={{ duration: 0.08 }}
            />
          )}
        </AnimatePresence>
        {triggerContent}
      </div>
    )
  },
)

AccordionTrigger.displayName = "AccordionTrigger"

interface AccordionContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

const AccordionContent = forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ children, className, ...props }, ref) => {
    const groupCtx = useAccordionGroup()
    const { isOpen } = useAccordionItemContext()
    const sizeClasses = useSize()

    const innerRef = useRef<HTMLDivElement | null>(null)
    const roRef = useRef<ResizeObserver | null>(null)
    const [contentHeight, setContentHeight] = useState<number | null>(null)
    const [needsSnap, setNeedsSnap] = useState(isOpen)

    const measureRef = useCallback((el: HTMLDivElement | null) => {
      roRef.current?.disconnect()
      roRef.current = null
      innerRef.current = el
      if (!el) return
      if (el.offsetHeight > 0) {
        setContentHeight(el.offsetHeight)
        setNeedsSnap(false)
      }
      const ro = new ResizeObserver(() => {
        if (el.offsetHeight > 0) {
          setContentHeight(el.offsetHeight)
          setNeedsSnap(false)
        }
      })
      ro.observe(el)
      roRef.current = ro
    }, [])

    useIsoLayoutEffect(() => {
      if (isOpen && innerRef.current && innerRef.current.offsetHeight > 0) {
        setContentHeight(innerRef.current.offsetHeight)
        setNeedsSnap(false)
      }
    }, [isOpen])

    const [exitComplete, setExitComplete] = useState(!isOpen)

    return (
      <AccordionPrimitive.Content forceMount asChild {...props}>
        <motion.div
          ref={ref}
          hidden={!isOpen && exitComplete}
          className={cn("overflow-hidden", className)}
          initial={{ height: isOpen ? "auto" : 0 }}
          animate={{ height: isOpen ? (contentHeight ?? 0) : 0 }}
          transition={needsSnap ? { duration: 0 } : { ...spring.moderate, bounce: 0 }}
          onAnimationStart={() => {
            if (isOpen) setExitComplete(false)
          }}
          onUpdate={() => {
            groupCtx?.remeasure()
          }}
          onAnimationComplete={() => {
            groupCtx?.remeasure()
            if (!isOpen) setExitComplete(true)
          }}
        >
          <div
            ref={measureRef}
            className={cn(
              "text-muted-foreground pt-1",
              sizeClasses.px,
              sizeClasses.text,
              sizeClasses.variant === "compact" ? "pb-2.5" : "pb-3",
            )}
          >
            {children}
          </div>
        </motion.div>
      </AccordionPrimitive.Content>
    )
  },
)

AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionContent, AccordionGroup, AccordionItem, AccordionTrigger }
