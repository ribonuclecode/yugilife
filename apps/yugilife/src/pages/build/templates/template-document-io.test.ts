import { describe, expect, it } from "vitest"
import { validateCardTemplate } from "yugilife-core"
import { DEFAULT_TEMPLATE, getOfficialTemplate, TEMPLATE_CATALOG } from "yugilife-templates"

import { editorColorPresets, editorTemplate } from "../editor/model/editor-config"

import { templateEditorCompatibility, templatesShareEditorContract } from "./template-document-io"

describe("template editor compatibility", () => {
  it("allows templates to customize open field suggestions", () => {
    const template = validateCardTemplate({
      ...editorTemplate,
      cardFields: editorTemplate.cardFields.map((field) =>
        field.name === "edition"
          ? { ...field, suggestions: [{ value: "Custom canonical edition" }] }
          : field,
      ),
    })

    expect(templateEditorCompatibility(template, editorColorPresets)).toEqual({ compatible: true })
  })

  it("accepts every official template as an editor contract", () => {
    for (const official of TEMPLATE_CATALOG) {
      expect(templateEditorCompatibility(official.template, official.colorPresets)).toEqual({
        compatible: true,
      })
    }
  })

  it("explains an unknown contract against the default editor", () => {
    const template = validateCardTemplate({
      ...editorTemplate,
      cardFields: editorTemplate.cardFields.map((field) =>
        field.name === "edition" ? { ...field, maxLength: 12 } : field,
      ),
    })

    expect(templateEditorCompatibility(template, editorColorPresets)).toEqual({
      compatible: false,
      reason: "its card fields differ from the current editor contract",
    })
  })

  it("tells templates with different editor contracts apart", () => {
    const dynamis = getOfficialTemplate("card/dynamis-duel")

    expect(templatesShareEditorContract(DEFAULT_TEMPLATE, DEFAULT_TEMPLATE)).toBe(true)
    expect(templatesShareEditorContract(dynamis, dynamis)).toBe(true)
    expect(templatesShareEditorContract(DEFAULT_TEMPLATE, dynamis)).toBe(false)
  })
})
