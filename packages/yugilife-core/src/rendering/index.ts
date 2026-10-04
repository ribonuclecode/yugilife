import { MapAssetResolver } from "../asset-resolver.js"
import { resolveCardPresentation } from "../presentation.js"
import { rasterizeCardSvgToImage } from "../raster-export.js"
import { deriveCardSemantics } from "../semantics.js"
import { assertSvgTextMode, serializeCardSvg } from "../svg-export.js"
import {
  validateCardData,
  validateCardTemplate,
  validateSvgElementDefinition,
} from "../validation.js"

import { loadPresentationFonts } from "./assets.js"
import { throwIfAborted } from "./async-resources.js"
import { applyCanvasMask } from "./canvas-masks.js"
import { createDefaultLayerRenderers } from "./default-renderers.js"
import { createLayerSourceFieldResolver } from "./layer-source-fields.js"
import { isLayerVisible } from "./layer-tree.js"
import { assertLayerTree, findRenderer, rendererKey } from "./layers.js"
import { createRenderManifest as buildRenderManifest } from "./render-manifest.js"
import { acquireScratchCanvas, releaseScratchCanvas } from "./scratch-canvas.js"
import { outlineSvgText } from "./text-outlines.js"

import type { CapturedRenderedElement } from "./render-manifest.js"

export { resolveRasterOutputDimensions } from "../raster-export.js"

import type {
  CardData,
  LayerDefinition,
  PngCardExportOptions,
  RasterCardExportOptions,
  RenderedCard,
  RenderLayerContext,
  RenderOptions,
  RenderSegment,
  ResolvedLayerMask,
  SvgCardExportOptions,
  SvgElementDefinition,
} from "../contracts/index.js"

export async function renderCard(card: CardData, options: RenderOptions): Promise<RenderedCard> {
  return await renderCardWithManifestCapture(card, options, false)
}

async function renderCardWithManifestCapture(
  card: CardData,
  options: RenderOptions,
  captureManifest: boolean,
): Promise<RenderedCard> {
  if (typeof document === "undefined") {
    throw new Error("renderCard requires a browser-compatible document and canvas implementation.")
  }
  throwIfAborted(options.signal)
  const template = validateCardTemplate(options.templateBundle.template)
  validateCardData(card, template)
  const semantics = deriveCardSemantics(card, template)
  const presentation = resolveCardPresentation(template, semantics, options.presentationOverrides)
  const assets = new MapAssetResolver(options.templateBundle.assets, options.assets)
  const colorPresets = options.templateBundle.colorPresets
  const renderers = { ...createDefaultLayerRenderers(), ...options.layerRenderers }
  assertLayerTree(
    template.layers,
    renderers,
    assets,
    presentation.assetSelections,
    presentation.layerMasks,
    template.masks,
  )
  await loadPresentationFonts(presentation, assets, options.signal)
  throwIfAborted(options.signal)

  // Segments and coverage surfaces outlive this render, so they never come from the scratch pool.
  // Only coverage is read back; `willReadFrequently` would force every other draw onto the CPU.
  function createRasterCanvas(readback = false) {
    const canvas = document.createElement("canvas")
    canvas.width = template.dimensions.width
    canvas.height = template.dimensions.height
    const context = canvas.getContext("2d", { willReadFrequently: readback })
    if (!context) throw new Error("A 2D canvas context is required to render a card.")
    return { canvas, context }
  }
  let raster = createRasterCanvas()
  let rasterDirty = false
  const renderSegments: RenderSegment[] = []
  const vectorLayers: SvgElementDefinition[] = []
  const richTextWarnings: RenderLayerContext["richTextWarnings"] = []
  const capturedElements: CapturedRenderedElement[] = []
  const layerAlphaCoverage = new Map<string, HTMLCanvasElement>()
  let captureOrder = 0
  const visibility = { ...presentation.layerVisibility, ...(options.layers ?? {}) }
  const presetOverrides = { ...presentation.presets, ...(options.presetOverrides ?? {}) }
  const sourceFieldsForLayer = captureManifest
    ? createLayerSourceFieldResolver(template, presentation)
    : undefined
  const coverageLayerIds = new Set(
    Object.values(presentation.layerMasks).flatMap((mask) =>
      mask.coverageLayerId ? [mask.coverageLayerId] : [],
    ),
  )

  function applyPresentationLayerOptions(layer: LayerDefinition): LayerDefinition {
    const patch = presentation.layerOptions[layer.id]
    if (!patch || (layer.kind !== "raster" && layer.kind !== "canvas")) return layer
    return {
      ...layer,
      options: { ...(layer.options ?? {}), ...patch },
    }
  }

  function applyPresentationLayerRegion(layer: LayerDefinition): LayerDefinition {
    const region = presentation.layerRegions[layer.id]
    if (!region || !("region" in layer)) return layer
    return { ...layer, region }
  }

  function appendVectorSegment(elements: readonly SvgElementDefinition[]) {
    if (elements.length === 0) return
    const previous = renderSegments.at(-1)
    if (previous?.kind === "vector") {
      renderSegments[renderSegments.length - 1] = Object.freeze({
        elements: Object.freeze([...previous.elements, ...elements]),
        kind: "vector" as const,
      })
    } else {
      renderSegments.push(
        Object.freeze({
          elements: Object.freeze([...elements]),
          kind: "vector" as const,
        }),
      )
    }
  }

  function flushRasterSegment(prepareNext = true) {
    if (!rasterDirty) return
    renderSegments.push(Object.freeze({ canvas: raster.canvas, kind: "raster" as const }))
    if (prepareNext) {
      raster = createRasterCanvas()
      renderContext.context = raster.context
    }
    rasterDirty = false
  }

  async function applyMask(canvas: HTMLCanvasElement, mask: ResolvedLayerMask) {
    const coverage = mask.coverageLayerId ? layerAlphaCoverage.get(mask.coverageLayerId) : undefined
    await applyCanvasMask(canvas, assets, mask, template.dimensions, coverage, options.signal)
  }

  function captureElement(
    layer: LayerDefinition,
    output: Pick<CapturedRenderedElement, "canvas" | "elements" | "kind">,
  ) {
    capturedElements.push({
      ...output,
      layerId: layer.id,
      order: captureOrder++,
      sourceFields: sourceFieldsForLayer?.(layer) ?? [],
    })
  }

  async function renderLayer(layer: LayerDefinition) {
    throwIfAborted(options.signal)
    const resolvedLayer = applyPresentationLayerOptions(applyPresentationLayerRegion(layer))
    if (!isLayerVisible(resolvedLayer, visibility)) return
    const renderer = findRenderer(renderers, rendererKey(resolvedLayer))
    if (!renderer) throw new Error(`Unknown renderer for layer "${resolvedLayer.id}".`)
    const mask = presentation.layerMasks[resolvedLayer.id]
    const maskedRasterGroup =
      mask && resolvedLayer.kind === "group" && renderer.output === "container"
    if (mask && renderer.output !== "raster" && !maskedRasterGroup) {
      throw new Error(
        `Canvas mask "${mask.id}" can only target raster-output layer "${resolvedLayer.id}".`,
      )
    }
    const vectorStart = vectorLayers.length
    const captureStart = capturedElements.length
    const previousCoverageContext = renderContext.coverageContext
    const layerCoverage =
      renderer.output === "raster" && (captureManifest || coverageLayerIds.has(resolvedLayer.id))
        ? createRasterCanvas(true)
        : undefined
    renderContext.coverageContext = layerCoverage?.context
    // A masked layer composes in isolation and is drawn back before this call returns.
    const isolation = mask
      ? {
          destination: renderContext.context,
          mask,
          scratch: acquireScratchCanvas(template.dimensions.width, template.dimensions.height),
        }
      : undefined
    if (isolation) renderContext.context = isolation.scratch.context
    try {
      let rendered: boolean | void
      try {
        rendered = await renderer.render(renderContext, resolvedLayer)
      } catch (error) {
        throwIfAborted(options.signal)
        throw error
      } finally {
        if (isolation) renderContext.context = isolation.destination
        renderContext.coverageContext = previousCoverageContext
      }
      const emittedVectors = vectorLayers.slice(vectorStart)
      if (renderer.output === "raster") {
        if (emittedVectors.length > 0) {
          throw new Error(
            `Raster renderer for layer "${layer.id}" emitted vector output. Split mixed output into separate ordered layers.`,
          )
        }
        if (rendered !== false) {
          if (isolation) {
            await applyMask(isolation.scratch.canvas, isolation.mask)
            if (layerCoverage) await applyMask(layerCoverage.canvas, isolation.mask)
            isolation.destination.drawImage(isolation.scratch.canvas, 0, 0)
          }
          if (layerCoverage && coverageLayerIds.has(resolvedLayer.id)) {
            layerAlphaCoverage.set(resolvedLayer.id, layerCoverage.canvas)
          }
          if (captureManifest && layerCoverage) {
            captureElement(layer, { canvas: layerCoverage.canvas, kind: "image" })
          }
          rasterDirty = true
        }
      } else if (renderer.output === "container") {
        if (isolation) {
          if (emittedVectors.length > 0) {
            throw new Error(
              `Masked container layer "${layer.id}" emitted vector output. Split mixed output into separate ordered layers.`,
            )
          }
          await applyMask(isolation.scratch.canvas, isolation.mask)
          isolation.destination.drawImage(isolation.scratch.canvas, 0, 0)
          for (const captured of captureManifest ? capturedElements.slice(captureStart) : []) {
            if (captured.canvas) await applyMask(captured.canvas, isolation.mask)
          }
          rasterDirty = true
        }
      } else if (emittedVectors.length > 0) {
        flushRasterSegment()
        appendVectorSegment(emittedVectors)
        if (captureManifest) {
          captureElement(layer, { elements: Object.freeze([...emittedVectors]), kind: "svg" })
        }
      }
      throwIfAborted(options.signal)
    } finally {
      if (isolation) releaseScratchCanvas(isolation.scratch)
    }
  }
  const renderContext: RenderLayerContext = {
    assets,
    assetSelections: presentation.assetSelections,
    card,
    colorPresets,
    context: raster.context,
    coverageContext: undefined,
    layerVisibility: visibility,
    preparedTextures: options.preparedTextures,
    presetOverrides,
    presentation,
    richTextWarnings,
    renderLayer,
    signal: options.signal,
    template,
    vectorLayers,
  }

  for (const layer of template.layers) await renderLayer(layer)
  flushRasterSegment(false)
  throwIfAborted(options.signal)
  vectorLayers.forEach((element, index) =>
    validateSvgElementDefinition(element, `Rendered vector layer ${index}`),
  )
  throwIfAborted(options.signal)
  const completedSegments = Object.freeze([...renderSegments])
  const completedVectorLayers = Object.freeze([...vectorLayers])
  const completedWarnings = Object.freeze([...richTextWarnings])
  let completedCaptures: readonly CapturedRenderedElement[] = Object.freeze([...capturedElements])

  const toOutlinedSegments: RenderedCard["toOutlinedSegments"] = async () => {
    const exportSegments: RenderSegment[] = []
    for (const segment of completedSegments) {
      if (segment.kind === "raster") {
        exportSegments.push(segment)
        continue
      }
      const elements = await outlineSvgText(
        segment.elements,
        template.dimensions,
        presentation,
        assets,
        options.signal,
      )
      exportSegments.push(
        Object.freeze({ elements: Object.freeze([...elements]), kind: "vector" as const }),
      )
    }
    throwIfAborted(options.signal)
    return Object.freeze(exportSegments)
  }

  const toSvg: RenderedCard["toSvg"] = async (exportOptions) => {
    const requestedMode: unknown = exportOptions?.textMode ?? "paths"
    assertSvgTextMode(requestedMode)
    if (requestedMode === "text") {
      return serializeCardSvg(template, completedSegments, {
        ...exportOptions,
        textMode: requestedMode,
      })
    }
    return serializeCardSvg(template, await toOutlinedSegments(), {
      ...exportOptions,
      textMode: requestedMode,
    })
  }

  async function toImage(exportOptions?: Parameters<RenderedCard["toImage"]>[0]) {
    const svg = await toSvg()
    throwIfAborted(options.signal)
    return await rasterizeCardSvgToImage(svg, template.dimensions, exportOptions, options.signal)
  }

  let renderManifestPromise: ReturnType<typeof buildRenderManifest> | undefined
  const createRenderManifest: RenderedCard["createRenderManifest"] = () => {
    renderManifestPromise ??= captureManifest
      ? buildRenderManifest(
          completedCaptures,
          template,
          async (elements) =>
            await outlineSvgText(
              elements,
              template.dimensions,
              presentation,
              assets,
              options.signal,
            ),
          options.signal,
        )
      : renderCardWithManifestCapture(card, options, true).then(
          async (capturedRender) => await capturedRender.createRenderManifest(),
        )
    void renderManifestPromise.then(
      () => {
        completedCaptures = Object.freeze([])
      },
      () => {},
    )
    return renderManifestPromise
  }

  return {
    createRenderManifest,
    presentation,
    renderSegments: completedSegments,
    warnings: completedWarnings,
    template,
    toImage,
    async toPng(exportOptions) {
      return await toImage({
        format: "png",
        ...(exportOptions?.scale === undefined ? {} : { size: { scale: exportOptions.scale } }),
      })
    },
    toOutlinedSegments,
    toSvg,
    vectorLayers: completedVectorLayers,
  }
}

export async function exportCardToImage(card: CardData, options: RasterCardExportOptions) {
  const { backgroundColor, format, quality, size, ...renderOptions } = options
  const rendered = await renderCard(card, renderOptions)
  return await rendered.toImage({ backgroundColor, format, quality, size })
}

export async function exportCardToPng(card: CardData, options: PngCardExportOptions) {
  const { scale, ...renderOptions } = options
  const rendered = await renderCard(card, renderOptions)
  return await rendered.toPng({ scale })
}

export async function exportCardToSvg(card: CardData, options: SvgCardExportOptions) {
  const { fontSmoothing, textMode, title, ...renderOptions } = options
  const resolvedTextMode: unknown = textMode ?? "paths"
  assertSvgTextMode(resolvedTextMode)
  const rendered = await renderCard(card, renderOptions)
  return await rendered.toSvg({ fontSmoothing, textMode: resolvedTextMode, title })
}
