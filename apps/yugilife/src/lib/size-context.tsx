/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from "react"

import type { ReactNode } from "react"

type SizeVariant = "default" | "compact"

interface SizeClasses {
  variant: SizeVariant
  control: string
  controlHeight: number
  segmentItem: string
  segmentPad: string
  text: string
  display: string
  title: string
  subtitle: string
  body: string
  caption: string
  px: string
  pxStart: string
  itemPx: string
  gap: string
  icon: number
}

const sizeTypeClasses = {
  default: {
    display: "text-[28px]",
    title: "text-[16px]",
    subtitle: "text-[14px]",
    body: "text-[13px]",
    caption: "text-[12px]",
  },
  compact: {
    display: "text-[24px]",
    title: "text-[15px]",
    subtitle: "text-[13px]",
    body: "text-[12px]",
    caption: "text-[11px]",
  },
} as const

const sizeMap: Record<SizeVariant, SizeClasses> = {
  default: {
    variant: "default",
    control: "h-9",
    controlHeight: 36,
    segmentItem: "h-7",
    segmentPad: "p-1",
    text: sizeTypeClasses.default.body,
    ...sizeTypeClasses.default,
    px: "px-3",
    pxStart: "pl-3",
    itemPx: "px-2",
    gap: "gap-2",
    icon: 16,
  },
  compact: {
    variant: "compact",
    control: "h-7",
    controlHeight: 28,
    segmentItem: "h-6",
    segmentPad: "p-0.5",
    text: sizeTypeClasses.compact.body,
    ...sizeTypeClasses.compact,
    px: "px-2.5",
    pxStart: "pl-2.5",
    itemPx: "px-1.5",
    gap: "gap-1",
    icon: 14,
  },
}

interface SizeContextValue {
  size: SizeVariant
  setSize: (size: SizeVariant) => void
  classes: SizeClasses
}

const SizeContext = createContext<SizeContextValue | null>(null)

function useSizeVariant(override?: SizeVariant | null): SizeVariant {
  const ctx = useContext(SizeContext)
  return override ?? ctx?.size ?? "default"
}

function useSize(override?: SizeVariant | null): SizeClasses {
  return sizeMap[useSizeVariant(override)]
}

function SizeProvider({
  children,
  size,
  defaultSize = "default",
}: {
  children: ReactNode
  size?: SizeVariant
  defaultSize?: SizeVariant
}) {
  const [internalSize, setInternalSize] = useState<SizeVariant>(defaultSize)
  const isControlled = size !== undefined
  const resolved = size ?? internalSize

  const setSize = useCallback(
    (next: SizeVariant) => {
      if (isControlled) return
      setInternalSize(next)
    },
    [isControlled],
  )

  const value = useMemo(
    () => ({ size: resolved, setSize, classes: sizeMap[resolved] }),
    [resolved, setSize],
  )

  return <SizeContext.Provider value={value}>{children}</SizeContext.Provider>
}

export { SizeProvider, useSize, useSizeVariant }
export type { SizeClasses, SizeVariant }
