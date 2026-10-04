import { validateCardField } from "./card-fields.js"
import { createLayerIndex, validateLayer, walkLayerRecords } from "./layers.js"
import { assertCoverageRendersFirst, layerRenderOrder } from "./mask-coverage.js"
import { normalizeCardTemplateAuthoring } from "./normalization.js"
import { validatePresentationRules } from "./presentation-rules.js"
import {
  assertNoUnknownKeys,
  fail,
  isRecord,
  nonEmptyArray,
  nonEmptyString,
  optionalBoolean,
  positiveNumber,
  record,
} from "./primitives.js"
import { validateAutomaticWhen, validateSemanticBindings } from "./semantics.js"
import {
  textTypographyKeys,
  validateCompressionBudget,
  validateScaleXQuantifier,
  validateTypography,
} from "./typography.js"

import type { CardTemplate } from "../contracts/index.js"
import type { UnknownRecord } from "./primitives.js"

const currentCardTemplateSchemaVersion = 1
const cardTemplateKeys = [
  "cardFields",
  "dimensions",
  "fitProfileSets",
  "fonts",
  "layers",
  "masks",
  "presentationRules",
  "schemaVersion",
  "semanticBindings",
  "textDefaults",
  "typographyPresets",
]

function validateSchemaVersion(schemaVersion: unknown) {
  if (schemaVersion === undefined) fail("Malformed card template: schemaVersion is required.")
  if (schemaVersion !== currentCardTemplateSchemaVersion) {
    fail(
      `Unsupported card template schemaVersion ${JSON.stringify(schemaVersion)}; current version is ${currentCardTemplateSchemaVersion}. Migrate the template before using it.`,
    )
  }
}

function nonEmptyNamedEntries(value: unknown, location: string, noun: string) {
  return Object.entries(record(value, location)).map(([name, entry]) => {
    if (name.length === 0) fail(`${location} must not contain an empty ${noun}.`)
    return [name, entry] as const
  })
}

function validateAuthoringRegistries(template: UnknownRecord) {
  if (template["fonts"] !== undefined) {
    nonEmptyNamedEntries(template["fonts"], "fonts", "family name").forEach(([family, assetId]) =>
      nonEmptyString(assetId, `fonts.${family}`),
    )
  }
  if (template["textDefaults"] !== undefined) {
    const defaults = record(template["textDefaults"], "textDefaults")
    assertNoUnknownKeys(defaults, ["autoScaleXQuantifier", "maxAutoCompressionX"], "textDefaults")
    validateScaleXQuantifier(defaults["autoScaleXQuantifier"], "textDefaults.autoScaleXQuantifier")
    validateCompressionBudget(defaults["maxAutoCompressionX"], "textDefaults.maxAutoCompressionX")
  }
  if (template["fitProfileSets"] !== undefined) {
    nonEmptyNamedEntries(template["fitProfileSets"], "fitProfileSets", "name").forEach(
      ([name, fitProfiles]) =>
        validateTypography(
          { fill: "#000", fitProfiles, fontFamily: "validation", fontSize: 1 },
          `fitProfileSets.${name}`,
        ),
    )
  }
  if (template["typographyPresets"] !== undefined) {
    nonEmptyNamedEntries(template["typographyPresets"], "typographyPresets", "name").forEach(
      ([name, preset]) => {
        const location = `typographyPresets.${name}`
        const value = record(preset, location)
        if (Object.keys(value).length === 0) fail(`${location} must declare at least one property.`)
        assertNoUnknownKeys(value, textTypographyKeys, location)
      },
    )
  }
}

function validateCardFields(value: unknown) {
  if (!Array.isArray(value)) fail("cardFields must be an array.")
  if (value.length === 0) fail("cardFields must declare at least one field.")
  const names = new Set<string>()
  const fields = new Map(
    value.map((field, index) => [
      validateCardField(field, `cardFields[${index}]`, names).name,
      field as UnknownRecord,
    ]),
  )
  const nameKind = fields.get("name")?.["kind"] as string | undefined
  if (nameKind === undefined) fail('cardFields must declare the "name" field.')
  if (nameKind !== "text" && nameKind !== "multiline") {
    fail(`cardFields "name" must use kind "text" or "multiline"; received "${nameKind}".`)
  }
  return fields
}

function validateCanvasMasks(value: unknown): ReadonlyMap<string, string | undefined> {
  const masks = new Map<string, string | undefined>()
  nonEmptyArray(value, "masks").forEach((entry, index) => {
    const location = `masks[${index}]`
    const mask = record(entry, location)
    assertNoUnknownKeys(mask, ["assetId", "channel", "coverageLayerId", "id", "invert"], location)
    const id = nonEmptyString(mask["id"], `${location}.id`)
    if (masks.has(id)) fail(`masks contains duplicate ID "${id}".`)
    const coverageLayerId =
      mask["coverageLayerId"] === undefined
        ? undefined
        : nonEmptyString(mask["coverageLayerId"], `${location}.coverageLayerId`)
    masks.set(id, coverageLayerId)
    nonEmptyString(mask["assetId"], `${location}.assetId`)
    const channel = mask["channel"]
    if (channel !== undefined && channel !== "alpha" && channel !== "luminance") {
      fail(`${location}.channel must be "alpha" or "luminance".`)
    }
    optionalBoolean(mask["invert"], `${location}.invert`)
  })
  return masks
}

function hasCardDataConditions(layers: unknown, presentationRules: unknown) {
  let found = Array.isArray(presentationRules)
    ? presentationRules.some((rule) => isRecord(rule) && rule["when"] !== undefined)
    : presentationRules !== undefined
  walkLayerRecords(layers, (layer) => {
    const styles = layer["semanticStyles"]
    if (Array.isArray(styles)) {
      found ||= styles.some((style) => isRecord(style) && style["when"] !== undefined)
    } else if (styles !== undefined) found = true
  })
  return found
}

function collectArtworkTransformIds(layers: unknown) {
  const transformIds = new Set<string>()
  walkLayerRecords(layers, (layer) => {
    if (layer["kind"] !== "artwork") return
    const transformId = layer["transformId"] ?? layer["id"]
    if (typeof transformId === "string" && transformId.length > 0) transformIds.add(transformId)
  })
  return transformIds
}

function validateAutomaticFitLayers(
  fields: ReadonlyMap<string, UnknownRecord>,
  layers: readonly unknown[],
) {
  const textLayers = new Map<string, UnknownRecord>()
  walkLayerRecords(layers, (layer) => {
    if (layer["kind"] === "text" && typeof layer["id"] === "string") {
      textLayers.set(layer["id"], layer)
    }
  })
  ;[...fields.values()].forEach((field, index) => {
    const layerId = field["automaticFitLayer"] as string | undefined
    if (layerId === undefined) return
    const location = `cardFields[${index}].automaticFitLayer`
    const layer = textLayers.get(layerId)
    if (!layer) fail(`${location} references unknown text layer "${layerId}".`)
    if (layer["field"] !== field["name"]) {
      fail(`${location} must reference a text layer sourced from field "${String(field["name"])}".`)
    }
    const typography = record(layer["typography"], `Text layer "${layerId}" typography`)
    const styles = Array.isArray(layer["semanticStyles"]) ? layer["semanticStyles"] : []
    const hasProfiles =
      Array.isArray(typography["fitProfiles"]) ||
      styles.some(
        (style) =>
          isRecord(style) &&
          isRecord(style["typography"]) &&
          Array.isArray(style["typography"]["fitProfiles"]),
      )
    if (!hasProfiles) fail(`${location} must reference a text layer with fit profiles.`)
  })
}

export function validateCardTemplateShape(input: unknown): CardTemplate {
  const authoredTemplate = record(input, "Malformed card template: <root>")
  assertNoUnknownKeys(authoredTemplate, cardTemplateKeys, "Card template")
  validateSchemaVersion(authoredTemplate["schemaVersion"])
  validateAuthoringRegistries(authoredTemplate)
  const template = normalizeCardTemplateAuthoring(authoredTemplate)
  const dimensions = record(template["dimensions"], "Malformed card template: dimensions")
  assertNoUnknownKeys(dimensions, ["height", "width"], "dimensions")
  positiveNumber(dimensions["width"], "dimensions.width")
  positiveNumber(dimensions["height"], "dimensions.height")

  const fields = validateCardFields(template["cardFields"])
  const layers = template["layers"]
  if (!Array.isArray(layers)) fail("layers must be an array.")
  const canvasMasks =
    template["masks"] === undefined
      ? new Map<string, undefined>()
      : validateCanvasMasks(template["masks"])

  let semanticPaths = new Set<string>()
  if (template["semanticBindings"] !== undefined) {
    semanticPaths = validateSemanticBindings(template["semanticBindings"], fields)
  } else if (hasCardDataConditions(layers, template["presentationRules"])) {
    fail("semanticBindings is required when the template declares semantic presentation data.")
  }
  ;[...fields.values()].forEach((field, index) =>
    validateAutomaticWhen(
      field["automaticWhen"],
      `cardFields[${index}].automaticWhen`,
      semanticPaths,
    ),
  )

  const index = createLayerIndex()
  const transformIds = collectArtworkTransformIds(layers)
  const layerContext = { fields, index, semanticPaths, transformIds }
  layers.forEach((layer, layerIndex) => validateLayer(layer, `layers[${layerIndex}]`, layerContext))
  canvasMasks.forEach((coverageLayerId, maskId) => {
    if (coverageLayerId === undefined) return
    if (!index.ids.has(coverageLayerId)) {
      fail(`Canvas mask "${maskId}" references unknown coverage layer "${coverageLayerId}".`)
    }
    if (index.nonMaskable.has(coverageLayerId)) {
      fail(
        `Canvas mask "${maskId}" coverage layer "${coverageLayerId}" is not a raster-output layer.`,
      )
    }
  })
  validateAutomaticFitLayers(fields, layers)

  const presentationRules = template["presentationRules"]
  if (presentationRules !== undefined) {
    validatePresentationRules(presentationRules, {
      index,
      maskIds: new Set(canvasMasks.keys()),
      semanticPaths,
      transformIds,
    })
    const layerOrder = layerRenderOrder(index.ids)
    ;(presentationRules as readonly UnknownRecord[]).forEach((rule, ruleIndex) => {
      Object.entries((rule["maskSelections"] ?? {}) as UnknownRecord).forEach(([layerId, maskId]) =>
        assertCoverageRendersFirst(
          String(maskId),
          layerId,
          `presentationRules[${ruleIndex}].maskSelections`,
          canvasMasks,
          layerOrder,
        ),
      )
    })
  }
  return template as unknown as CardTemplate
}
