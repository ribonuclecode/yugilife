import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

import type { ClassValue } from "clsx"

const surfaceShadows = [1, 2, 3, 4, 5, 6, 7, 8].map((level) => `shadow-surface-${level}`)

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": ["text-display", "text-title", "text-subtitle", "text-body", "text-caption"],
      shadow: surfaceShadows,
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
