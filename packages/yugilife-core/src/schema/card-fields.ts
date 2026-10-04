import { isAssetSource } from "../asset-source.js"
import { richTextLineLengths } from "../rich-text.js"

import {
  assertNoUnknownKeys,
  fail,
  finiteNumber,
  nonEmptyArray,
  nonEmptyString,
  optionalBoolean,
  positiveNumber,
  record,
  stringArray,
} from "./primitives.js"

import type { CardFieldDefinition, CardFieldValue } from "../contracts/index.js"
import type { UnknownRecord } from "./primitives.js"

const cardFieldKinds = new Set([
  "text",
  "multiline",
  "number",
  "text-list",
  "number-pair",
  "boolean",
  "image",
])
const cardFieldKeys = new Set([
  "automaticFitLayer",
  "automaticWhen",
  "advancedOnly",
  "defaultValue",
  "kind",
  "label",
  "max",
  "maxItems",
  "maxLength",
  "min",
  "name",
  "options",
  "required",
  "suggestions",
])

function isEmptyValue(value: unknown) {
  if (value === undefined || value === null || value === "") return true
  return (
    Array.isArray(value) &&
    (value.length === 0 || value.every((entry) => entry === "" || entry === undefined))
  )
}

function numericBoundViolation(field: CardFieldDefinition, value: number, subject: string) {
  if (field.min !== undefined && value < field.min)
    return `${subject} must be at least ${field.min}`
  if (field.max !== undefined && value > field.max) return `${subject} must be at most ${field.max}`
  return undefined
}

function lengthViolation(
  field: CardFieldDefinition,
  entries: readonly string[],
  entryNoun: string,
  subject: string,
  visibleLengths?: readonly number[],
) {
  if (field.maxItems !== undefined && entries.length > field.maxItems) {
    return `${subject} must contain at most ${field.maxItems} ${entryNoun}`
  }
  const maximumLength = field.maxLength
  if (maximumLength === undefined) return undefined
  const lengths = visibleLengths ?? entries.flatMap((entry) => richTextLineLengths(entry))
  if (lengths.some((length) => length > maximumLength)) {
    return `${subject} must not exceed ${maximumLength} characters`
  }
  return undefined
}

export function describeFieldValueViolation(
  field: CardFieldDefinition,
  value: unknown,
  subject = `"${field.name}"`,
  allowEmptyOptional = true,
): string | undefined {
  if (isEmptyValue(value)) {
    if (field.required) return `${subject} is required`
    if (allowEmptyOptional) return undefined
  }
  switch (field.kind) {
    case "boolean":
      return typeof value === "boolean" ? undefined : `${subject} must be a boolean`
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${subject} must be a finite number`
      }
      return numericBoundViolation(field, value, subject)
    case "number-pair": {
      if (!Array.isArray(value) || value.length !== 2) {
        return `${subject} must contain exactly two numbers`
      }
      if (value.some((entry) => entry === undefined)) {
        return field.required ? `${subject} must contain exactly two numbers` : undefined
      }
      if (value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
        return `${subject} must contain only finite numbers`
      }
      for (const [index, entry] of (value as readonly number[]).entries()) {
        const violation = numericBoundViolation(field, entry, `${subject}[${index}]`)
        if (violation) return violation
      }
      return undefined
    }
    case "text-list": {
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        return `${subject} must be a list of strings`
      }
      const entries = value as readonly string[]
      if (field.options && entries.some((entry) => !field.options?.includes(entry))) {
        return `${subject} entries must be one of: ${field.options.join(", ")}`
      }
      return lengthViolation(field, entries, "entries", subject)
    }
    case "text":
    case "multiline": {
      const lines: readonly unknown[] = Array.isArray(value) ? value : [value]
      if (lines.some((entry) => typeof entry !== "string")) return `${subject} must be text`
      if (field.kind === "text" && Array.isArray(value)) {
        return `${subject} must be a single line of text`
      }
      if (field.options && typeof value === "string" && !field.options.includes(value)) {
        return `${subject} must be one of: ${field.options.join(", ")}`
      }
      const textLines = lines as readonly string[]
      const structuralLines = textLines.flatMap((entry) => entry.split(/\r\n?|\n/gu))
      const visibleLengths =
        field.maxLength === undefined ? undefined : richTextLineLengths(textLines.join("\n"))
      return lengthViolation(field, structuralLines, "lines", subject, visibleLengths)
    }
    case "image":
      return isAssetSource(value) ? undefined : `${subject} must be an image source`
  }
}

function numericDefault(field: CardFieldDefinition) {
  return field.min ?? (field.max !== undefined && field.max < 0 ? field.max : 0)
}

export function initialFieldValue(field: CardFieldDefinition): CardFieldValue {
  if (field.defaultValue !== undefined) return field.defaultValue
  switch (field.kind) {
    case "boolean":
      return false
    case "number":
      return numericDefault(field)
    case "number-pair":
      return [numericDefault(field), numericDefault(field)]
    case "text-list":
      return []
    case "text":
      return field.options?.[0] ?? ""
    case "multiline":
    case "image":
      return ""
  }
}

function validateSuggestions(field: UnknownRecord, kind: string, location: string) {
  if (kind !== "text") fail(`${location}.suggestions only applies to text fields.`)
  if (field["options"] !== undefined)
    fail(`${location} cannot declare both options and suggestions.`)
  const values = new Set<string>()
  nonEmptyArray(field["suggestions"], `${location}.suggestions`).forEach((value, index) => {
    const suggestionLocation = `${location}.suggestions[${index}]`
    const suggestion = record(value, suggestionLocation)
    assertNoUnknownKeys(suggestion, ["label", "value"], suggestionLocation)
    const suggestionValue = nonEmptyString(suggestion["value"], `${suggestionLocation}.value`)
    if (values.has(suggestionValue)) {
      fail(`${location}.suggestions contains duplicate value ${JSON.stringify(suggestionValue)}.`)
    }
    values.add(suggestionValue)
    if (suggestion["label"] !== undefined) {
      nonEmptyString(suggestion["label"], `${suggestionLocation}.label`)
    }
  })
}

export function validateCardField(value: unknown, location: string, names: Set<string>) {
  const field = record(value, location)
  assertNoUnknownKeys(field, cardFieldKeys, location)
  const name = nonEmptyString(field["name"], `${location}.name`)
  if (names.has(name)) fail(`Duplicate card field "${name}" at ${location}.`)
  names.add(name)
  const kind = nonEmptyString(field["kind"], `${location}.kind`)
  if (!cardFieldKinds.has(kind)) fail(`${location}.kind "${kind}" is unsupported.`)
  nonEmptyString(field["label"], `${location}.label`)
  if (field["automaticFitLayer"] !== undefined) {
    nonEmptyString(field["automaticFitLayer"], `${location}.automaticFitLayer`)
  }
  optionalBoolean(field["advancedOnly"], `${location}.advancedOnly`)
  optionalBoolean(field["required"], `${location}.required`)

  if (kind === "number" || kind === "number-pair") {
    const [min, max] = (["min", "max"] as const).map((key) =>
      field[key] === undefined ? undefined : finiteNumber(field[key], `${location}.${key}`),
    )
    if (min !== undefined && max !== undefined && min > max) {
      fail(`${location}.min must not exceed ${location}.max.`)
    }
  } else if (field["min"] !== undefined || field["max"] !== undefined) {
    fail(`${location} may only use min and max on numeric fields.`)
  }

  if (field["maxLength"] !== undefined) {
    if (kind !== "text" && kind !== "multiline" && kind !== "text-list") {
      fail(`${location}.maxLength only applies to text fields.`)
    }
    positiveNumber(field["maxLength"], `${location}.maxLength`)
  }
  if (field["maxItems"] !== undefined) {
    if (kind !== "text-list" && kind !== "multiline") {
      fail(`${location}.maxItems only applies to list fields.`)
    }
    positiveNumber(field["maxItems"], `${location}.maxItems`)
  }
  if (field["options"] !== undefined) {
    if (kind !== "text" && kind !== "text-list") {
      fail(`${location}.options only applies to text and text-list fields.`)
    }
    const options = stringArray(field["options"], `${location}.options`, true)
    if (options.length === 0) fail(`${location}.options must not be empty.`)
  }
  if (field["suggestions"] !== undefined) validateSuggestions(field, kind, location)

  const parsed = field as unknown as CardFieldDefinition
  const initialViolation = describeFieldValueViolation(
    parsed,
    initialFieldValue(parsed),
    field["defaultValue"] === undefined ? location : `${location}.defaultValue`,
    false,
  )
  if (initialViolation) fail(`${initialViolation}.`)
  return parsed
}
