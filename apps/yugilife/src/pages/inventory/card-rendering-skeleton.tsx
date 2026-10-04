import { useShape } from "@/lib/shape-context"
import { cn } from "@/lib/utils"

import type { CSSProperties } from "react"

const columns = 11
const rows = 16
const sweepMs = 990
const cycleMs = 1600

const tiles = Array.from({ length: columns * rows }, (_, index) => ({
  // The sweep runs corner to corner, so a tile's offset is its distance along the diagonal.
  diagonal: (index % columns) + Math.floor(index / columns),
  index,
}))
const tileStepMs = Math.round(sweepMs / (columns + rows - 2))

export const cardRenderingLoopMs = sweepMs + cycleMs

export function CardRenderingSkeleton({ className }: { className?: string }) {
  const shape = useShape()
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-full grid-cols-[repeat(11,minmax(0,1fr))] grid-rows-[repeat(16,minmax(0,1fr))] gap-[2px] p-[2px]",
        className,
      )}
      style={{ "--tile-cycle": `${cycleMs}ms`, "--tile-step": `${tileStepMs}ms` } as CSSProperties}
    >
      {tiles.map(({ diagonal, index }) => (
        <span
          className={cn("card-tile", shape.item)}
          key={index}
          style={{ "--tile-delay": diagonal } as CSSProperties}
        />
      ))}
    </span>
  )
}
