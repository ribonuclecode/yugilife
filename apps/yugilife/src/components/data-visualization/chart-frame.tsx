import { useId, useLayoutEffect, useRef, useState } from "react"

import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react"

import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import {
  CHART_ACCENT,
  FIGURE_TYPE,
  useChartMotion,
  useChartReveal,
  useMeasuredWidth,
} from "./chart-tokens"
import { DataTable } from "./data-table"

import type { DataTableColumn } from "./data-table"
import type { ReactNode } from "react"

type ChartGoalDirection =
  "lower" | "higher" | "lower-left" | "lower-right" | "upper-left" | "upper-right"

export interface ChartGoal {
  readonly direction: ChartGoalDirection
  readonly label?: ReactNode
}

const GOAL_ARROW = {
  higher: ArrowUp,
  lower: ArrowDown,
  "lower-left": ArrowDownLeft,
  "lower-right": ArrowDownRight,
  "upper-left": ArrowUpLeft,
  "upper-right": ArrowUpRight,
} as const

const GOAL_LABEL = {
  higher: "Higher is better",
  lower: "Lower is better",
  "lower-left": "Bottom left is better",
  "lower-right": "Bottom right is better",
  "upper-left": "Top left is better",
  "upper-right": "Top right is better",
} as const

const GOAL_VECTOR = {
  higher: { x: 0, y: -1 },
  lower: { x: 0, y: 1 },
  "lower-left": { x: -1, y: 1 },
  "lower-right": { x: 1, y: 1 },
  "upper-left": { x: -1, y: -1 },
  "upper-right": { x: 1, y: -1 },
} as const

const GOAL_ICON = 12
const GOAL_WINDOW = 18
const GOAL_PITCH = 14
const GOAL_COPIES = 5
const GOAL_LOOP_SECONDS = 1.1
const GOAL_FADE = (angle: number) =>
  `linear-gradient(${angle}deg, transparent, #000 24%, #000 76%, transparent)`

function ChartGoalMarker({ goal }: { readonly goal: ChartGoal }) {
  const reduceMotion = useChartMotion()
  const [revealRef, revealed] = useChartReveal<HTMLDivElement>()
  const Arrow = GOAL_ARROW[goal.direction]
  const vector = GOAL_VECTOR[goal.direction]
  const running = revealed && !reduceMotion

  const length = Math.hypot(vector.x, vector.y)
  const step = { x: (vector.x / length) * GOAL_PITCH, y: (vector.y / length) * GOAL_PITCH }
  const fadeAngle = (Math.atan2(vector.x, -vector.y) * 180) / Math.PI
  const middle = (GOAL_COPIES - 1) / 2

  return (
    <div
      className={cn(FIGURE_TYPE.table, "text-muted-foreground mt-3 inline-flex items-center gap-1")}
      ref={revealRef}
    >
      <span
        aria-hidden="true"
        className="relative block shrink-0 overflow-hidden"
        style={{
          height: GOAL_WINDOW,
          maskImage: GOAL_FADE(fadeAngle),
          WebkitMaskImage: GOAL_FADE(fadeAngle),
          width: GOAL_WINDOW,
        }}
      >
        <motion.span
          animate={running ? { x: [0, step.x], y: [0, step.y] } : { x: 0, y: 0 }}
          className="absolute inset-0 block"
          initial={false}
          transition={
            running
              ? { duration: GOAL_LOOP_SECONDS, ease: "linear", repeat: Infinity }
              : { duration: 0 }
          }
        >
          {Array.from({ length: GOAL_COPIES }, (_, index) => (
            <span
              className="absolute inset-0 grid place-items-center"
              key={index}
              style={{
                transform: `translate(${(index - middle) * step.x}px, ${(index - middle) * step.y}px)`,
              }}
            >
              <Arrow size={GOAL_ICON} strokeWidth={2} />
            </span>
          ))}
        </motion.span>
      </span>
      {goal.label ?? GOAL_LABEL[goal.direction]}
    </div>
  )
}

export interface ChartQuadrants {
  readonly goal: "lower-left" | "lower-right" | "upper-left" | "upper-right"
  readonly x?: number
  readonly y?: number
  readonly label: string
}

export function ChartQuadrantLayer({
  hideXSplit = false,
  plot,
  quadrants,
  scaleX,
  scaleY,
  xDomain,
  yDomain,
}: {
  readonly hideXSplit?: boolean
  readonly plot: {
    readonly bottom: number
    readonly left: number
    readonly right: number
    readonly top: number
  }
  readonly quadrants: ChartQuadrants
  readonly scaleX: (value: number) => number
  readonly scaleY: (value: number) => number
  readonly xDomain: readonly [number, number]
  readonly yDomain: readonly [number, number]
}) {
  const cutX = scaleX(quadrants.x ?? (xDomain[0] + xDomain[1]) / 2)
  const cutY = scaleY(quadrants.y ?? (yDomain[0] + yDomain[1]) / 2)
  const wantsLeft = quadrants.goal.endsWith("left")
  const wantsLower = quadrants.goal.startsWith("lower")
  const zoneX = wantsLeft ? plot.left : cutX
  const zoneWidth = wantsLeft ? cutX - plot.left : plot.right - cutX
  const zoneY = wantsLower ? cutY : plot.top
  const zoneHeight = wantsLower ? plot.bottom - cutY : cutY - plot.top

  return (
    <g>
      <rect
        fill={CHART_ACCENT}
        height={Math.max(0, zoneHeight)}
        opacity={0.12}
        width={Math.max(0, zoneWidth)}
        x={zoneX}
        y={zoneY}
      />
      {!hideXSplit && (
        <line
          stroke="var(--chart-muted)"
          strokeDasharray="4 3"
          strokeWidth={1}
          x1={cutX}
          x2={cutX}
          y1={plot.top}
          y2={plot.bottom}
        />
      )}
      <line
        stroke="var(--chart-muted)"
        strokeDasharray="4 3"
        strokeWidth={1}
        x1={plot.left}
        x2={plot.right}
        y1={cutY}
        y2={cutY}
      />
      {zoneHeight >= 20 && (
        <text
          className={cn(FIGURE_TYPE.axis, "fill-muted-foreground")}
          dominantBaseline={wantsLower ? "auto" : "hanging"}
          textAnchor={wantsLeft ? "start" : "end"}
          x={wantsLeft ? zoneX + 8 : zoneX + zoneWidth - 8}
          y={wantsLower ? zoneY + zoneHeight - 7 : zoneY + 6}
        >
          {quadrants.label}
        </text>
      )}
    </g>
  )
}

export interface ChartFrameProps {
  readonly title: string
  readonly description?: ReactNode
  readonly goal?: ChartGoal | undefined
  readonly columns: readonly DataTableColumn[]
  readonly rows: readonly (readonly (string | number)[])[]
  readonly tableView?: boolean
  readonly tableNote?: ReactNode
  readonly footnote?: ReactNode
  readonly children: (width: number) => ReactNode
  readonly className?: string
}

export function ChartFrame({
  children,
  className,
  columns,
  description,
  footnote,
  goal,
  rows,
  tableNote,
  tableView = true,
  title,
}: ChartFrameProps) {
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>()
  const titleId = useId()
  const tableId = useId()
  const [showTable, setShowTable] = useState(false)
  const reduceMotion = useChartMotion()

  return (
    <figure aria-labelledby={titleId} className={cn("!my-12", className)}>
      <div
        aria-level={3}
        className={cn(FIGURE_TYPE.title, "text-foreground")}
        id={titleId}
        role="heading"
      >
        {title}
      </div>
      {description !== undefined && (
        <div className={cn(FIGURE_TYPE.description, "text-muted-foreground mt-1.5 max-w-[60ch]")}>
          {description}
        </div>
      )}
      {goal !== undefined && <ChartGoalMarker goal={goal} />}
      <div className="mt-6" ref={containerRef}>
        {width > 0 && children(width)}
      </div>
      {footnote !== undefined && (
        <div className={cn(FIGURE_TYPE.footnote, "text-muted-foreground mt-5 max-w-[60ch]")}>
          {footnote}
        </div>
      )}
      {tableView && (
        <div className="border-border mt-6 border-t pt-2.5">
          <button
            aria-controls={tableId}
            aria-expanded={showTable}
            className={cn(
              FIGURE_TYPE.table,
              "text-muted-foreground hover:text-foreground -ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent px-1 py-0.5 outline-none focus-visible:underline",
            )}
            data-cursor="button"
            onClick={() => setShowTable((value) => !value)}
            type="button"
          >
            <motion.span
              animate={{ rotate: showTable ? 180 : 0 }}
              className="inline-flex"
              initial={false}
              transition={reduceMotion ? { duration: 0 } : spring.moderate}
            >
              <ChevronDown aria-hidden="true" size={15} strokeWidth={1.75} />
            </motion.span>
            {showTable ? "Hide values" : "Show values"}
          </button>
          <AnimatePresence initial={false}>
            {showTable && (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                id={tableId}
                initial={{ height: 0, opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : spring.moderate}
              >
                <DataTable caption={title} columns={columns} note={tableNote} rows={rows} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </figure>
  )
}

export interface LegendEntry {
  readonly color: string
  readonly label: string
  readonly shape?: "line" | "swatch"
}

export function ChartLegend({ entries }: { entries: readonly LegendEntry[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {entries.map((entry) => (
        <div className="flex items-center gap-2" key={entry.label}>
          <span
            aria-hidden="true"
            className={cn(
              "shrink-0",
              entry.shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]",
            )}
            style={{ backgroundColor: entry.color }}
          />
          <span className={cn(FIGURE_TYPE.table, "text-muted-foreground")}>{entry.label}</span>
        </div>
      ))}
    </div>
  )
}

export interface TooltipRow {
  readonly color?: string
  readonly label: string
  readonly value: string
}

export interface TooltipPlacement {
  readonly dx: -1 | 1
  readonly dy: -1 | 1
}

export function ChartTooltip({
  heading,
  height,
  placement = { dx: -1, dy: -1 },
  rows,
  width,
  x,
  y,
}: {
  readonly heading: string
  readonly height: number
  readonly placement?: TooltipPlacement
  readonly rows: readonly TooltipRow[]
  readonly width: number
  readonly x: number
  readonly y: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ height: 0, width: 0 })
  const reduceMotion = useChartMotion()

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setSize({ height: element.offsetHeight, width: element.offsetWidth })
  }, [heading, rows])

  const GAP = 14
  const before = { x: x - GAP - size.width, y: y - GAP - size.height }
  const after = { x: x + GAP, y: y + GAP }
  const wantLeft = placement.dx < 0 ? before.x : after.x
  const wantTop = placement.dy < 0 ? before.y : after.y
  const fitsLeft = wantLeft >= 0 && wantLeft + size.width <= width
  const fitsTop = wantTop >= 0 && wantTop + size.height <= height
  const left = Math.max(
    0,
    Math.min(width - size.width, fitsLeft ? wantLeft : placement.dx < 0 ? after.x : before.x),
  )
  const top = Math.max(
    0,
    Math.min(height - size.height, fitsTop ? wantTop : placement.dy < 0 ? after.y : before.y),
  )

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-hidden="true"
      className="bg-surface-4 border-border shadow-surface-4 pointer-events-none absolute z-10 rounded-lg border px-3 py-2.5"
      initial={{ opacity: 0, scale: 0.96 }}
      ref={ref}
      style={{ left, top }}
      transition={reduceMotion ? { duration: 0 } : spring.fast}
    >
      <div className={cn(FIGURE_TYPE.note, "text-muted-foreground whitespace-nowrap")}>
        {heading}
      </div>
      <div className="mt-1.5 grid gap-1.5">
        {rows.map((row) => (
          <div className="flex items-baseline gap-2 whitespace-nowrap" key={row.label}>
            {row.color !== undefined && (
              <span
                className="h-0.5 w-3 shrink-0 self-center rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className={cn(FIGURE_TYPE.label, "text-foreground font-medium tabular-nums")}>
              {row.value}
            </span>
            <span className={cn(FIGURE_TYPE.note, "text-muted-foreground")}>{row.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
