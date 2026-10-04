"use client"

import { createContext, createElement, forwardRef, useContext, useEffect, useState } from "react"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { fontWeights } from "@/lib/font-weight"
import { useIcon } from "@/lib/icon-context"
import { useShape } from "@/lib/shape-context"
import { useSize } from "@/lib/size-context"
import { exitFallbackMs, spring } from "@/lib/springs"
import { surfaceClasses } from "@/lib/surface-classes"
import { SurfaceProvider, useSurface } from "@/lib/surface-context"
import { cn } from "@/lib/utils"

import type { ComponentPropsWithoutRef, HTMLAttributes } from "react"

const DIALOG_OFFSET = 4

const DialogOpenContext = createContext(false)

function Dialog({
  children,
  open: controlledOpen,
  defaultOpen,
  ...props
}: DialogPrimitive.DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const open = controlledOpen ?? uncontrolledOpen
  const handleOpenChange = (next: boolean) => {
    setUncontrolledOpen(next)
    props.onOpenChange?.(next)
  }

  return (
    <DialogOpenContext.Provider value={open}>
      <DialogPrimitive.Root {...props} open={open} onOpenChange={handleOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </DialogOpenContext.Provider>
  )
}

const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: "sm" | "lg"
  container?: HTMLElement | null
}

const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, size = "sm", container, ...props }, ref) => {
    const XIcon = useIcon("x")
    const open = useContext(DialogOpenContext)
    const shape = useShape()
    const substrate = useSurface()
    const dialogLevel = Math.min(substrate + DIALOG_OFFSET, 8)
    const compact = useSize().variant === "compact"
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
      if (!open) return
      const frame = requestAnimationFrame(() => setMounted(true))
      return () => cancelAnimationFrame(frame)
    }, [open])

    useEffect(() => {
      if (open) return
      const id = setTimeout(() => setMounted(false), exitFallbackMs(spring.slow))
      return () => clearTimeout(id)
    }, [open])

    const handleExitComplete = () => {
      if (!open) setMounted(false)
    }

    if (!mounted) return null

    const portalProps = container == null ? {} : { container }

    return (
      <DialogPrimitive.Portal forceMount {...portalProps}>
        <DialogPrimitive.Overlay asChild forceMount>
          <motion.div
            className={cn(container ? "absolute" : "fixed", "bg-scrim inset-0 z-50")}
            initial={{ opacity: 0 }}
            animate={{ opacity: open ? 1 : 0 }}
            transition={open ? spring.slow : spring.slow.exit}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content ref={ref} asChild forceMount {...props}>
          <motion.div
            className={cn(
              container ? "absolute" : "fixed",
              "top-1/2 left-1/2 z-50 w-[calc(100%-2rem)]",
              surfaceClasses(dialogLevel),
              "p-4 focus:outline-none",
              size === "sm" && (compact ? "max-w-[360px]" : "max-w-[400px]"),
              size === "lg" && (compact ? "max-w-[480px]" : "max-w-[540px]"),
              shape.container,
              className,
            )}
            initial={{ opacity: 0, scale: 0.97, x: "-50%", y: "-50%" }}
            animate={{
              opacity: open ? 1 : 0,
              scale: open ? 1 : 0.97,
              x: "-50%",
              y: "-50%",
            }}
            transition={open ? spring.slow : spring.slow.exit}
            onAnimationComplete={handleExitComplete}
          >
            <SurfaceProvider value={dialogLevel}>
              {children}
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3">
                  {createElement(XIcon)}
                  <span className="sr-only">Close</span>
                </Button>
              </DialogPrimitive.Close>
            </SurfaceProvider>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  },
)
DialogContent.displayName = "DialogContent"

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1.5", className)} {...props} />
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex flex-wrap justify-end gap-2", className)} {...props} />
}

const DialogTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const sizeClasses = useSize()
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-foreground leading-tight", sizeClasses.title, className)}
      style={{ fontVariationSettings: fontWeights.bold }}
      {...props}
    />
  )
})
DialogTitle.displayName = "DialogTitle"

const DialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const sizeClasses = useSize()
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-muted-foreground", sizeClasses.body, className)}
      {...props}
    />
  )
})
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
