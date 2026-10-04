import { mergeTextTypography } from "../rendering/layer-tree.js"

import {
  assertNoUnknownKeys,
  fail,
  finiteNumber,
  nonEmptyString,
  optionalMember,
  optionalString,
  positiveInteger,
  positiveNumber,
  record,
} from "./primitives.js"

import type { TextTypography } from "../contracts/index.js"
import type { UnknownRecord } from "./primitives.js"

export const textTypographyKeys = new Set([
  "autoScaleXQuantifier",
  "fill",
  "stroke",
  "fit",
  "fitBlocks",
  "fitProfileOverrides",
  "fitProfileSet",
  "fitProfiles",
  "fontAssetId",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "maxAutoCompressionX",
  "maxHeight",
  "maxWidth",
  "minFontSize",
  "textAlign",
  "textAnchor",
  "verticalAnchor",
  "wrap",
])
const fitProfileKeys = ["fontSize", "id", "label", "lineHeight", "maxAutoCompressionX", "maxLines"]
const textAnchors = new Set(["start", "middle", "end"])
const textAlignments = new Set(["justify"])
const verticalTextAnchors = new Set(["baseline", "top"])
const textFits = new Set(["font-size", "scale-x"])
const textWraps = new Set(["word"])
const fontWeightKeywords = ["normal", "bold", "bolder", "lighter"]
const textStrokeAlignments = new Set(["center", "outer"])
const textStrokeLinejoins = new Set(["bevel", "miter", "round"])

export function validateScaleXQuantifier(value: unknown, location: string) {
  if (value === undefined) return
  if (positiveNumber(value, location) > 1) fail(`${location} must not exceed 1.`)
}

export function validateCompressionBudget(value: unknown, location: string) {
  if (value === undefined) return
  const maximum = finiteNumber(value, location)
  if (maximum < 0 || maximum >= 1) fail(`${location} must be at least 0 and less than 1.`)
}

function validateFitBlocks(value: unknown, location: string) {
  const blocks = record(value, location)
  assertNoUnknownKeys(blocks, ["leading", "remainder", "split"], location)
  if (blocks["split"] !== "leading-authored-line") fail(`${location}.split is unsupported.`)
  const leading = record(blocks["leading"], `${location}.leading`)
  assertNoUnknownKeys(leading, ["mode", "preferredMaxLines"], `${location}.leading`)
  if (leading["mode"] !== "prefer-lines") fail(`${location}.leading.mode is unsupported.`)
  positiveInteger(leading["preferredMaxLines"], `${location}.leading.preferredMaxLines`)
  const remainder = record(blocks["remainder"], `${location}.remainder`)
  assertNoUnknownKeys(remainder, ["mode"], `${location}.remainder`)
  if (remainder["mode"] !== "layer-fit") fail(`${location}.remainder.mode is unsupported.`)
}

function validateFitProfiles(value: unknown, location: string) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${location} must be a non-empty array.`)
  }
  const ids = new Set<string>()
  let previousFontSize = Number.POSITIVE_INFINITY
  value.forEach((entry, index) => {
    const profileLocation = `${location}[${index}]`
    const profile = record(entry, profileLocation)
    assertNoUnknownKeys(profile, fitProfileKeys, profileLocation)
    const id = nonEmptyString(profile["id"], `${profileLocation}.id`)
    if (ids.has(id)) fail(`${location} contains duplicate ID "${id}".`)
    ids.add(id)
    nonEmptyString(profile["label"], `${profileLocation}.label`)
    const fontSize = positiveNumber(profile["fontSize"], `${profileLocation}.fontSize`)
    if (fontSize > previousFontSize) {
      fail(`${location} must be ordered from largest font size to smallest.`)
    }
    previousFontSize = fontSize
    if (profile["lineHeight"] !== undefined) {
      positiveNumber(profile["lineHeight"], `${profileLocation}.lineHeight`)
    }
    validateCompressionBudget(
      profile["maxAutoCompressionX"],
      `${profileLocation}.maxAutoCompressionX`,
    )
    if (profile["maxLines"] !== undefined) {
      positiveInteger(profile["maxLines"], `${profileLocation}.maxLines`)
    }
  })
}

function validateFontWeight(value: unknown, location: string) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value > 1000) {
      fail(`${location} must be between 1 and 1000.`)
    }
  } else if (typeof value === "string") {
    if (!fontWeightKeywords.includes(value)) fail(`${location} uses an unsupported keyword.`)
  } else if (value !== undefined) {
    fail(`${location} must be text or a number.`)
  }
}

function validateTextStroke(value: unknown, location: string) {
  const stroke = record(value, location)
  assertNoUnknownKeys(stroke, ["align", "color", "linejoin", "opacity", "width"], location)
  nonEmptyString(stroke["color"], `${location}.color`)
  positiveNumber(stroke["width"], `${location}.width`)
  optionalMember(
    stroke["align"],
    textStrokeAlignments,
    `${location}.align`,
    'must be "center" or "outer".',
  )
  optionalMember(
    stroke["linejoin"],
    textStrokeLinejoins,
    `${location}.linejoin`,
    'must be "bevel", "miter", or "round".',
  )
  if (stroke["opacity"] !== undefined) {
    const opacity = finiteNumber(stroke["opacity"], `${location}.opacity`)
    if (opacity < 0 || opacity > 1) fail(`${location}.opacity must be between 0 and 1.`)
  }
}

export function validateTypography(value: unknown, location: string) {
  const typography = record(value, location)
  assertNoUnknownKeys(typography, textTypographyKeys, location)
  nonEmptyString(typography["fill"], `${location}.fill`)
  if (typography["stroke"] !== undefined) {
    validateTextStroke(typography["stroke"], `${location}.stroke`)
  }
  nonEmptyString(typography["fontFamily"], `${location}.fontFamily`)
  optionalMember(typography["fit"], textFits, `${location}.fit`)
  optionalMember(typography["wrap"], textWraps, `${location}.wrap`)
  const fontSize = positiveNumber(typography["fontSize"], `${location}.fontSize`)
  validateScaleXQuantifier(typography["autoScaleXQuantifier"], `${location}.autoScaleXQuantifier`)
  validateCompressionBudget(typography["maxAutoCompressionX"], `${location}.maxAutoCompressionX`)
  if (typography["fitBlocks"] !== undefined) {
    validateFitBlocks(typography["fitBlocks"], `${location}.fitBlocks`)
  }
  optionalString(typography["fontAssetId"], `${location}.fontAssetId`)
  if (typography["letterSpacing"] !== undefined) {
    finiteNumber(typography["letterSpacing"], `${location}.letterSpacing`)
  }
  for (const key of ["lineHeight", "maxHeight", "maxWidth"]) {
    if (typography[key] !== undefined) positiveNumber(typography[key], `${location}.${key}`)
  }
  if (typography["minFontSize"] !== undefined) {
    const minimum = positiveNumber(typography["minFontSize"], `${location}.minFontSize`)
    if (minimum > fontSize) fail(`${location}.minFontSize must not exceed fontSize.`)
  }
  if (typography["fitProfiles"] !== undefined) {
    validateFitProfiles(typography["fitProfiles"], `${location}.fitProfiles`)
  }
  validateFontWeight(typography["fontWeight"], `${location}.fontWeight`)
  const fontStyle = typography["fontStyle"]
  if (fontStyle !== undefined && fontStyle !== "normal" && fontStyle !== "italic") {
    fail(`${location}.fontStyle is unsupported.`)
  }
  optionalMember(typography["textAnchor"], textAnchors, `${location}.textAnchor`)
  optionalMember(typography["textAlign"], textAlignments, `${location}.textAlign`)
  optionalMember(typography["verticalAnchor"], verticalTextAnchors, `${location}.verticalAnchor`)
}

export function validateTextTypographyUsage(
  typography: UnknownRecord,
  format: unknown,
  location: string,
) {
  const isLines = format === "lines"
  const isWrapped = typography["wrap"] !== undefined
  const isScaleX = typography["fit"] === "scale-x"
  const hasMaxWidth = typography["maxWidth"] !== undefined
  const hasProfiles = typography["fitProfiles"] !== undefined
  const isWordWrappedLines = isLines && typography["wrap"] === "word"

  if (typography["textAlign"] === "justify") {
    if (!isWordWrappedLines)
      fail(`${location}.textAlign "justify" requires multiline word wrapping.`)
    if (!hasMaxWidth) fail(`${location}.textAlign "justify" requires maxWidth.`)
  }
  if (isScaleX && isLines) fail(`${location}.fit "scale-x" is unsupported for multiline text.`)
  if (isScaleX && typography["minFontSize"] !== undefined) {
    fail(`${location}.minFontSize cannot be used with fit "scale-x".`)
  }
  if (isWrapped && !isLines) fail(`${location}.wrap requires format "lines".`)
  if (isWrapped && !hasMaxWidth) fail(`${location}.wrap requires maxWidth.`)
  if (isWrapped && isScaleX) fail(`${location}.wrap cannot be used with fit "scale-x".`)
  if (hasProfiles) {
    const isSingleLineList = format === "type-list" && !isWrapped
    if (!isWordWrappedLines && !isSingleLineList) {
      fail(`${location}.fitProfiles requires multiline word wrapping or a type-list text layer.`)
    }
    if (!hasMaxWidth) fail(`${location}.fitProfiles requires maxWidth.`)
    if (isWordWrappedLines && isScaleX) {
      fail(`${location}.fitProfiles cannot be combined with scale-x fitting for multiline text.`)
    }
    if (typography["minFontSize"] !== undefined) {
      fail(`${location}.fitProfiles cannot be combined with minFontSize fitting.`)
    }
  }
  if (typography["fitBlocks"] !== undefined) {
    if (!isWordWrappedLines) fail(`${location}.fitBlocks requires multiline word wrapping.`)
    if (!hasProfiles) fail(`${location}.fitBlocks requires fitProfiles.`)
  }
  for (const key of ["autoScaleXQuantifier", "maxAutoCompressionX"]) {
    if (typography[key] !== undefined && !hasProfiles) {
      fail(`${location}.${key} requires fitProfiles.`)
    }
  }
}

export function validateTypographyPatch(
  value: unknown,
  baseTypography: TextTypography,
  format: unknown,
  location: string,
) {
  const patch = record(value, location)
  if (Object.keys(patch).length === 0) {
    fail(`${location} must declare at least one typography override.`)
  }
  assertNoUnknownKeys(patch, textTypographyKeys, location)
  if (patch["fitProfileSet"] !== undefined) {
    fail(`${location}.fitProfileSet is only available in template source typography.`)
  }
  const merged = record(mergeTextTypography(baseTypography, patch), location)
  validateTypography(merged, location)
  validateTextTypographyUsage(merged, format, location)
}
