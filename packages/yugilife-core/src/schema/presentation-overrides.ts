import { mergeTextTypography, walkLayers } from "../rendering/layer-tree.js"

import { assertCoverageRendersFirst, layerRenderOrder } from "./mask-coverage.js"
import {
  assertNoUnknownKeys,
  fail,
  finiteNumber,
  nonEmptyString,
  optionalString,
  record,
} from "./primitives.js"
import { validateTypographyPatch } from "./typography.js"

import type {
  ArtworkLayer,
  CardTemplate,
  PresentationOverrides,
  TextLayer,
} from "../contracts/index.js"

function templateLayers(template: CardTemplate) {
  const layerIds = new Set<string>()
  const nonMaskableLayerIds = new Set<string>()
  const textLayers = new Map<string, TextLayer>()
  const transformIds = new Set<string>()
  walkLayers(template.layers, ({ layer }) => {
    layerIds.add(layer.id)
    if (layer.kind === "text") textLayers.set(layer.id, layer as TextLayer)
    if (layer.kind === "text" || layer.kind === "svg") nonMaskableLayerIds.add(layer.id)
    if (layer.kind === "artwork") {
      const artwork = layer as ArtworkLayer
      transformIds.add(artwork.transformId ?? artwork.id)
    }
  })
  return { layerIds, nonMaskableLayerIds, textLayers, transformIds }
}

function typographyForStyle(layer: TextLayer, styleId: string, location: string) {
  if (styleId === "default") return layer.typography
  const style = layer.semanticStyles?.find((candidate) => candidate.id === styleId)
  if (!style) fail(`${location} references unknown semantic style "${styleId}".`)
  return mergeTextTypography(layer.typography, style.typography)
}

function validateArtworkTransforms(value: unknown, transformIds: ReadonlySet<string>) {
  Object.entries(record(value, "artworkTransforms")).forEach(([id, entry]) => {
    const location = `artworkTransforms.${id}`
    if (!transformIds.has(id)) fail(`artworkTransforms references unknown transform "${id}".`)
    const transform = record(entry, location)
    assertNoUnknownKeys(transform, ["mode", "scale", "x", "y"], location)
    const scale = finiteNumber(transform["scale"], `${location}.scale`)
    const x = finiteNumber(transform["x"], `${location}.x`)
    const y = finiteNumber(transform["y"], `${location}.y`)
    optionalString(transform["mode"], `${location}.mode`)
    if (scale < 1 || scale > 8) fail(`${location}.scale must be between 1 and 8.`)
    if (x < -2 || x > 2 || y < -2 || y > 2) fail(`${location} pan values must be between -2 and 2.`)
  })
}

function forEachTextLayerStyle(
  value: unknown,
  key: string,
  textLayers: ReadonlyMap<string, TextLayer>,
  visit: (layer: TextLayer, styleId: string, entry: unknown, location: string) => void,
) {
  Object.entries(record(value, key)).forEach(([layerId, styles]) => {
    const layer = textLayers.get(layerId)
    if (!layer) fail(`${key} references unknown text layer "${layerId}".`)
    Object.entries(record(styles, `${key}.${layerId}`)).forEach(([styleId, entry]) =>
      visit(layer, styleId, entry, `${key}.${layerId}.${styleId}`),
    )
  })
}

export function validatePresentationOverridesShape(
  input: unknown,
  template: CardTemplate,
): PresentationOverrides {
  const overrides = record(input, "Presentation overrides")
  assertNoUnknownKeys(
    overrides,
    ["artworkTransforms", "layerMasks", "textFitProfiles", "textTypography"],
    "Presentation overrides",
  )
  const { layerIds, nonMaskableLayerIds, textLayers, transformIds } = templateLayers(template)

  if (overrides["artworkTransforms"] !== undefined) {
    validateArtworkTransforms(overrides["artworkTransforms"], transformIds)
  }
  if (overrides["textTypography"] !== undefined) {
    forEachTextLayerStyle(
      overrides["textTypography"],
      "textTypography",
      textLayers,
      (layer, styleId, patch, location) =>
        validateTypographyPatch(
          patch,
          typographyForStyle(layer, styleId, location),
          layer.format,
          location,
        ),
    )
  }
  if (overrides["textFitProfiles"] !== undefined) {
    forEachTextLayerStyle(
      overrides["textFitProfiles"],
      "textFitProfiles",
      textLayers,
      (layer, styleId, profileId, location) => {
        if (profileId === undefined) return
        const parsedProfileId = nonEmptyString(profileId, location)
        const typography = typographyForStyle(layer, styleId, location)
        if (!typography.fitProfiles?.some((profile) => profile.id === parsedProfileId)) {
          fail(`${location} references unknown fit profile "${parsedProfileId}".`)
        }
      },
    )
  }
  if (overrides["layerMasks"] !== undefined) {
    const maskIds = new Set(template.masks?.map((mask) => mask.id) ?? [])
    const coverageLayerIds = new Map(
      template.masks?.map((mask) => [mask.id, mask.coverageLayerId] as const) ?? [],
    )
    const layerOrder = layerRenderOrder(layerIds)
    Object.entries(record(overrides["layerMasks"], "layerMasks")).forEach(([layerId, maskId]) => {
      if (!layerIds.has(layerId)) fail(`layerMasks references unknown layer "${layerId}".`)
      if (nonMaskableLayerIds.has(layerId)) {
        fail(`layerMasks cannot assign a mask to non-raster layer "${layerId}".`)
      }
      if (maskId === null || maskId === undefined) return
      if (typeof maskId !== "string" || !maskId) {
        fail(`layerMasks.${layerId} must be a non-empty string or null.`)
      }
      if (!maskIds.has(maskId)) fail(`layerMasks.${layerId} references unknown mask "${maskId}".`)
      assertCoverageRendersFirst(maskId, layerId, "layerMasks", coverageLayerIds, layerOrder)
    })
  }
  return overrides
}
