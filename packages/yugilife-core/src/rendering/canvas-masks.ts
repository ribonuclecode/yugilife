import { loadDrawable } from "./assets.js"
import { SourcePromiseCache, throwIfAborted, withAbort } from "./async-resources.js"

import type {
  AssetResolver,
  AssetSource,
  CardDimensions,
  ResolvedLayerMask,
} from "../contracts/index.js"

const preparedMaskCache = new SourcePromiseCache<HTMLCanvasElement>(32)
const scopedMaskCaches = new WeakMap<
  HTMLCanvasElement,
  WeakMap<HTMLCanvasElement, HTMLCanvasElement>
>()

function maskCacheKey(mask: ResolvedLayerMask, dimensions: CardDimensions) {
  return `${dimensions.width}x${dimensions.height}\u0000${mask.channel}\u0000${mask.invert ? "1" : "0"}`
}

function coverageFromLuminance(red: number, green: number, blue: number) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function scopeMaskAlpha(maskAlpha: number, coverageAlpha: number) {
  return 255 - Math.round((coverageAlpha * (255 - maskAlpha)) / 255)
}

// Safe to memoize only because validation requires coverage layers to render before their targets.
function scopeMaskToCoverage(
  prepared: HTMLCanvasElement,
  coverageCanvas: HTMLCanvasElement,
  dimensions: CardDimensions,
) {
  let preparedMasks = scopedMaskCaches.get(coverageCanvas)
  if (!preparedMasks) {
    preparedMasks = new WeakMap()
    scopedMaskCaches.set(coverageCanvas, preparedMasks)
  }
  const cached = preparedMasks.get(prepared)
  if (cached) return cached

  const scoped = document.createElement("canvas")
  scoped.width = dimensions.width
  scoped.height = dimensions.height
  const scopedContext = scoped.getContext("2d", { willReadFrequently: true })
  const preparedContext = prepared.getContext("2d", { willReadFrequently: true })
  const coverageContext = coverageCanvas.getContext("2d", { willReadFrequently: true })
  if (!scopedContext || !preparedContext || !coverageContext) {
    throw new Error("A 2D canvas context is required to scope a canvas mask to layer coverage.")
  }
  const preparedPixels = preparedContext.getImageData(0, 0, dimensions.width, dimensions.height)
  const coveragePixels = coverageContext.getImageData(0, 0, dimensions.width, dimensions.height)
  const output = scopedContext.createImageData(dimensions.width, dimensions.height)
  for (let index = 0; index < output.data.length; index += 4) {
    const maskAlpha = preparedPixels.data[index + 3] ?? 0
    const coverageAlpha = coveragePixels.data[index + 3] ?? 0
    const alpha = scopeMaskAlpha(maskAlpha, coverageAlpha)
    output.data[index] = 255
    output.data[index + 1] = 255
    output.data[index + 2] = 255
    output.data[index + 3] = alpha
  }
  scopedContext.putImageData(output, 0, 0)
  preparedMasks.set(prepared, scoped)
  return scoped
}

async function prepareCanvasMask(
  source: AssetSource,
  mask: ResolvedLayerMask,
  dimensions: CardDimensions,
): Promise<HTMLCanvasElement> {
  const drawable = await loadDrawable(source)
  const canvas = document.createElement("canvas")
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("A 2D canvas context is required to prepare a canvas mask.")
  context.drawImage(drawable, 0, 0, dimensions.width, dimensions.height)

  if (mask.channel === "luminance" || mask.invert) {
    const imageData = context.getImageData(0, 0, dimensions.width, dimensions.height)
    const { data } = imageData
    for (let index = 0; index < data.length; index += 4) {
      const sourceAlpha = data[index + 3] ?? 0
      let alpha = sourceAlpha
      if (mask.channel === "luminance") {
        let coverage = coverageFromLuminance(
          data[index] ?? 0,
          data[index + 1] ?? 0,
          data[index + 2] ?? 0,
        )
        if (mask.invert) coverage = 255 - coverage
        alpha = (coverage * sourceAlpha) / 255
      } else if (mask.invert) {
        alpha = 255 - sourceAlpha
      }
      data[index] = 255
      data[index + 1] = 255
      data[index + 2] = 255
      data[index + 3] = Math.round(alpha)
    }
    context.putImageData(imageData, 0, 0)
  }

  return canvas
}

async function preparedCanvasMask(
  assets: AssetResolver,
  mask: ResolvedLayerMask,
  dimensions: CardDimensions,
  signal?: AbortSignal,
) {
  const source = assets.resolve(mask.assetId)
  return await withAbort(
    preparedMaskCache.getOrCreate(source, maskCacheKey(mask, dimensions), () =>
      prepareCanvasMask(source, mask, dimensions),
    ),
    signal,
  )
}

export async function applyCanvasMask(
  canvas: HTMLCanvasElement,
  assets: AssetResolver,
  mask: ResolvedLayerMask,
  dimensions: CardDimensions,
  coverageCanvas?: HTMLCanvasElement,
  signal?: AbortSignal,
) {
  const prepared = await preparedCanvasMask(assets, mask, dimensions, signal)
  throwIfAborted(signal)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("A 2D canvas context is required to apply a canvas mask.")
  let effectiveMask = prepared
  if (mask.coverageLayerId) {
    // Zero coverage yields an opaque scoped mask, so a missing coverage surface means no masking.
    if (!coverageCanvas) return
    effectiveMask = scopeMaskToCoverage(prepared, coverageCanvas, dimensions)
  }
  context.save()
  try {
    context.globalCompositeOperation = "destination-in"
    context.drawImage(effectiveMask, 0, 0, dimensions.width, dimensions.height)
  } finally {
    context.restore()
  }
}
