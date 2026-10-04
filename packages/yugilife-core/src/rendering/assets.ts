import { isDrawable } from "../asset-source.js"

import { SourcePromiseCache, withAbort } from "./async-resources.js"
import { isTextLayer, textTypographies, walkLayers } from "./layer-tree.js"

import type { Drawable } from "../asset-source.js"
import type {
  AssetResolver,
  AssetSource,
  CardTemplate,
  ResolvedCardPresentation,
  TextTypography,
} from "../contracts/index.js"

const drawableCache = new SourcePromiseCache<Drawable>(64)
const fontCaches = new WeakMap<FontFaceSet, SourcePromiseCache<void>>()

function sourceUrl(source: string | URL | Blob) {
  if (typeof source === "string") return { url: source }
  if (source instanceof URL) return { url: source.href }
  const url = URL.createObjectURL(source)
  return { revoke: () => URL.revokeObjectURL(url), url }
}

async function loadImage(source: string | URL | Blob): Promise<Drawable> {
  if (typeof Image === "undefined") {
    throw new Error("Image assets require a browser-compatible Image implementation.")
  }
  const resolved = sourceUrl(source)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.addEventListener("load", () => resolve(image), { once: true })
      image.addEventListener(
        "error",
        () => reject(new Error(`Could not load image asset "${resolved.url}".`)),
        { once: true },
      )
      image.src = resolved.url
    })
  } finally {
    resolved.revoke?.()
  }
}

export async function loadDrawable(source: AssetSource, signal?: AbortSignal): Promise<Drawable> {
  if (isDrawable(source)) return source
  return await withAbort(
    drawableCache.getOrCreate(source, "", () => loadImage(source)),
    signal,
  )
}

async function loadFontFace(family: string, source: string | URL | Blob) {
  const resolved = sourceUrl(source)
  try {
    const face = new FontFace(family, `url(${JSON.stringify(resolved.url)})`)
    await face.load()
    document.fonts.add(face)
  } finally {
    resolved.revoke?.()
  }
}

function addFont(fonts: Map<string, string>, typography: TextTypography) {
  if (!typography.fontAssetId) return
  const existing = fonts.get(typography.fontFamily)
  if (existing && existing !== typography.fontAssetId) {
    throw new Error(
      `Font family "${typography.fontFamily}" maps to both "${existing}" and "${typography.fontAssetId}".`,
    )
  }
  fonts.set(typography.fontFamily, typography.fontAssetId)
}

async function loadFonts(
  fonts: ReadonlyMap<string, string>,
  assets: AssetResolver,
  signal?: AbortSignal,
) {
  if (fonts.size === 0) return
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) {
    throw new Error("Template fonts require browser FontFace and document.fonts support.")
  }
  let cache = fontCaches.get(document.fonts)
  if (!cache) {
    cache = new SourcePromiseCache(32)
    fontCaches.set(document.fonts, cache)
  }
  const fontCache = cache
  await Promise.all(
    [...fonts].map(async ([family, id]) => {
      const source = assets.resolve(id)
      if (isDrawable(source)) {
        throw new Error(`Font asset "${id}" must resolve to a URL string, URL, or Blob.`)
      }
      await withAbort(
        fontCache.getOrCreate(source, family, () => loadFontFace(family, source)),
        signal,
      )
    }),
  )
}

export async function loadTemplateFonts(
  template: CardTemplate,
  assets: AssetResolver,
  signal?: AbortSignal,
) {
  const fonts = new Map<string, string>()
  walkLayers(template.layers, ({ layer }) => {
    if (!isTextLayer(layer)) return
    textTypographies(layer).forEach((typography) => addFont(fonts, typography))
  })
  await loadFonts(fonts, assets, signal)
}

export async function loadPresentationFonts(
  presentation: ResolvedCardPresentation,
  assets: AssetResolver,
  signal?: AbortSignal,
) {
  const fonts = new Map<string, string>()
  Object.values(presentation.text).forEach(({ typography }) => addFont(fonts, typography))
  await loadFonts(fonts, assets, signal)
}
