"use client"

import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cva } from "class-variance-authority"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"

import { useProximityHover } from "@/hooks/use-proximity-hover"
import { Elevated } from "@/lib/elevated"
import { useShape } from "@/lib/shape-context"
import { SizeProvider, useSize } from "@/lib/size-context"
import { exitFallbackMs, spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { useFieldContext } from "./field-context"
import { FocusRing, HoverHighlight, SelectedHighlight } from "./highlights"

import type { IconComponent } from "@/lib/icon-context"
import type { SizeVariant } from "@/lib/size-context"
import type { VariantProps } from "class-variance-authority"
import type { HTMLAttributes, ReactNode } from "react"

const selectionAckMs = 300

interface SelectContextValue {
  value: string
  open: boolean
  actionsRef: React.RefObject<{ unmount: () => void } | null>
}

const SelectContext = createContext<SelectContextValue | null>(null)

function useSelectContext() {
  const ctx = useContext(SelectContext)
  if (!ctx) throw new Error("Select compound components must be inside <Select>")
  return ctx
}

interface SelectContentContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void
  activeIndex: number | null
  checkedIndex: number | undefined
}

const SelectContentContext = createContext<SelectContentContextValue | null>(null)

function collectSelectItems(node: ReactNode, out: { value: string; label: ReactNode }[] = []) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as { value?: unknown; children?: ReactNode }
    if (typeof props.value === "string") {
      out.push({
        value: props.value,
        label: typeof props.children === "string" ? props.children : props.value,
      })
    } else if (props.children) {
      collectSelectItems(props.children, out)
    }
  })
  return out
}

interface SelectProps {
  children: ReactNode
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  name?: string
  required?: boolean
  size?: SizeVariant
}

function Select({
  children,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  name,
  required,
  size,
}: SelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "")
  const [open, setOpen] = useState(false)
  const currentValue = value !== undefined ? value : internalValue
  const actionsRef = useRef<{ unmount: () => void } | null>(null)
  const items = useMemo(() => collectSelectItems(children), [children])

  const ackTimeoutRef = useRef<number | null>(null)
  const cancelAckClose = useCallback(() => {
    if (ackTimeoutRef.current !== null) {
      clearTimeout(ackTimeoutRef.current)
      ackTimeoutRef.current = null
    }
  }, [])
  useEffect(() => cancelAckClose, [cancelAckClose])

  const handleValueChange = useCallback(
    (next: string | null) => {
      const nextValue = next ?? ""
      if (value === undefined) setInternalValue(nextValue)
      onValueChange?.(nextValue)
    },
    [value, onValueChange],
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean, eventDetails: { reason: string }) => {
      if (!nextOpen && eventDetails.reason === "item-press") {
        cancelAckClose()
        ackTimeoutRef.current = window.setTimeout(() => {
          ackTimeoutRef.current = null
          setOpen(false)
        }, selectionAckMs)
        return
      }
      cancelAckClose()
      setOpen(nextOpen)
    },
    [cancelAckClose],
  )

  const ctx = useMemo(() => ({ value: currentValue, open, actionsRef }), [currentValue, open])

  const root = (
    <SelectContext.Provider value={ctx}>
      <SelectPrimitive.Root
        value={currentValue === "" ? null : currentValue}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={handleOpenChange}
        actionsRef={actionsRef}
        items={items}
        disabled={disabled}
        modal={false}
        {...(name === undefined ? {} : { name })}
        {...(required === undefined ? {} : { required })}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectContext.Provider>
  )

  return size ? <SizeProvider size={size}>{root}</SizeProvider> : root
}

Select.displayName = "Select"

const triggerVariants = cva(
  [
    "group inline-flex items-center justify-between outline-none cursor-pointer",
    "ring-1 ring-transparent transition-all duration-80",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:ring-(--focus-ring)",
  ],
  {
    variants: {
      variant: {
        bordered: "border border-border bg-transparent text-foreground hover:bg-hover",
        borderless: "border border-transparent bg-transparent text-foreground hover:bg-hover",
      },
    },
    defaultVariants: {
      variant: "bordered",
    },
  },
)

interface SelectTriggerProps
  extends
    Omit<HTMLAttributes<HTMLButtonElement>, "children">,
    VariantProps<typeof triggerVariants> {
  icon?: IconComponent
  placeholder?: string
  error?: string
  "data-cursor"?: "button" | "text" | "drag" | "default"
  size?: SizeVariant
}

const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  (
    {
      className,
      variant,
      icon: Icon,
      id,
      placeholder = "Select…",
      error,
      size,
      "data-cursor": cursorMode,
      ...props
    },
    ref,
  ) => {
    const shape = useShape()
    const sizeClasses = useSize(size)
    const field = useFieldContext()

    return (
      <div className="flex max-w-full min-w-0 flex-col gap-1">
        <SelectPrimitive.Trigger
          ref={ref}
          id={id ?? field?.controlId}
          aria-invalid={!!error || undefined}
          className={cn(
            triggerVariants({ variant }),
            sizeClasses.control,
            sizeClasses.text,
            sizeClasses.pxStart,
            sizeClasses.gap,
            "w-full max-w-full min-w-0",
            shape.input,
            error && "border-destructive/50 hover:border-destructive/50",
            className,
          )}
          {...props}
          data-cursor={cursorMode ?? "button"}
        >
          <span className={cn("flex min-w-0 flex-1 items-center", sizeClasses.gap)}>
            {Icon && (
              <Icon
                size={sizeClasses.icon}
                strokeWidth={1.5}
                className="text-muted-foreground group-hover:text-foreground shrink-0 transition-[color,stroke-width] duration-80 group-hover:stroke-2"
              />
            )}
            <SelectPrimitive.Value
              placeholder={placeholder}
              className="data-placeholder:text-muted-foreground -my-1 min-w-0 flex-1 truncate py-1 text-left [text-box:trim-both_cap_alphabetic]"
            />
          </span>

          <span
            className={cn(
              "flex aspect-square shrink-0 items-center justify-center",
              sizeClasses.control,
            )}
          >
            <ChevronDown
              className="text-muted-foreground group-hover:text-foreground transition-colors duration-80"
              size={sizeClasses.icon}
              strokeWidth={2}
            />
          </span>
        </SelectPrimitive.Trigger>
        {error && <span className={cn("text-destructive pl-3", sizeClasses.caption)}>{error}</span>}
      </div>
    )
  },
)

SelectTrigger.displayName = "SelectTrigger"

interface SelectContentProps {
  className?: string
  children: ReactNode
}

const SelectContent = forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children }, ref) => {
    const { open, value, actionsRef } = useSelectContext()
    const shape = useShape()
    const containerRef = useRef<HTMLDivElement>(null)

    const {
      activeIndex,
      setActiveIndex,
      itemRects,
      isMeasured,
      sessionId,
      handlers,
      registerItem,
      remeasure,
    } = useProximityHover(containerRef)

    const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
    const [checkedIndex, setCheckedIndex] = useState<number | undefined>(undefined)

    useEffect(() => {
      if (open) return
      const id = setTimeout(() => actionsRef.current?.unmount(), exitFallbackMs(spring.fast))
      return () => clearTimeout(id)
    }, [open, actionsRef])

    useEffect(() => {
      if (!open) return
      remeasure()
    }, [open, remeasure])

    useEffect(() => {
      if (!open) return
      let inner: number
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          const container = containerRef.current
          if (container) {
            const items = Array.from(container.querySelectorAll("[data-proximity-index]"))
            const idx = items.findIndex((el) => el.getAttribute("data-value") === value)
            setCheckedIndex(idx !== -1 ? idx : undefined)
          }
        })
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }, [open, value])

    const resetOverlayState = () => {
      setCheckedIndex(undefined)
      setActiveIndex(null)
      setFocusedIndex(null)
    }

    const activeRect = isMeasured && activeIndex !== null ? itemRects[activeIndex] : null
    const checkedRect = isMeasured && checkedIndex != null ? itemRects[checkedIndex] : null
    const focusRect = isMeasured && focusedIndex !== null ? itemRects[focusedIndex] : null

    const contentCtx = useMemo(
      () => ({ registerItem, activeIndex, checkedIndex }),
      [registerItem, activeIndex, checkedIndex],
    )

    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <motion.div
            initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
            animate={open ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -4, scaleY: 0.96 }}
            transition={open ? spring.fast : spring.fast.exit}
            style={{ transformOrigin: "top center" }}
            onAnimationStart={() => {
              if (!open) resetOverlayState()
            }}
            onAnimationComplete={() => {
              if (!open) actionsRef.current?.unmount()
            }}
          >
            <SelectContentContext.Provider value={contentCtx}>
              <SelectPrimitive.Popup
                render={
                  <Elevated
                    offset={2}
                    shadowLevel={3}
                    ref={(node: HTMLDivElement | null) => {
                      containerRef.current = node
                      if (typeof ref === "function") ref(node)
                      else if (ref) ref.current = node
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
                  `relative flex max-h-[min(300px,var(--available-height))] min-w-(--anchor-width) flex-col gap-0.5 overflow-y-auto ${shape.container} p-1 outline-none select-none`,
                  className,
                )}
              >
                {open && <SelectedHighlight className={shape.bg} rect={checkedRect} />}
                {open && (
                  <HoverHighlight className={shape.bg} rect={activeRect} sessionKey={sessionId} />
                )}
                {open && <FocusRing className={shape.focusRing} rect={focusRect} />}
                {children}
              </SelectPrimitive.Popup>
            </SelectContentContext.Provider>
          </motion.div>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    )
  },
)

SelectContent.displayName = "SelectContent"

interface SelectItemProps extends HTMLAttributes<HTMLDivElement> {
  icon?: IconComponent
  index: number
  value: string
  disabled?: boolean
}

const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, icon: Icon, value, index, disabled = false, ...props }, ref) => {
    const selectCtx = useSelectContext()
    const contentCtx = useContext(SelectContentContext)
    const internalRef = useRef<HTMLDivElement>(null)
    const shape = useShape()
    const sizeClasses = useSize()
    const compact = sizeClasses.variant === "compact"

    const registerItem = contentCtx?.registerItem
    useEffect(() => {
      if (!registerItem) return
      registerItem(index, internalRef.current)
      return () => registerItem(index, null)
    }, [index, registerItem])

    const isActive = contentCtx?.activeIndex === index
    const isChecked = selectCtx.value === value

    return (
      <SelectPrimitive.Item
        value={value}
        disabled={disabled}
        {...(typeof children === "string" ? { label: children } : {})}
        render={
          <div
            ref={(node: HTMLDivElement | null) => {
              internalRef.current = node
              if (typeof ref === "function") ref(node)
              else if (ref) ref.current = node
            }}
            data-proximity-index={index}
            data-value={value}
            className={cn(
              `relative z-10 flex ${sizeClasses.control} shrink-0 items-center ${sizeClasses.gap} ${shape.item} ${sizeClasses.itemPx} ${sizeClasses.text} cursor-pointer outline-none select-none`,
              "transition-[color] duration-80",
              isActive || isChecked ? "text-foreground" : "text-muted-foreground",
              disabled && "pointer-events-none opacity-50",
              className,
            )}
            {...props}
          />
        }
      >
        {Icon && (
          <Icon
            size={sizeClasses.icon}
            strokeWidth={isActive || isChecked ? 2 : 1.5}
            className="shrink-0 transition-[color,stroke-width] duration-80"
          />
        )}

        <SelectPrimitive.ItemText
          render={
            <span className="-my-1 min-w-0 flex-1 truncate py-1 [text-box:trim-both_cap_alphabetic]" />
          }
        >
          {children}
        </SelectPrimitive.ItemText>

        <span aria-hidden className={cn("shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")}>
          <AnimatePresence initial={false}>
            {isChecked && (
              <motion.svg
                key="check"
                width={sizeClasses.icon}
                height={sizeClasses.icon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-foreground"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 1 }}
              >
                <motion.path
                  d="M4 12L9 17L20 6"
                  initial={{ pathLength: 0 }}
                  animate={{
                    pathLength: 1,
                    transition: { duration: 0.08, ease: "easeOut" },
                  }}
                  exit={{
                    pathLength: 0,
                    transition: { duration: 0.04, ease: "easeIn" },
                  }}
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </span>
      </SelectPrimitive.Item>
    )
  },
)

SelectItem.displayName = "SelectItem"

function SelectGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="group" className={className} {...props}>
      {children}
    </div>
  )
}

SelectGroup.displayName = "SelectGroup"

const SelectLabel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const sizeClasses = useSize()
    return (
      <div
        ref={ref}
        className={cn("text-muted-foreground shrink-0 px-2 py-1.5", sizeClasses.caption, className)}
        {...props}
      />
    )
  },
)

SelectLabel.displayName = "SelectLabel"

const SelectSeparator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      className={cn("bg-border/60 -mx-1 my-1 h-px shrink-0", className)}
      {...props}
    />
  ),
)

SelectSeparator.displayName = "SelectSeparator"

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
}
export type { SelectContentProps, SelectItemProps, SelectProps, SelectTriggerProps }
