import { fail, finiteTuple, optionalString, record } from "./primitives.js"

import type { ColorPreset, ColorPresetCollection } from "../contracts/index.js"
import type { UnknownRecord } from "./primitives.js"

function validatePolynomial(preset: UnknownRecord, location: string) {
  const exponents = preset["exponents"]
  const coefficients = preset["coefficients"]
  if (
    !Array.isArray(exponents) ||
    !Array.isArray(coefficients) ||
    exponents.length === 0 ||
    exponents.length !== coefficients.length
  ) {
    fail(`${location} must contain equally sized exponent and coefficient arrays.`)
  }
  exponents.forEach((tuple, index) => {
    const powers = finiteTuple(tuple, 3, `${location}.exponents[${index}]`)
    if (powers.some((power) => !Number.isInteger(power) || power < 0)) {
      fail(`${location}.exponents[${index}] must contain non-negative integers.`)
    }
  })
  coefficients.forEach((tuple, index) =>
    finiteTuple(tuple, 3, `${location}.coefficients[${index}]`),
  )
}

function validateHistogram(preset: UnknownRecord, location: string) {
  const channels = record(preset["channels"], `${location}.channels`)
  for (const channel of ["r", "g", "b"] as const) {
    const values = channels[channel]
    if (
      !Array.isArray(values) ||
      values.length !== 256 ||
      values.some(
        (value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 255,
      )
    ) {
      fail(`${location}.channels.${channel} must contain 256 values from 0–255.`)
    }
  }
}

export function validateColorPresetShape(input: unknown, location = "Color preset"): ColorPreset {
  const preset = record(input, location)
  if (preset["metadata"] !== undefined) {
    const metadata = record(preset["metadata"], `${location}.metadata`)
    optionalString(metadata["target"], `${location}.metadata.target`)
  }
  const method = preset["method"]
  if (method === "rgb-polynomial") validatePolynomial(preset, location)
  else if (method === "skimage-histogram-rgb-lut") validateHistogram(preset, location)
  else if (method !== "identity") {
    fail(`${location} uses unsupported method ${JSON.stringify(method)}.`)
  }
  return preset as unknown as ColorPreset
}

export function validateColorPresetCollectionShape(
  input: unknown,
  location = "Color presets",
): ColorPresetCollection {
  const presets = record(input, location)
  Object.entries(presets).forEach(([name, preset]) =>
    validateColorPresetShape(preset, `${location} "${name}"`),
  )
  return presets as ColorPresetCollection
}
