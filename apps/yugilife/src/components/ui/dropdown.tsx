/* eslint-disable react-refresh/only-export-components */
"use client"

import {
  cloneElement,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { motion } from "framer-motion"

import { FocusRing, HoverHighlight, SelectedHighlight } from "@/components/ui/highlights"
import { DropdownContext, useDropdown, useDropdownMaybe } from "@/components/ui/menu-item"
import { useProximityHover } from "@/hooks/use-proximity-hover"
import { Elevated } from "@/lib/elevated"
import { popupShape } from "@/lib/shape-context"
import { SizeProvider, useSize } from "@/lib/size-context"
import { exitFallbackMs, spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import type { DropdownContextValue, MenuItemRenderOptions } from "@/components/ui/menu-item"
import type { SizeVariant } from "@/lib/size-context"
import type { ComponentPropsWithoutRef, HTMLAttributes, ReactElement, ReactNode } from "react"

const shape = popupShape

export { useDropdown, useDropdownMaybe }
export type { DropdownContextValue, MenuItemRenderOptions }

interface DropdownProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  checkedIndex?: number
  size?: SizeVariant
}

const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  ({ children, checkedIndex, size, className, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const {
      activeIndex,
      setActiveIndex,
      itemRects,
      sessionId,
      handlers,
      registerItem,
      measureItems,
    } = useProximityHover(containerRef)

    useEffect(() => {
      measureItems()
    }, [measureItems, children])

    const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

    const activeRect = activeIndex !== null ? itemRects[activeIndex] : null
    const checkedRect = checkedIndex != null ? itemRects[checkedIndex] : null
    const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null
    const panel = (
      <DropdownContext.Provider
        value={{
          registerItem,
          activeIndex,
          ...(checkedIndex === undefined ? {} : { checkedIndex }),
        }}
      >
        <Elevated
          offset={2}
          shadowLevel={3}
          ref={(node) => {
            containerRef.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
          }}
          onMouseEnter={handlers.onMouseEnter}
          onMouseMove={handlers.onMouseMove}
          onMouseLeave={handlers.onMouseLeave}
          onFocus={(e) => {
            const indexAttr = (e.target as HTMLElement)
              .closest("[data-proximity-index]")
              ?.getAttribute("data-proximity-index")
            if (indexAttr != null) {
              const idx = Number(indexAttr)
              setActiveIndex(idx)
              setFocusedIndex((e.target as HTMLElement).matches(":focus-visible") ? idx : null)
            }
          }}
          onBlur={(e) => {
            if (containerRef.current?.contains(e.relatedTarget)) return
            setFocusedIndex(null)
            setActiveIndex(null)
          }}
          onKeyDown={(e) => {
            const items = Array.from(
              containerRef.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"], [role="menuitemradio"]',
              ) ?? [],
            )
            const currentIdx = items.indexOf(e.target as HTMLElement)
            if (currentIdx === -1) return

            if (["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) {
              e.preventDefault()
              const next = ["ArrowDown", "ArrowRight"].includes(e.key)
                ? (currentIdx + 1) % items.length
                : (currentIdx - 1 + items.length) % items.length
              items[next]?.focus()
            } else if (e.key === "Home") {
              e.preventDefault()
              items[0]?.focus()
            } else if (e.key === "End") {
              e.preventDefault()
              items[items.length - 1]?.focus()
            }
          }}
          role="group"
          className={cn(
            `relative flex w-72 max-w-full flex-col gap-0.5 ${shape.container} p-1 select-none`,
            className,
          )}
          {...props}
        >
          <SelectedHighlight className={shape.bg} rect={checkedRect} />
          <HoverHighlight
            className={shape.bg}
            from={checkedRect}
            rect={activeRect}
            sessionKey={sessionId}
          />
          <FocusRing className={shape.focusRing} rect={focusRect} />

          {children}
        </Elevated>
      </DropdownContext.Provider>
    )

    return size ? <SizeProvider size={size}>{panel}</SizeProvider> : panel
  },
)

Dropdown.displayName = "Dropdown"

interface DropdownMenuContextValue {
  open: boolean
  disabled: boolean
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenuContext() {
  const ctx = useContext(DropdownMenuContext)
  if (!ctx) throw new Error("DropdownMenu compound components must be inside <DropdownMenu>")
  return ctx
}

interface DropdownMenuProps {
  children: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  size?: SizeVariant
}

function DropdownMenu({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  size,
}: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = openProp !== undefined ? openProp : internalOpen

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange],
  )

  const ctx = useMemo(() => ({ open, disabled }), [open, disabled])

  const root = (
    <DropdownMenuContext.Provider value={ctx}>
      <DropdownMenuPrimitive.Root open={open} onOpenChange={handleOpenChange} modal={false}>
        {children}
      </DropdownMenuPrimitive.Root>
    </DropdownMenuContext.Provider>
  )

  return size ? <SizeProvider size={size}>{root}</SizeProvider> : root
}

DropdownMenu.displayName = "DropdownMenu"

interface DropdownTriggerProps extends Omit<
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>,
  "asChild"
> {
  render?: ReactElement
}

const DropdownTrigger = forwardRef<HTMLButtonElement, DropdownTriggerProps>(
  ({ render, children, disabled, ...props }, ref) => {
    const { disabled: rootDisabled } = useDropdownMenuContext()
    const isDisabled = disabled || rootDisabled

    if (render) {
      return (
        <DropdownMenuPrimitive.Trigger ref={ref} asChild disabled={isDisabled} {...props}>
          {render}
        </DropdownMenuPrimitive.Trigger>
      )
    }
    return (
      <DropdownMenuPrimitive.Trigger ref={ref} disabled={isDisabled} {...props}>
        {children}
      </DropdownMenuPrimitive.Trigger>
    )
  },
)

DropdownTrigger.displayName = "DropdownTrigger"

type RadixContentProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>

interface DropdownContentProps {
  children: ReactNode
  className?: string
  checkedIndex?: number
  side?: RadixContentProps["side"]
  align?: RadixContentProps["align"]
  sideOffset?: number
}

const DropdownContent = forwardRef<HTMLDivElement, DropdownContentProps>(
  (
    { className, children, checkedIndex, side = "bottom", align = "start", sideOffset = 6 },
    ref,
  ) => {
    const { open } = useDropdownMenuContext()
    const containerRef = useRef<HTMLDivElement>(null)

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

    const [mounted, setMounted] = useState(false)

    useEffect(() => {
      if (!open) return
      const frame = requestAnimationFrame(() => setMounted(true))
      return () => cancelAnimationFrame(frame)
    }, [open])

    useEffect(() => {
      if (open) return
      const id = setTimeout(() => setMounted(false), exitFallbackMs(spring.fast))
      return () => clearTimeout(id)
    }, [open])

    useEffect(() => {
      if (!open || !mounted) return
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
    }, [open, mounted, measureItems])

    const activeRect = activeIndex !== null ? itemRects[activeIndex] : null
    const checkedRect = checkedIndex != null ? itemRects[checkedIndex] : null
    const focusRect = focusedIndex !== null ? itemRects[focusedIndex] : null
    const renderMenuItem = useCallback(
      ({
        radio,
        value,
        disabled,
        label,
        closeOnClick,
        element,
        children,
      }: MenuItemRenderOptions) => {
        const commonProps = {
          asChild: true,
          textValue: label,
          ...(disabled === undefined ? {} : { disabled }),
          ...(closeOnClick ? {} : { onSelect: (event: Event) => event.preventDefault() }),
        }
        const item = cloneElement(element, {}, children)
        return radio ? (
          <DropdownMenuPrimitive.RadioItem value={String(value)} {...commonProps}>
            {item}
          </DropdownMenuPrimitive.RadioItem>
        ) : (
          <DropdownMenuPrimitive.Item {...commonProps}>{item}</DropdownMenuPrimitive.Item>
        )
      },
      [],
    )

    const contentCtx = useMemo(
      () => ({
        registerItem,
        activeIndex,
        inMenu: true,
        renderMenuItem,
        ...(checkedIndex === undefined ? {} : { checkedIndex }),
      }),
      [registerItem, activeIndex, checkedIndex, renderMenuItem],
    )

    if (!mounted) return null

    return (
      <DropdownMenuPrimitive.Portal forceMount>
        <DropdownMenuPrimitive.Content
          asChild
          forceMount
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <motion.div
            className="z-50 outline-none"
            initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
            animate={open ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -4, scaleY: 0.96 }}
            transition={open ? spring.fast : spring.fast.exit}
            style={{ transformOrigin: "top center" }}
            onAnimationComplete={() => {
              if (!open) setMounted(false)
            }}
          >
            <DropdownContext.Provider value={contentCtx}>
              <Elevated
                offset={2}
                shadowLevel={3}
                ref={(node: HTMLDivElement | null) => {
                  containerRef.current = node
                  if (typeof ref === "function") ref(node)
                  else if (ref) ref.current = node
                }}
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
                  `relative flex max-h-[min(480px,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-full min-w-(--radix-dropdown-menu-trigger-width) flex-col gap-0.5 overflow-y-auto ${shape.container} p-1 outline-none select-none`,
                  className,
                )}
              >
                <SelectedHighlight className={shape.bg} rect={checkedRect} />
                <HoverHighlight
                  className={shape.bg}
                  from={checkedRect}
                  rect={activeRect}
                  sessionKey={sessionId}
                />
                <FocusRing className={shape.focusRing} rect={focusRect} />

                <DropdownMenuPrimitive.RadioGroup
                  className="contents"
                  {...(checkedIndex === undefined ? {} : { value: String(checkedIndex) })}
                >
                  {children}
                </DropdownMenuPrimitive.RadioGroup>
              </Elevated>
            </DropdownContext.Provider>
          </motion.div>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    )
  },
)

DropdownContent.displayName = "DropdownContent"

const DropdownLabel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
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

DropdownLabel.displayName = "DropdownLabel"

const DropdownSeparator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      className={cn("bg-border/60 -mx-1 my-1 h-px shrink-0", className)}
      {...props}
    />
  ),
)

DropdownSeparator.displayName = "DropdownSeparator"

export {
  Dropdown,
  DropdownContent,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
}
export type { DropdownContentProps, DropdownMenuProps, DropdownProps, DropdownTriggerProps }
export default Dropdown
