import { mergeTextTypography, walkLayers } from "./rendering/layer-tree.js"
import { matchesSemanticCondition } from "./semantics.js"
import { validatePresentationOverrides } from "./validation.js"

import type {
  ArtworkTransformOverrides,
  CanvasMask,
  CardSemantics,
  CardTemplate,
  LayerMaskOverrides,
  PresentationOverrides,
  Region,
  ResolvedCardPresentation,
  ResolvedLayerMask,
  ResolvedTextPresentation,
  SemanticCondition,
  SemanticPresentationRule,
  SemanticTextStyle,
  TextLayer,
  TextPosition,
  TextTypography,
  TransformModeCondition,
} from "./contracts/index.js"

export function matchesPresentationGate(
  semantics: CardSemantics,
  transforms: ArtworkTransformOverrides,
  gate: {
    when?: SemanticCondition | undefined
    whenTransforms?: TransformModeCondition | undefined
  },
) {
  if (gate.when && !matchesSemanticCondition(semantics, gate.when)) return false
  if (!gate.whenTransforms) return true
  return Object.entries(gate.whenTransforms).every(
    ([transformId, mode]) => (transforms[transformId]?.mode ?? null) === mode,
  )
}

function matchingPresentationRules(
  template: CardTemplate,
  semantics: CardSemantics,
  transforms: ArtworkTransformOverrides,
): readonly SemanticPresentationRule[] {
  return (
    template.presentationRules?.filter((rule) =>
      matchesPresentationGate(semantics, transforms, rule),
    ) ?? []
  )
}

function resolveRuleEntries<T>(
  rules: readonly SemanticPresentationRule[],
  select: (rule: SemanticPresentationRule) => Readonly<Record<string, T>> | undefined,
  describeConflict: (key: string) => string,
  equals: (left: T, right: T) => boolean = Object.is,
) {
  const values: Record<string, T> = {}
  const owners: Record<string, string> = {}
  rules.forEach((rule) => {
    Object.entries(select(rule) ?? {}).forEach(([key, value]) => {
      const previous = values[key]
      if (previous !== undefined && !equals(previous, value)) {
        throw new Error(
          `Semantic presentation rules "${owners[key]}" and "${rule.id}" ${describeConflict(key)}.`,
        )
      }
      values[key] = value
      owners[key] = rule.id
    })
  })
  return values
}

function resolveRuleValues<T extends boolean | string>(
  rules: readonly SemanticPresentationRule[],
  select: (rule: SemanticPresentationRule) => Readonly<Record<string, T>> | undefined,
  subject: string,
) {
  return resolveRuleEntries(rules, select, (key) => `resolve ${subject} "${key}" differently`)
}

function resolveLayerOptions(rules: readonly SemanticPresentationRule[]) {
  const values: Record<string, Record<string, unknown>> = {}
  const owners: Record<string, string> = {}
  rules.forEach((rule) => {
    Object.entries(rule.layerOptions ?? {}).forEach(([layerId, patch]) => {
      if (!patch) return
      const resolved = values[layerId] ?? {}
      Object.entries(patch).forEach(([key, value]) => {
        const optionPath = `${layerId}.${key}`
        if (Object.hasOwn(resolved, key) && !Object.is(resolved[key], value)) {
          throw new Error(
            `Semantic presentation rules "${owners[optionPath]}" and "${rule.id}" resolve layer option "${optionPath}" differently.`,
          )
        }
        resolved[key] = value
        owners[optionPath] = rule.id
      })
      values[layerId] = resolved
    })
  })
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([layerId, options]) => [layerId, Object.freeze(options)]),
    ),
  )
}

function resolveTextPositions(rules: readonly SemanticPresentationRule[]) {
  const positions = resolveRuleEntries<TextPosition>(
    rules,
    (rule) => rule.textPositions,
    (layerId) => `resolve text layer "${layerId}" to different positions`,
    (left, right) => left.x === right.x && left.y === right.y,
  )
  return Object.fromEntries(
    Object.entries(positions).map(([layerId, { x, y }]) => [layerId, Object.freeze({ x, y })]),
  )
}

function resolveLayerRegions(rules: readonly SemanticPresentationRule[]) {
  const regions = resolveRuleEntries<Region>(
    rules,
    (rule) => rule.layerRegions,
    (layerId) => `resolve layer "${layerId}" to different regions`,
    (left, right) =>
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height,
  )
  return Object.freeze(
    Object.fromEntries(
      Object.entries(regions).map(([layerId, { height, width, x, y }]) => [
        layerId,
        Object.freeze({ height, width, x, y }),
      ]),
    ),
  )
}

function resolveLayerMasks(
  template: CardTemplate,
  rules: readonly SemanticPresentationRule[],
  overrides?: PresentationOverrides,
): Readonly<Record<string, ResolvedLayerMask>> {
  const selected = resolveRuleValues(rules, (rule) => rule.maskSelections, "layer mask")
  const layerIds = new Set<string>()
  walkLayers(template.layers, ({ layer }) => layerIds.add(layer.id))

  const selections: Record<string, string> = { ...selected }
  const overrideSelections: LayerMaskOverrides | undefined = overrides?.layerMasks
  Object.entries(overrideSelections ?? {}).forEach(([layerId, maskId]) => {
    if (!layerIds.has(layerId)) {
      throw new Error(`Presentation mask override references unknown layer "${layerId}".`)
    }
    if (maskId === undefined) return
    if (maskId === null) {
      delete selections[layerId]
    } else {
      selections[layerId] = maskId
    }
  })

  const masksById = new Map<string, CanvasMask>(
    (template.masks ?? []).map((mask) => [mask.id, mask]),
  )
  const resolved: Record<string, ResolvedLayerMask> = {}
  Object.entries(selections).forEach(([layerId, maskId]) => {
    const mask = masksById.get(maskId)
    if (!mask) {
      throw new Error(`Layer "${layerId}" references unknown canvas mask "${maskId}".`)
    }
    resolved[layerId] = Object.freeze({
      assetId: mask.assetId,
      channel: mask.channel ?? "luminance",
      ...(mask.coverageLayerId ? { coverageLayerId: mask.coverageLayerId } : {}),
      id: mask.id,
      invert: mask.invert ?? false,
    })
  })
  return Object.freeze(resolved)
}

function activeStyle(
  layer: TextLayer,
  semantics: CardSemantics,
  transforms: ArtworkTransformOverrides,
): SemanticTextStyle | undefined {
  const matchesSemantics = layer.semanticStyles?.filter((style) =>
    matchesPresentationGate(semantics, transforms, style),
  )
  if (!matchesSemantics || matchesSemantics.length === 0) return undefined
  if (matchesSemantics.length > 1) {
    throw new Error(
      `Text layer "${layer.id}" has multiple semantic styles matching the current card.`,
    )
  }
  return matchesSemantics[0]
}

function fitProfileOverride(
  layer: TextLayer,
  styleId: string,
  typography: TextTypography,
  overrides?: PresentationOverrides,
) {
  const profileId = overrides?.textFitProfiles?.[layer.id]?.[styleId]
  if (!profileId) return undefined
  if (!typography.fitProfiles?.some((profile) => profile.id === profileId)) {
    throw new Error(
      `Text layer "${layer.id}" style "${styleId}" requested unknown fit profile "${profileId}".`,
    )
  }
  return profileId
}

export function resolveCardPresentation(
  template: CardTemplate,
  semantics: CardSemantics,
  overrides?: PresentationOverrides,
): ResolvedCardPresentation {
  const validatedOverrides = overrides
    ? validatePresentationOverrides(overrides, template)
    : undefined
  // Rules may read transform modes but never assign them, so this cannot form a cycle.
  const artworkTransforms = Object.freeze({ ...(validatedOverrides?.artworkTransforms ?? {}) })
  const rules = matchingPresentationRules(template, semantics, artworkTransforms)
  const text: Record<string, ResolvedTextPresentation> = {}
  const layerRegions = resolveLayerRegions(rules)
  const textPositions = resolveTextPositions(rules)
  const textValues = resolveRuleValues(rules, (rule) => rule.textValues, "text value")
  const layerOptions = resolveLayerOptions(rules)
  walkLayers(template.layers, ({ layer }) => {
    if (layer.kind !== "text") return
    const textLayer = layer as TextLayer
    const style = activeStyle(textLayer, semantics, artworkTransforms)
    const styleId = style?.id ?? "default"
    const typography = mergeTextTypography(
      textLayer.typography,
      style?.typography,
      validatedOverrides?.textTypography?.[layer.id]?.[styleId],
    )
    const position = textPositions[layer.id] ?? textLayer.position
    text[layer.id] = Object.freeze({
      fitProfileId: fitProfileOverride(textLayer, styleId, typography, validatedOverrides),
      layerId: layer.id,
      position: Object.freeze({ x: position.x, y: position.y }),
      value:
        textValues[layer.id] ??
        (textLayer.semanticPath ? semantics.values[textLayer.semanticPath] : undefined),
      styleId,
      styleLabel: style?.label ?? textLayer.label ?? layer.id,
      typography,
    })
  })
  const layerVisibility = resolveRuleValues(
    rules,
    (rule) => rule.layerVisibility,
    "layer visibility",
  )
  const assetSelections = resolveRuleValues(
    rules,
    (rule) => rule.assetSelections,
    "asset selection",
  )
  const layerMasks = resolveLayerMasks(template, rules, validatedOverrides)
  const presets = resolveRuleValues(rules, (rule) => rule.presets, "preset target")
  return Object.freeze({
    assetSelections: Object.freeze(assetSelections),
    artworkTransforms,
    layerRegions,
    layerMasks,
    layerOptions,
    layerVisibility: Object.freeze(layerVisibility),
    presets: Object.freeze(presets),
    semantics,
    text: Object.freeze(text),
  })
}
