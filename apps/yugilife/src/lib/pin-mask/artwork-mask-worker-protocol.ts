import type { ArtworkMaskEffects } from "./quick-selection-types"

export interface ArtworkMaskRequest {
  id: number
  sourceId: number
  source: Blob
  channel: "alpha" | "luminance"
  effects: ArtworkMaskEffects
}

export interface ArtworkMaskFrame {
  blob: Blob
  width: number
  height: number
  pixels: Uint8ClampedArray<ArrayBuffer>
}

export type ArtworkMaskResponse =
  { id: number; frame: ArtworkMaskFrame } | { id: number; error: string }
