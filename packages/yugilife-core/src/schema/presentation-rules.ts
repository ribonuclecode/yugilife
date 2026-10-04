import { validatePresentationGate } from "./layers.js"
import {
  assertNoUnknownKeys,
  fail,
  finiteNumber,
  nonEmptyArray,
  nonEmptyRecord,
  nonEmptyString,
  record,
  region,
} from "./primitives.js"

import type { LayerIndex } from "./layers.js"
import type { UnknownRecord } from "./primitives.js"

export interface PresentationRuleContext {
  readonly index: LayerIndex
  readonly maskIds: ReadonlySet<string>
  readonly semanticPaths: ReadonlySet<string>
  readonly transformIds: ReadonlySet<string>
}

type SelectionValidator = (
  layerId: string,
  value: unknown,
  location: string,
  context: PresentationRuleContext,
) => void

const selectionValidators: Readonly<Record<string, SelectionValidator>> = {
  maskSelections(layerId, maskId, location, { index, maskIds }) {
    const parsedMaskId = nonEmptyString(maskId, `${location}.${layerId}`)
    if (!index.ids.has(layerId)) fail(`${location} references unknown layer "${layerId}".`)
    if (index.nonMaskable.has(layerId)) {
      fail(`${location} target "${layerId}" is not a raster-output layer.`)
    }
    if (!maskIds.has(parsedMaskId)) {
      fail(`${location}.${layerId} references unknown mask "${parsedMaskId}".`)
    }
  },
  assetSelections(layerId, assetId, location, { index }) {
    if (!index.asset.has(layerId)) {
      fail(`${location} references unknown asset-bearing layer "${layerId}".`)
    }
    nonEmptyString(assetId, `${location}.${layerId}`)
  },
  layerVisibility(layerId, visible, location, { index }) {
    if (!index.ids.has(layerId)) fail(`${location} references unknown layer "${layerId}".`)
    if (typeof visible !== "boolean") fail(`${location}.${layerId} must be a boolean.`)
  },
  layerRegions(layerId, selectedRegion, location, { index }) {
    if (!index.region.has(layerId)) fail(`${location} references non-region layer "${layerId}".`)
    region(selectedRegion, `${location}.${layerId}`)
  },
  layerOptions(layerId, patch, location, { index }) {
    if (!index.options.has(layerId)) {
      fail(`${location} references layer "${layerId}" without renderer options.`)
    }
    nonEmptyRecord(patch, `${location}.${layerId}`)
  },
  presets(target, preset, location) {
    if (target.length === 0) fail(`${location} contains an empty target.`)
    nonEmptyString(preset, `${location}.${target}`)
  },
  textPositions(layerId, position, location, { index }) {
    if (!index.text.has(layerId)) fail(`${location} references unknown text layer "${layerId}".`)
    const coordinates = record(position, `${location}.${layerId}`)
    finiteNumber(coordinates["x"], `${location}.${layerId}.x`)
    finiteNumber(coordinates["y"], `${location}.${layerId}.y`)
  },
  textValues(layerId, source, location, { index }) {
    if (!index.text.has(layerId)) fail(`${location} references unknown text layer "${layerId}".`)
    nonEmptyString(source, `${location}.${layerId}`)
  },
}
const selectionKeys = Object.keys(selectionValidators)
const ruleKeys = ["id", "when", "whenTransforms", ...selectionKeys]

function validateRule(rule: UnknownRecord, location: string, context: PresentationRuleContext) {
  validatePresentationGate(rule, location, context)
  if (selectionKeys.every((key) => rule[key] === undefined)) {
    fail(
      `${location} must declare assetSelections, layerOptions, layerRegions, layerVisibility, maskSelections, presets, textPositions, or textValues.`,
    )
  }
  for (const [key, validateSelection] of Object.entries(selectionValidators)) {
    if (rule[key] === undefined) continue
    const selectionLocation = `${location}.${key}`
    Object.entries(nonEmptyRecord(rule[key], selectionLocation)).forEach(([id, value]) =>
      validateSelection(id, value, selectionLocation, context),
    )
  }
}

export function validatePresentationRules(value: unknown, context: PresentationRuleContext) {
  const location = "presentationRules"
  const ids = new Set<string>()
  nonEmptyArray(value, location).forEach((entry, index) => {
    const ruleLocation = `${location}[${index}]`
    const rule = record(entry, ruleLocation)
    assertNoUnknownKeys(rule, ruleKeys, ruleLocation)
    const id = nonEmptyString(rule["id"], `${ruleLocation}.id`)
    if (ids.has(id)) fail(`${location} contains duplicate ID "${id}".`)
    ids.add(id)
    validateRule(rule, ruleLocation, context)
  })
}
