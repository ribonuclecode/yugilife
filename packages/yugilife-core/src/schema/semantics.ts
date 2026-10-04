import {
  assertNoUnknownKeys,
  fail,
  finiteNumber,
  nonEmptyArray,
  nonEmptyRecord,
  nonEmptyString,
  record,
} from "./primitives.js"

import type { SemanticPrimitive } from "../contracts/index.js"
import type { UnknownRecord } from "./primitives.js"

type SemanticValueKind = "list" | "scalar" | "scalar-or-list"
type FieldsByName = ReadonlyMap<string, UnknownRecord>

const semanticTransformKinds = new Set(["unique-list", "includes", "lookup"])
const semanticFallbackKinds = new Set(["list-length", "value"])
const bindingKeys = ["fallback", "fallbackValues", "path", "source", "transform", "when"]

function semanticPrimitive(value: unknown, location: string): SemanticPrimitive {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value
  }
  fail(`${location} must be a boolean, number, or string.`)
}

function semanticPrimitiveArray(value: unknown, location: string): readonly SemanticPrimitive[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${location} must be a non-empty array of booleans, numbers, or strings.`)
  }
  return value.map((entry, index) => semanticPrimitive(entry, `${location}[${index}]`))
}

function declaredPath(value: unknown, location: string, semanticPaths: ReadonlySet<string>) {
  const path = nonEmptyString(value, location)
  if (!semanticPaths.has(path)) {
    fail(`${location} "${path}" must reference a declared semantic binding.`)
  }
  return path
}

export function validateSemanticCondition(
  value: unknown,
  location: string,
  semanticPaths: ReadonlySet<string>,
) {
  const condition = record(value, location)
  for (const combinator of ["all", "any"] as const) {
    if (condition[combinator] === undefined) continue
    assertNoUnknownKeys(condition, [combinator], location)
    nonEmptyArray(condition[combinator], `${location}.${combinator}`).forEach((child, index) =>
      validateSemanticCondition(child, `${location}.${combinator}[${index}]`, semanticPaths),
    )
    return
  }
  if (condition["in"] !== undefined) {
    assertNoUnknownKeys(condition, ["in", "path"], location)
    declaredPath(condition["path"], `${location}.path`, semanticPaths)
    const values = semanticPrimitiveArray(condition["in"], `${location}.in`)
    if (new Set(values).size !== values.length) {
      fail(`${location}.in must not contain duplicate values.`)
    }
    return
  }
  assertNoUnknownKeys(condition, ["equals", "path"], location)
  declaredPath(condition["path"], `${location}.path`, semanticPaths)
  semanticPrimitive(condition["equals"], `${location}.equals`)
}

export function validateAutomaticWhen(
  value: unknown,
  location: string,
  semanticPaths: ReadonlySet<string>,
) {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    validateSemanticCondition(value, location, semanticPaths)
    return
  }
  if (value.length === 0) fail(`${location} must not be empty.`)
  value.forEach((condition, index) =>
    validateSemanticCondition(condition, `${location}[${index}]`, semanticPaths),
  )
}

export function validateTransformModeGate(
  value: unknown,
  location: string,
  transformIds: ReadonlySet<string>,
) {
  Object.entries(nonEmptyRecord(value, location)).forEach(([transformId, mode]) => {
    if (!transformIds.has(transformId)) {
      fail(`${location} references unknown artwork transform "${transformId}".`)
    }
    if (mode !== null) nonEmptyString(mode, `${location}.${transformId}`)
  })
}

function fieldValueKind(fieldName: unknown, location: string, fields: FieldsByName) {
  const name = nonEmptyString(fieldName, location)
  const field = fields.get(name)
  if (!field) fail(`${location} references undeclared card field "${name}".`)
  const kind = String(field["kind"])
  if (kind === "text-list" || kind === "number-pair") return "list"
  if (kind === "multiline") return "scalar-or-list"
  if (kind === "text" || kind === "number" || kind === "boolean") return "scalar"
  fail(`${location} must reference a scalar or list card field.`)
}

function exactlyOne(source: UnknownRecord, keys: readonly [string, string], location: string) {
  const [first, second] = keys
  if ((source[first] !== undefined) === (source[second] !== undefined)) {
    fail(`${location} must declare exactly one of ${first} or ${second}.`)
  }
}

function validateSource(value: unknown, location: string, fields: FieldsByName): SemanticValueKind {
  const source = record(value, location)
  assertNoUnknownKeys(source, ["field", "value"], location)
  exactlyOne(source, ["field", "value"], location)
  const constant = source["value"]
  if (constant === undefined) return fieldValueKind(source["field"], `${location}.field`, fields)
  if (Array.isArray(constant)) {
    semanticPrimitiveArray(constant, `${location}.value`)
    return "list"
  }
  semanticPrimitive(constant, `${location}.value`)
  return "scalar"
}

function validateSourceReference(
  value: unknown,
  location: string,
  fields: FieldsByName,
  semanticPaths: ReadonlyMap<string, SemanticValueKind>,
): SemanticValueKind {
  const source = record(value, location)
  assertNoUnknownKeys(source, ["field", "path"], location)
  exactlyOne(source, ["field", "path"], location)
  if (source["path"] === undefined) {
    return fieldValueKind(source["field"], `${location}.field`, fields)
  }
  const path = nonEmptyString(source["path"], `${location}.path`)
  const kind = semanticPaths.get(path)
  if (!kind) fail(`${location}.path "${path}" must reference a declared semantic binding.`)
  return kind
}

function validateTransform(
  value: unknown,
  location: string,
  sourceKind: SemanticValueKind,
): SemanticValueKind {
  const transform = record(value, location)
  assertNoUnknownKeys(transform, ["kind", "value", "values"], location)
  const kind = nonEmptyString(transform["kind"], `${location}.kind`)
  if (!semanticTransformKinds.has(kind)) fail(`${location}.kind "${kind}" is unsupported.`)
  if (kind === "includes") {
    if (sourceKind !== "list") fail(`${location} kind "includes" requires a list source.`)
    nonEmptyString(transform["value"], `${location}.value`)
    return "scalar"
  }
  if (kind === "lookup") {
    if (sourceKind !== "scalar") fail(`${location} kind "lookup" requires a scalar source.`)
    if (transform["value"] !== undefined) fail(`${location}.value is not allowed for lookup.`)
    const values = record(transform["values"], `${location}.values`)
    if (Object.keys(values).length === 0) fail(`${location}.values must not be empty.`)
    Object.entries(values).forEach(([key, mappedValue]) => {
      if (key.length === 0) fail(`${location}.values contains an empty source key.`)
      semanticPrimitive(mappedValue, `${location}.values.${key}`)
    })
    return "scalar"
  }
  if (sourceKind !== "list") fail(`${location} kind "unique-list" requires a list source.`)
  if (transform["values"] !== undefined) fail(`${location}.values is not allowed for ${kind}.`)
  if (transform["value"] !== undefined) fail(`${location}.value is not allowed for unique-list.`)
  return "list"
}

function validateFallback(
  value: unknown,
  location: string,
  fields: FieldsByName,
  semanticPaths: ReadonlyMap<string, SemanticValueKind>,
): SemanticValueKind {
  const fallback = record(value, location)
  assertNoUnknownKeys(fallback, ["kind", "minimum", "source", "value"], location)
  const kind = nonEmptyString(fallback["kind"], `${location}.kind`)
  if (!semanticFallbackKinds.has(kind)) fail(`${location}.kind "${kind}" is unsupported.`)
  if (kind === "value") {
    if (fallback["minimum"] !== undefined || fallback["source"] !== undefined) {
      fail(`${location} value fallbacks may only declare kind and value.`)
    }
    semanticPrimitive(fallback["value"], `${location}.value`)
    return "scalar"
  }
  if (fallback["value"] !== undefined)
    fail(`${location}.value is only allowed for value fallbacks.`)
  if (fallback["minimum"] !== undefined) finiteNumber(fallback["minimum"], `${location}.minimum`)
  const sourceKind = validateSourceReference(
    fallback["source"],
    `${location}.source`,
    fields,
    semanticPaths,
  )
  if (sourceKind !== "list") fail(`${location}.source must reference a list value.`)
  return "scalar"
}

export function validateSemanticBindings(value: unknown, fields: FieldsByName): Set<string> {
  const location = "semanticBindings"
  const container = record(value, location)
  assertNoUnknownKeys(container, ["bindings"], location)
  const declaredPaths = new Set<string>()
  const bindings = nonEmptyArray(container["bindings"], `${location}.bindings`).map(
    (entry, index) => {
      const binding = record(entry, `${location}[${index}]`)
      assertNoUnknownKeys(binding, bindingKeys, `${location}[${index}]`)
      const path = nonEmptyString(binding["path"], `${location}[${index}].path`)
      if (declaredPaths.has(path)) fail(`${location} contains duplicate path "${path}".`)
      declaredPaths.add(path)
      return binding
    },
  )

  const availablePaths = new Map<string, SemanticValueKind>()
  bindings.forEach((binding, index) => {
    const bindingLocation = `${location}[${index}]`
    const sourceKind = validateSource(binding["source"], `${bindingLocation}.source`, fields)
    if (binding["fallback"] !== undefined) {
      const fallbackKind = validateFallback(
        binding["fallback"],
        `${bindingLocation}.fallback`,
        fields,
        availablePaths,
      )
      if (fallbackKind !== sourceKind) {
        fail(
          `${bindingLocation}.fallback produces a ${fallbackKind} value but its source is ${sourceKind}.`,
        )
      }
    }
    if (binding["fallbackValues"] !== undefined) {
      if (sourceKind !== "scalar")
        fail(`${bindingLocation}.fallbackValues requires a scalar source.`)
      semanticPrimitiveArray(binding["fallbackValues"], `${bindingLocation}.fallbackValues`)
    }
    if (binding["when"] !== undefined) {
      validateSemanticCondition(
        binding["when"],
        `${bindingLocation}.when`,
        new Set(availablePaths.keys()),
      )
    }
    const outputKind =
      binding["transform"] === undefined
        ? sourceKind
        : validateTransform(binding["transform"], `${bindingLocation}.transform`, sourceKind)
    availablePaths.set(String(binding["path"]), outputKind)
  })
  return declaredPaths
}
