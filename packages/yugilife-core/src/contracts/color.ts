import type { Region, SemanticAssetId } from "./template.js"

export interface IdentityColorPreset {
  method: "identity"
  metadata?: {
    target?: string
  }
}

export interface PolynomialColorPreset {
  method: "rgb-polynomial"
  exponents: readonly (readonly number[])[]
  coefficients: readonly (readonly number[])[]
  metadata?: {
    target?: string
  }
}

export interface HistogramColorPreset {
  method: "skimage-histogram-rgb-lut"
  channels: {
    r: readonly number[]
    g: readonly number[]
    b: readonly number[]
  }
  metadata?: {
    target?: string
  }
}

export type ColorPreset = IdentityColorPreset | PolynomialColorPreset | HistogramColorPreset
export type ColorPresetCollection = Readonly<Record<string, ColorPreset>>

/** A source region of one semantic asset graded by one color preset. */
export interface TexturePreparation {
  readonly assetId: SemanticAssetId
  readonly presetName: string
  /** Omitted when the layer grades the complete source image. */
  readonly region?: Region | undefined
}

/**
 * A graded texture stored as opaque `color` and `alpha` planes, which round-trip losslessly where a
 * single RGBA image would not.
 */
export interface PreparedTexturePayload {
  /** `preparedTextureKey` of the preparation this payload satisfies. */
  readonly key: string
  readonly width: number
  readonly height: number
  /** Lossless opaque image of the graded color channels. */
  readonly color: Blob
  /** Lossless opaque image of the source coverage; omitted when the region is fully opaque. */
  readonly alpha?: Blob | undefined
}

/** Prepared textures by `preparedTextureKey`; a missing texture resolves to undefined and is graded live. */
export interface PreparedTextures {
  get(key: string): CanvasImageSource | PromiseLike<CanvasImageSource | undefined> | undefined
}
