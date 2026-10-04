"use client"

import { createContext, useContext, useEffect, useState } from "react"

import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { motion } from "framer-motion"

import { fontWeights } from "@/lib/font-weight"
import { useShape } from "@/lib/shape-context"
import { useSize } from "@/lib/size-context"
import { exitFallbackMs, spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import type { ComponentPropsWithoutRef, ReactElement, ReactNode, Ref } from "react"

const DEFAULT_DELAY = 200

const TooltipGroupContext = createContext(false)

interface TooltipProviderProps {
  children: ReactNode
  delayDuration?: number
  skipDelayDuration?: number
}

function TooltipProvider({
  children,
  delayDuration = DEFAULT_DELAY,
  skipDelayDuration = 300,
}: TooltipProviderProps) {
  return (
    <TooltipGroupContext.Provider value={true}>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
      >
        {children}
      </TooltipPrimitive.Provider>
    </TooltipGroupContext.Provider>
  )
}

type TooltipSide = "top" | "right" | "bottom" | "left"

interface TooltipProps extends Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "content"
> {
  content: ReactNode
  children: ReactElement
  side?: TooltipSide
  sideOffset?: number
  delayDuration?: number
  className?: string
  forceOpen?: boolean
  onOpenChange?: (open: boolean) => void
  ref?: Ref<HTMLButtonElement>
}

function getSlideOffset(side: TooltipSide) {
  switch (side) {
    case "top":
      return { y: 4 }
    case "bottom":
      return { y: -4 }
    case "left":
      return { x: 4 }
    case "right":
      return { x: -4 }
  }
}

function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 8,
  delayDuration,
  className,
  forceOpen,
  onOpenChange: onOpenChangeProp,
  ...triggerProps
}: TooltipProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = forceOpen !== undefined ? forceOpen : internalOpen
  const [mounted, setMounted] = useState(false)
  const shape = useShape()
  const sizeClasses = useSize()
  const hasAmbientProvider = useContext(TooltipGroupContext)

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

  const handleExitComplete = () => {
    if (!open) setMounted(false)
  }

  const slideOffset = getSlideOffset(side)

  const tooltipRootProps = delayDuration === undefined ? {} : { delayDuration }

  const tooltip = (
    <TooltipPrimitive.Root
      {...tooltipRootProps}
      open={open}
      onOpenChange={(value) => {
        setInternalOpen(value)
        onOpenChangeProp?.(value)
      }}
    >
      <TooltipPrimitive.Trigger asChild {...triggerProps}>
        {children}
      </TooltipPrimitive.Trigger>
      {mounted && (
        <TooltipPrimitive.Portal forceMount>
          <TooltipPrimitive.Content asChild side={side} sideOffset={sideOffset} forceMount>
            <motion.div
              className={cn(
                "bg-foreground text-background z-60 px-2 py-1",
                sizeClasses.caption,
                "[text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both]:py-2",
                shape.bg,
                className,
              )}
              style={{ fontVariationSettings: fontWeights.medium }}
              initial={{ opacity: 0, ...slideOffset }}
              animate={{
                opacity: open ? 1 : 0,
                x: 0,
                y: 0,
              }}
              transition={open ? spring.fast : spring.fast.exit}
              onAnimationComplete={handleExitComplete}
            >
              {content}
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      )}
    </TooltipPrimitive.Root>
  )

  if (hasAmbientProvider) return tooltip

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration ?? DEFAULT_DELAY}>
      {tooltip}
    </TooltipPrimitive.Provider>
  )
}

export { Tooltip, TooltipProvider }
export type { TooltipProps, TooltipProviderProps, TooltipSide }
