import {
  assertNoUnknownKeys,
  fail,
  finiteNumber,
  isRecord,
  nonEmptyArray,
  nonEmptyString,
  optionalBoolean,
  optionalString,
  point,
  record,
  region,
} from "./primitives.js"
import { validateSemanticCondition, validateTransformModeGate } from "./semantics.js"
import { validateSvgElementShape } from "./svg.js"
import {
  validateTextTypographyUsage,
  validateTypography,
  validateTypographyPatch,
} from "./typography.js"

import type { TextTypography } from "../contracts/index.js"
import type { UnknownRecord } from "./primitives.js"

const layerBaseKeys = ["defaultVisible", "editorVisible", "group", "id", "kind", "label"]
const coreLayerKeys: Readonly<Record<string, ReadonlySet<string>>> = {
  artwork: new Set([
    ...layerBaseKeys,
    "field",
    "fit",
    "maskField",
    "maskChannel",
    "placementRegion",
    "region",
    "transformId",
    "transformMode",
  ]),
  canvas: new Set([...layerBaseKeys, "options", "region", "renderer"]),
  group: new Set([...layerBaseKeys, "layers"]),
  image: new Set([...layerBaseKeys, "assetId", "region"]),
  raster: new Set([
    ...layerBaseKeys,
    "assetId",
    "defaultPreset",
    "options",
    "presetTarget",
    "region",
    "renderer",
    "sourceRegion",
  ]),
  "repeated-image": new Set([...layerBaseKeys, "assetId", "field", "offset", "region"]),
  svg: new Set([...layerBaseKeys, "element"]),
  text: new Set([
    ...layerBaseKeys,
    "fallbackField",
    "field",
    "format",
    "pairIndex",
    "position",
    "prefix",
    "semanticPath",
    "semanticStyles",
    "separator",
    "suffix",
    "typography",
  ]),
}
const regionKinds = new Set(["artwork", "canvas", "image", "raster", "repeated-image"])
const assetKinds = new Set(["image", "repeated-image", "raster"])
const textFormats = new Set(["plain", "lines", "pair", "type-list"])

export interface LayerIndex {
  readonly ids: Set<string>
  readonly text: Set<string>
  readonly asset: Set<string>
  readonly options: Set<string>
  readonly nonMaskable: Set<string>
  readonly region: Set<string>
}

export function createLayerIndex(): LayerIndex {
  return {
    ids: new Set(),
    text: new Set(),
    asset: new Set(),
    options: new Set(),
    nonMaskable: new Set(),
    region: new Set(),
  }
}

export interface LayerValidationContext {
  readonly fields: ReadonlyMap<string, UnknownRecord>
  readonly semanticPaths: ReadonlySet<string>
  readonly transformIds: ReadonlySet<string>
  readonly index: LayerIndex
}

function indexLayer(index: LayerIndex, id: string, kind: string, location: string) {
  if (index.ids.has(id)) fail(`Duplicate layer ID "${id}" at ${location}.`)
  index.ids.add(id)
  if (kind === "text") index.text.add(id)
  if (assetKinds.has(kind)) index.asset.add(id)
  if (regionKinds.has(kind)) index.region.add(id)
  if (kind === "raster" || kind === "canvas") index.options.add(id)
  if (kind === "text" || kind === "svg") index.nonMaskable.add(id)
}

function referencedField(
  name: unknown,
  location: string,
  context: LayerValidationContext,
  isAccepted: (kind: unknown) => boolean,
  requirement: string,
) {
  const fieldName = nonEmptyString(name, location)
  const field = context.fields.get(fieldName)
  if (!field) {
    fail(`${location} references card field "${fieldName}", which the template does not declare.`)
  }
  if (!isAccepted(field["kind"])) fail(`${location} must reference ${requirement}.`)
  return field
}

const isKind = (expected: string) => (kind: unknown) => kind === expected
const isTextSerializable = (kind: unknown) => kind !== "image"

function validateArtworkLayer(
  layer: UnknownRecord,
  location: string,
  context: LayerValidationContext,
) {
  referencedField(layer["field"], `${location}.field`, context, isKind("image"), "an image field")
  const fit = layer["fit"]
  if (fit !== undefined && fit !== "stretch" && fit !== "width") {
    fail(`${location}.fit must be "stretch" or "width".`)
  }
  if (layer["maskField"] !== undefined) {
    referencedField(
      layer["maskField"],
      `${location}.maskField`,
      context,
      isKind("image"),
      "an image field",
    )
  }
  const channel = layer["maskChannel"]
  if (channel !== undefined && channel !== "alpha" && channel !== "luminance") {
    fail(`${location}.maskChannel must be "alpha" or "luminance".`)
  }
  if (layer["placementRegion"] !== undefined) {
    region(layer["placementRegion"], `${location}.placementRegion`)
  }
  optionalString(layer["transformId"], `${location}.transformId`)
  optionalString(layer["transformMode"], `${location}.transformMode`)
}

function validateSemanticStyles(
  value: unknown,
  typography: UnknownRecord,
  format: unknown,
  location: string,
  context: LayerValidationContext,
) {
  const styleIds = new Set<string>()
  nonEmptyArray(value, `${location}.semanticStyles`).forEach((entry, index) => {
    const styleLocation = `${location}.semanticStyles[${index}]`
    const style = record(entry, styleLocation)
    assertNoUnknownKeys(
      style,
      ["id", "label", "typography", "when", "whenTransforms"],
      styleLocation,
    )
    const styleId = nonEmptyString(style["id"], `${styleLocation}.id`)
    if (styleIds.has(styleId)) {
      fail(`${location}.semanticStyles contains duplicate ID "${styleId}".`)
    }
    styleIds.add(styleId)
    nonEmptyString(style["label"], `${styleLocation}.label`)
    validatePresentationGate(style, styleLocation, context)
    validateTypographyPatch(
      style["typography"],
      typography as unknown as TextTypography,
      format,
      `${styleLocation}.typography`,
    )
  })
}

export function validatePresentationGate(
  gated: UnknownRecord,
  location: string,
  context: Pick<LayerValidationContext, "semanticPaths" | "transformIds">,
) {
  if (gated["when"] === undefined && gated["whenTransforms"] === undefined) {
    fail(`${location} must declare when or whenTransforms.`)
  }
  if (gated["when"] !== undefined) {
    validateSemanticCondition(gated["when"], `${location}.when`, context.semanticPaths)
  }
  if (gated["whenTransforms"] !== undefined) {
    validateTransformModeGate(
      gated["whenTransforms"],
      `${location}.whenTransforms`,
      context.transformIds,
    )
  }
}

function validateTextLayer(
  layer: UnknownRecord,
  location: string,
  context: LayerValidationContext,
) {
  const semanticPathValue = layer["semanticPath"]
  let sourceField: UnknownRecord | undefined
  if (layer["field"] !== undefined) {
    sourceField = referencedField(
      layer["field"],
      `${location}.field`,
      context,
      isTextSerializable,
      "a text-serializable field",
    )
  } else if (semanticPathValue === undefined) {
    fail(`${location} must declare field or semanticPath.`)
  }
  if (layer["fallbackField"] !== undefined) {
    referencedField(
      layer["fallbackField"],
      `${location}.fallbackField`,
      context,
      isTextSerializable,
      "a text-serializable field",
    )
  }
  optionalString(layer["prefix"], `${location}.prefix`)
  optionalString(layer["separator"], `${location}.separator`)
  optionalString(layer["suffix"], `${location}.suffix`)
  if (semanticPathValue !== undefined) {
    const semanticPath = nonEmptyString(semanticPathValue, `${location}.semanticPath`)
    if (!context.semanticPaths.has(semanticPath)) {
      fail(`${location}.semanticPath "${semanticPath}" must reference a declared semantic binding.`)
    }
  }
  const format = layer["format"]
  if (format !== undefined && (typeof format !== "string" || !textFormats.has(format))) {
    fail(`${location}.format is unsupported.`)
  }
  if (format === "pair" && sourceField?.["kind"] !== "number-pair") {
    fail(`${location}.format "pair" requires a number-pair field.`)
  }
  if (format === "type-list" && sourceField?.["kind"] !== "text-list") {
    fail(`${location}.format "type-list" requires a text-list field.`)
  }
  const pairIndex = layer["pairIndex"]
  if (pairIndex !== undefined) {
    if (format !== "pair") fail(`${location}.pairIndex requires format "pair".`)
    if (pairIndex !== 0 && pairIndex !== 1) fail(`${location}.pairIndex must be 0 or 1.`)
  }
  point(layer["position"], `${location}.position`)
  validateTypography(layer["typography"], `${location}.typography`)
  const typography = record(layer["typography"], `${location}.typography`)
  validateTextTypographyUsage(typography, format, `${location}.typography`)
  if (layer["semanticStyles"] !== undefined) {
    validateSemanticStyles(layer["semanticStyles"], typography, format, location, context)
  }
}

export function validateLayer(value: unknown, location: string, context: LayerValidationContext) {
  const layer = record(value, location)
  const id = nonEmptyString(layer["id"], `${location}.id`)
  const kind = nonEmptyString(layer["kind"], `${location}.kind`)
  const allowedKeys = Object.hasOwn(coreLayerKeys, kind) ? coreLayerKeys[kind] : undefined
  if (allowedKeys) assertNoUnknownKeys(layer, allowedKeys, location)
  optionalString(layer["label"], `${location}.label`)
  optionalString(layer["group"], `${location}.group`)
  optionalBoolean(layer["defaultVisible"], `${location}.defaultVisible`)
  optionalBoolean(layer["editorVisible"], `${location}.editorVisible`)
  indexLayer(context.index, id, kind, location)

  if (regionKinds.has(kind)) region(layer["region"], `${location}.region`)
  if (kind === "image" || kind === "repeated-image") {
    nonEmptyString(layer["assetId"], `${location}.assetId`)
  }
  switch (kind) {
    case "repeated-image": {
      referencedField(
        layer["field"],
        `${location}.field`,
        context,
        isKind("number"),
        "a number field",
      )
      const offset = record(layer["offset"], `${location}.offset`)
      assertNoUnknownKeys(offset, ["x", "y"], `${location}.offset`)
      finiteNumber(offset["x"], `${location}.offset.x`)
      finiteNumber(offset["y"], `${location}.offset.y`)
      break
    }
    case "artwork":
      validateArtworkLayer(layer, location, context)
      break
    case "raster":
    case "canvas":
      nonEmptyString(layer["renderer"], `${location}.renderer`)
      if (layer["options"] !== undefined) record(layer["options"], `${location}.options`)
      if (kind === "raster") {
        optionalString(layer["assetId"], `${location}.assetId`)
        optionalString(layer["defaultPreset"], `${location}.defaultPreset`)
        optionalString(layer["presetTarget"], `${location}.presetTarget`)
        if (layer["sourceRegion"] !== undefined) {
          region(layer["sourceRegion"], `${location}.sourceRegion`)
        }
      }
      break
    case "text":
      validateTextLayer(layer, location, context)
      break
    case "svg":
      validateSvgElementShape(layer["element"], `${location}.element`)
      break
    case "group": {
      const layers = layer["layers"]
      if (!Array.isArray(layers)) fail(`${location}.layers must be an array.`)
      layers.forEach((child, index) =>
        validateLayer(child, `${location}.layers[${index}]`, context),
      )
      break
    }
  }
}

export function walkLayerRecords(layers: unknown, visitor: (layer: UnknownRecord) => void): void {
  if (!Array.isArray(layers)) return
  layers.forEach((value) => {
    if (!isRecord(value)) return
    visitor(value)
    if (value["kind"] === "group") walkLayerRecords(value["layers"], visitor)
  })
}
