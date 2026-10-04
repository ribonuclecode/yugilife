import { useState } from "react"

import { motion } from "framer-motion"

import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { ChartFrame } from "./chart-frame"
import { formatNumber } from "./chart-scales"
import {
  CHART_DRAW,
  chartRampPosition,
  chartRampStep,
  chartStagger,
  FIGURE_TYPE,
  useChartMotion,
  useChartReveal,
  useRampInks,
} from "./chart-tokens"

import type { ChartGoal } from "./chart-frame"
import type { ReactNode } from "react"

interface CompositionSegment {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly note?: string
}

export interface CompositionBarProps {
  readonly title: string
  readonly description?: ReactNode
  readonly goal?: ChartGoal
  readonly segments: readonly CompositionSegment[]
  readonly format?: (value: number) => string
  readonly totalLabel?: string
  readonly totalValue?: string
  readonly footnote?: ReactNode
}

const BAR_HEIGHT = 42
const SURFACE_GAP = 3
const INLINE_LABEL_MIN = 56

export function CompositionBar({
  description,
  footnote,
  goal,
  format = (value) => formatNumber(value),
  segments,
  title,
  totalLabel = "Total",
  totalValue,
}: CompositionBarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const reduceMotion = useChartMotion()
  const [revealRef, revealed] = useChartReveal<HTMLDivElement>()
  const inks = useRampInks()
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const share = (value: number) => (total === 0 ? 0 : value / total)
  const percent = (value: number) => `${(share(value) * 100).toFixed(1)}%`

  return (
    <ChartFrame
      columns={[
        { key: "label", label: "Part" },
        { key: "value", label: "Value", numeric: true },
        { key: "share", label: "Share", numeric: true },
      ]}
      description={description}
      footnote={footnote}
      goal={goal}
      tableView={false}
      rows={[
        ...segments.map((segment) => [
          segment.label,
          format(segment.value),
          percent(segment.value),
        ]),
        [totalLabel, totalValue ?? format(total), "100.0%"],
      ]}
      title={title}
    >
      {(width) => {
        const gaps = SURFACE_GAP * Math.max(0, segments.length - 1)
        const usable = Math.max(1, width - gaps)
        let cursor = 0
        const placed = segments.map((segment, index) => {
          const segmentWidth = Math.max(0, share(segment.value) * usable)
          const x = cursor
          cursor += segmentWidth + SURFACE_GAP
          const position = chartRampPosition(index, segments.length)
          return {
            color: chartRampStep(index, segments.length),
            ink: inks[position] ?? "var(--user-accent-foreground)",
            segment,
            segmentWidth,
            x,
          }
        })

        return (
          <div>
            <div className="relative" ref={revealRef} style={{ height: BAR_HEIGHT }}>
              {placed.map(({ color, ink, segment, segmentWidth, x }, index) => {
                const isHovered = hovered === segment.id
                return (
                  <motion.button
                    animate={{ opacity: hovered !== null && !isHovered ? 0.45 : 1 }}
                    className="absolute top-0 cursor-default overflow-hidden rounded-md border-none bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--background)"
                    initial={false}
                    key={segment.id}
                    onBlur={() => setHovered(null)}
                    onFocus={() => setHovered(segment.id)}
                    onPointerEnter={() => setHovered(segment.id)}
                    onPointerLeave={() => setHovered(null)}
                    style={{ height: BAR_HEIGHT, left: x, width: segmentWidth }}
                    transition={reduceMotion ? { duration: 0 } : spring.fast}
                    type="button"
                  >
                    <motion.span
                      animate={{ width: revealed || reduceMotion ? segmentWidth : 0 }}
                      className="absolute top-0 left-0 block"
                      initial={false}
                      style={{ backgroundColor: color, height: BAR_HEIGHT }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { ...spring.slow, delay: chartStagger(index, reduceMotion) }
                      }
                    />
                    {segmentWidth >= INLINE_LABEL_MIN && (
                      <motion.span
                        animate={{ opacity: revealed || reduceMotion ? 1 : 0 }}
                        className={cn(
                          FIGURE_TYPE.value,
                          "absolute inset-0 grid place-items-center tabular-nums",
                        )}
                        initial={false}
                        style={{ color: ink }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : {
                                delay:
                                  chartStagger(index, reduceMotion) + CHART_DRAW.afterBar.delay,
                                duration: CHART_DRAW.afterBar.duration,
                              }
                        }
                      >
                        {format(segment.value)}
                      </motion.span>
                    )}
                    <span className="sr-only">
                      {`${segment.label}: ${format(segment.value)}, ${percent(segment.value)}`}
                    </span>
                  </motion.button>
                )
              })}
            </div>

            <div className="mt-5 grid gap-y-3">
              {placed.map(({ color, segment }) => {
                const isHovered = hovered === segment.id
                return (
                  <div
                    className={cn(
                      "flex items-baseline gap-3 transition-opacity",
                      hovered !== null && !isHovered && "opacity-45",
                    )}
                    key={segment.id}
                    onPointerEnter={() => setHovered(segment.id)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-1 shrink-0 translate-y-1 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn(FIGURE_TYPE.label, "text-foreground block truncate")}>
                        {segment.label}
                      </span>
                      {segment.note !== undefined && (
                        <span
                          className={cn(
                            FIGURE_TYPE.note,
                            "text-muted-foreground mt-0.5 block truncate",
                          )}
                        >
                          {segment.note}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        FIGURE_TYPE.note,
                        "text-muted-foreground w-12 shrink-0 text-right tabular-nums",
                      )}
                    >
                      {percent(segment.value)}
                    </span>
                    <span
                      className={cn(
                        FIGURE_TYPE.value,
                        "text-foreground w-16 shrink-0 text-right tabular-nums",
                      )}
                    >
                      {format(segment.value)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="border-border mt-5 flex items-baseline justify-between border-t pt-3.5">
              <span className={cn(FIGURE_TYPE.label, "text-foreground")}>{totalLabel}</span>
              <span
                className={cn(
                  FIGURE_TYPE.value,
                  "text-foreground w-16 shrink-0 text-right tabular-nums",
                )}
              >
                {totalValue ?? format(total)}
              </span>
            </div>
          </div>
        )
      }}
    </ChartFrame>
  )
}
