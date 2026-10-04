/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { runAppearanceTransition } from "./appearance-transition"

import type { ReactNode } from "react"

type ShapeVariant = "pill" | "rounded"

interface ShapeClasses {
  item: string
  bg: string
  focusRing: string
  container: string
  button: string
  input: string
  bgRadius: number
  mergedRadius: number
}

const shapeMap: Record<ShapeVariant, ShapeClasses> = {
  pill: {
    item: "rounded-[20px]",
    bg: "rounded-[20px]",
    focusRing: "rounded-[22px]",
    container: "rounded-3xl",
    button: "rounded-[20px]",
    input: "rounded-[20px]",
    bgRadius: 20,
    mergedRadius: 16,
  },
  rounded: {
    item: "rounded-lg",
    bg: "rounded-lg",
    focusRing: "rounded-[10px]",
    container: "rounded-xl",
    button: "rounded-lg",
    input: "rounded-lg",
    bgRadius: 8,
    mergedRadius: 8,
  },
}

const popupShape = shapeMap.rounded

interface ShapeContextValue {
  shape: ShapeVariant
  setShape: (shape: ShapeVariant) => void
  classes: ShapeClasses
}

const ShapeContext = createContext<ShapeContextValue | null>(null)

function useShape(): ShapeClasses {
  const ctx = useContext(ShapeContext)
  if (!ctx) return shapeMap.rounded
  return ctx.classes
}

function ShapeProvider({
  children,
  defaultShape = "rounded",
}: {
  children: ReactNode
  defaultShape?: ShapeVariant
}) {
  const [shape, setShapeState] = useState<ShapeVariant>(defaultShape)

  const setShape = useCallback(
    (next: ShapeVariant) => {
      if (shape === next) return
      runAppearanceTransition(() => setShapeState(next))
    },
    [shape],
  )

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--shape-input-radius",
      `${shapeMap[shape].bgRadius}px`,
    )
  }, [shape])

  const value = useMemo(() => ({ shape, setShape, classes: shapeMap[shape] }), [shape, setShape])

  return <ShapeContext.Provider value={value}>{children}</ShapeContext.Provider>
}

export { popupShape, ShapeProvider, useShape }
export type { ShapeClasses, ShapeVariant }
