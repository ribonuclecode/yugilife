import type { AssetSource } from "./contracts/index.js"

export type Drawable = Exclude<AssetSource, string | URL | Blob>

function hasDimensions(value: object) {
  return "width" in value && "height" in value && !Array.isArray(value)
}

export function isDrawable(source: AssetSource): source is Drawable {
  return (
    typeof source !== "string" &&
    !(source instanceof URL) &&
    !(source instanceof Blob) &&
    hasDimensions(source)
  )
}

export function isAssetSource(value: unknown): value is AssetSource {
  return (
    typeof value === "string" ||
    value instanceof URL ||
    value instanceof Blob ||
    (typeof value === "object" && value !== null && hasDimensions(value))
  )
}
