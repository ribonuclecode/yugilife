import { loadDrawable } from "./rendering/assets.js"
import { throwIfAborted } from "./rendering/async-resources.js"
import { flattenDrawableLayers, isRasterLayer } from "./rendering/layer-tree.js"
import { MapAssetResolver } from "./asset-resolver.js"
import { applyColorPreset } from "./color-grading.js"

import type {
  CardTemplate,
  CardTemplateBundle,
  ColorPresetCollection,
  PreparedTexturePayload,
  PreparedTextures,
  Region,
  TexturePreparation,
} from "./contracts/index.js"

// Presets are keyed by name: any content change mints a new template version, which scopes the key.
export function preparedTextureKey({ assetId, presetName, region }: TexturePreparation) {
  const area = region ? `${region.x},${region.y},${region.width},${region.height}` : "source"
  return `${assetId}\u0000${presetName}\u0000${area}`
}

function texturePreparation(
  assetId: string,
  presetName: string,
  region: Region | undefined,
): TexturePreparation {
  return { assetId, presetName, ...(region ? { region } : {}) }
}

// User preset overrides are excluded on purpose; they may name any preset and keep grading live.
export function collectTexturePreparations(
  template: CardTemplate,
  colorPresets: ColorPresetCollection,
): readonly TexturePreparation[] {
  const rules = template.presentationRules ?? []
  const preparations: TexturePreparation[] = []
  const seen = new Set<string>()

  for (const layer of flattenDrawableLayers(template.layers)) {
    if (!isRasterLayer(layer)) continue

    const assetIds = new Set<string>()
    if (layer.assetId) assetIds.add(layer.assetId)
    rules.forEach((rule) => {
      const selected = rule.assetSelections?.[layer.id]
      if (selected) assetIds.add(selected)
    })

    const presetNames = new Set<string>()
    if (layer.defaultPreset) presetNames.add(layer.defaultPreset)
    if (layer.presetTarget) {
      const target = layer.presetTarget
      rules.forEach((rule) => {
        const name = rule.presets?.[target]
        if (name) presetNames.add(name)
      })
    }

    for (const assetId of assetIds) {
      for (const presetName of presetNames) {
        const method = colorPresets[presetName]?.method
        if (method === undefined || method === "identity") continue
        const preparation = texturePreparation(assetId, presetName, layer.sourceRegion)
        const key = preparedTextureKey(preparation)
        if (seen.has(key)) continue
        seen.add(key)
        preparations.push(preparation)
      }
    }
  }

  return preparations
}

function createCanvas(width: number, height: number, readback = false) {
  if (typeof document === "undefined") {
    throw new Error("Preparing textures requires a browser-compatible document and canvas.")
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: readback })
  if (!context) throw new Error("A 2D canvas context is required to prepare a texture.")
  return { canvas, context }
}

function encodePlane(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("The browser could not encode a prepared texture plane."))
    }, "image/png")
  })
}

// Opaque planes avoid premultiplication, which keeps the lossless round trip exact.
async function encodeOpaquePlane(pixels: ImageData) {
  for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = 255
  const { canvas, context } = createCanvas(pixels.width, pixels.height)
  context.putImageData(pixels, 0, 0)
  return await encodePlane(canvas)
}

function coveragePlane(pixels: ImageData) {
  let transparent = false
  for (let index = 3; index < pixels.data.length; index += 4) {
    if (pixels.data[index] !== 255) {
      transparent = true
      break
    }
  }
  if (!transparent) return undefined
  const coverage = new ImageData(pixels.width, pixels.height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index + 3]!
    coverage.data[index] = alpha
    coverage.data[index + 1] = alpha
    coverage.data[index + 2] = alpha
    coverage.data[index + 3] = 255
  }
  return coverage
}

async function gradeTexture(
  assets: MapAssetResolver,
  colorPresets: ColorPresetCollection,
  preparation: TexturePreparation,
  signal?: AbortSignal,
): Promise<PreparedTexturePayload> {
  const preset = colorPresets[preparation.presetName]
  if (!preset) {
    throw new Error(`Unknown color preset "${preparation.presetName}".`)
  }
  const drawable = await loadDrawable(assets.resolve(preparation.assetId), signal)
  throwIfAborted(signal)
  const source = drawable as {
    height: number
    naturalHeight?: number
    naturalWidth?: number
    width: number
  }
  const region = preparation.region ?? {
    x: 0,
    y: 0,
    width: source.naturalWidth ?? source.width,
    height: source.naturalHeight ?? source.height,
  }

  const { context } = createCanvas(region.width, region.height, true)
  context.drawImage(
    drawable,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  )
  const pixels = context.getImageData(0, 0, region.width, region.height)
  const coverage = coveragePlane(pixels)
  // The CPU evaluator is the byte-exact reference, so persisted textures never depend on a GPU.
  applyColorPreset(pixels, preset)

  return {
    key: preparedTextureKey(preparation),
    width: region.width,
    height: region.height,
    color: await encodeOpaquePlane(pixels),
    ...(coverage ? { alpha: await encodeOpaquePlane(coverage) } : {}),
  }
}

export interface PrepareTemplateTexturesOptions {
  readonly onProgress?: ((completed: number, total: number) => void) | undefined
  readonly signal?: AbortSignal | undefined
}

export interface PreparedTemplateTextures {
  readonly payloads: readonly PreparedTexturePayload[]
  readonly textures: PreparedTextures
}

// Textures are decoded from the payloads, so fresh and restored textures share one code path.
export async function prepareTemplateTextures(
  bundle: CardTemplateBundle,
  options: PrepareTemplateTexturesOptions = {},
): Promise<PreparedTemplateTextures> {
  const preparations = collectTexturePreparations(bundle.template, bundle.colorPresets)
  const assets = new MapAssetResolver(bundle.assets)
  const payloads: PreparedTexturePayload[] = []
  options.onProgress?.(0, preparations.length)
  for (const preparation of preparations) {
    throwIfAborted(options.signal)
    payloads.push(await gradeTexture(assets, bundle.colorPresets, preparation, options.signal))
    options.onProgress?.(payloads.length, preparations.length)
  }
  return { payloads, textures: decodePreparedTextures(payloads) }
}

async function decodePlane(blob: Blob, width: number, height: number) {
  const drawable =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" })
      : await loadDrawable(blob)
  try {
    const { context } = createCanvas(width, height, true)
    context.drawImage(drawable, 0, 0)
    return context.getImageData(0, 0, width, height)
  } finally {
    if (typeof ImageBitmap !== "undefined" && drawable instanceof ImageBitmap) drawable.close()
  }
}

async function decodePreparedTexture(payload: PreparedTexturePayload) {
  const pixels = await decodePlane(payload.color, payload.width, payload.height)
  if (payload.alpha) {
    const coverage = await decodePlane(payload.alpha, payload.width, payload.height)
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index + 3] = coverage.data[index]!
    }
  }
  const { canvas, context } = createCanvas(payload.width, payload.height)
  context.putImageData(pixels, 0, 0)
  return canvas
}

// Decodes lazily; an undecodable payload resolves to undefined so the render grades it live.
export function decodePreparedTextures(
  payloads: readonly PreparedTexturePayload[],
): PreparedTextures {
  const byKey = new Map(payloads.map((payload) => [payload.key, payload]))
  const decoded = new Map<string, Promise<CanvasImageSource | undefined>>()
  return {
    get(key: string) {
      const payload = byKey.get(key)
      if (!payload) return undefined
      let pending = decoded.get(key)
      if (!pending) {
        pending = decodePreparedTexture(payload).catch(() => undefined)
        decoded.set(key, pending)
      }
      return pending
    },
  }
}
