export interface PinMaskPoint {
  id: number
  polarity: "keep" | "remove"
  size: number
  x: number
  y: number
}

export interface ArtworkMaskEffects {
  antiAlias?: boolean
  glow?: number
}
