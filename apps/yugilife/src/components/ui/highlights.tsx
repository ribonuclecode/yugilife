import { AnimatePresence, motion } from "framer-motion"

import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import type { ItemRect } from "@/hooks/use-proximity-hover"

type HighlightRect = ItemRect | null | undefined

function bounds(rect: ItemRect) {
  return { height: rect.height, left: rect.left, top: rect.top, width: rect.width }
}

export function SelectedHighlight({ className, rect }: { className: string; rect: HighlightRect }) {
  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          className={cn("bg-active pointer-events-none absolute", className)}
          initial={false}
          animate={{ ...bounds(rect), opacity: 1 }}
          exit={{ opacity: 0, transition: spring.moderate.exit }}
          transition={{ ...spring.moderate, opacity: { duration: 0.08 } }}
        />
      )}
    </AnimatePresence>
  )
}

export function HoverHighlight({
  className,
  from,
  rect,
  sessionKey,
}: {
  className: string
  from?: HighlightRect
  rect: HighlightRect
  sessionKey: number
}) {
  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          key={sessionKey}
          className={cn("bg-hover pointer-events-none absolute", className)}
          initial={{ ...bounds(from ?? rect), opacity: 0 }}
          animate={{ ...bounds(rect), opacity: 1 }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={{ ...spring.fast, opacity: { duration: 0.08 } }}
        />
      )}
    </AnimatePresence>
  )
}

export function FocusRing({ className, rect }: { className: string; rect: HighlightRect }) {
  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          className={cn(
            "pointer-events-none absolute z-20 border border-(--focus-ring)",
            className,
          )}
          initial={false}
          animate={{
            height: rect.height + 4,
            left: rect.left - 2,
            top: rect.top - 2,
            width: rect.width + 4,
          }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={{ ...spring.fast, opacity: { duration: 0.08 } }}
        />
      )}
    </AnimatePresence>
  )
}
