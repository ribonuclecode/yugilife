import { walkLayers } from "./rendering/layer-tree.js"
import {
  describeFieldValueViolation,
  initialFieldValue,
  validateCardTemplateShape,
  validateColorPresetCollectionShape,
  validatePresentationOverridesShape,
  validateSvgElementShape,
  validateTemplateManifestShape,
} from "./schema/index.js"

import type {
  CardData,
  CardFieldValue,
  CardTemplate,
  PresentationOverrides,
  SvgElementDefinition,
  TemplateManifest,
} from "./contracts/index.js"

export class TemplateValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "TemplateValidationError"
  }
}

function validate<T>(validator: (input: unknown) => T, input: unknown, subject?: string): T {
  try {
    return validator(input)
  } catch (error) {
    if (error instanceof TemplateValidationError) throw error
    const detail = error instanceof Error ? error.message : "Template validation failed."
    const message =
      subject && !detail.startsWith(`Malformed ${subject}:`)
        ? `Malformed ${subject}: ${detail}`
        : detail
    throw new TemplateValidationError(message, { cause: error })
  }
}

export function validateTemplateManifest(input: unknown): TemplateManifest {
  return validate(validateTemplateManifestShape, input, "template manifest")
}

export function validateSvgElementDefinition(
  input: unknown,
  location?: string,
): asserts input is SvgElementDefinition {
  validate((value) => validateSvgElementShape(value, location), input)
}

export function validateCardTemplate(input: unknown): CardTemplate {
  return validate(validateCardTemplateShape, input, "card template")
}

export function validateColorPresetCollection(input: unknown) {
  return validate(validateColorPresetCollectionShape, input, "color preset collection")
}

export function validatePresentationOverrides(
  input: unknown,
  template: CardTemplate,
): PresentationOverrides {
  return validate(
    (value) => validatePresentationOverridesShape(value, template),
    input,
    "presentation overrides",
  )
}

function repeatedImageViolations(card: CardData, template: CardTemplate) {
  const violations: string[] = []
  walkLayers(template.layers, ({ layer }) => {
    if (layer.kind !== "repeated-image") return
    const field = String(layer["field"])
    const value = card[field]
    if (
      value !== undefined &&
      value !== "" &&
      (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    ) {
      violations.push(`"${field}" must be a non-negative integer`)
    }
  })
  return violations
}

export function validateCardData(card: CardData, template: CardTemplate) {
  const violations = [
    ...template.cardFields
      .map((field) => describeFieldValueViolation(field, card[field.name]))
      .filter((violation): violation is string => violation !== undefined),
    ...repeatedImageViolations(card, template),
  ]
  if (violations.length > 0) {
    throw new TemplateValidationError(
      `Card data does not satisfy this template: ${violations.join("; ")}.`,
    )
  }
}

export function createCardFromTemplate(template: CardTemplate): CardData {
  const card: Record<string, CardFieldValue> = {}
  for (const field of template.cardFields) {
    card[field.name] = initialFieldValue(field)
  }
  if (typeof card["name"] !== "string") card["name"] = ""
  return card as CardData
}
