import { describe, expect, it } from "vitest"
import {
  createCardFromTemplate,
  defaultLayerVisibility,
  deriveCardSemantics,
  flattenLayers,
  resolveCardPresentation,
  validateCardData,
  validateCardTemplate,
} from "yugilife-core"

import { DEFAULT_TEMPLATE, getOfficialTemplate, TEMPLATE_CATALOG } from "../src"

import type { CardData } from "yugilife-core"

const official = getOfficialTemplate("card/dynamis-duel")
const template = official.template
const monsterVariants = [
  "normal",
  "effect",
  "ritual",
  "fusion",
  "ultimatch",
  "transformation",
  "god",
] as const

const defaults = defaultLayerVisibility(template)

/** Rules only list the layers they touch, so visibility is read over the template defaults. */
function presentationFor(card: Partial<CardData>) {
  const data = { ...createCardFromTemplate(template), ...card }
  validateCardData(data, template)
  const presentation = resolveCardPresentation(template, deriveCardSemantics(data, template))
  return { ...presentation, layerVisibility: { ...defaults, ...presentation.layerVisibility } }
}

describe("Dynamis Duel published contract", () => {
  it("is bundled beside Series 10 without replacing the default", () => {
    expect(official.manifest).toMatchObject({
      id: "card/dynamis-duel",
      kind: "card",
      name: "Dynamis Duel",
      version: "2026.10.02",
    })
    expect(official.manifest).not.toHaveProperty("status")
    expect(validateCardTemplate(template)).toStrictEqual(template)
    expect(TEMPLATE_CATALOG).toContain(official)
    expect(official).not.toBe(DEFAULT_TEMPLATE)
    expect(Object.isFrozen(official)).toBe(true)
  })

  it("declares the Dynamis card fields and none of the Series 10 extras", () => {
    expect(template.dimensions).toStrictEqual({ height: 1185, width: 813 })
    expect(template.cardFields.map(({ name }) => name)).toEqual([
      "name",
      "cardVariant",
      "attribute",
      "spellTrapType",
      "level",
      "types",
      "description",
      "attack",
      "defense",
      "era",
      "effectGroup",
      "aether",
      "signatureMove",
      "setId",
      "artwork",
      "artworkOverlay",
    ])
    expect(template.cardFields.find(({ name }) => name === "cardVariant")).toMatchObject({
      defaultValue: "effect",
      options: [...monsterVariants, "spell", "trap"],
      required: true,
    })
    expect(template.cardFields.find(({ name }) => name === "level")).toMatchObject({
      kind: "number",
      max: 12,
      min: 1,
    })
    expect(template.cardFields.find(({ name }) => name === "aether")).toMatchObject({
      defaultValue: false,
      kind: "boolean",
    })
    expect(template.masks).toBeUndefined()
    const layerIds = flattenLayers(template.layers).map(({ id }) => id)
    expect(layerIds).not.toContain("levelStar")
    expect(layerIds.indexOf("frameTexture")).toBeLessThan(layerIds.indexOf("artwork"))
    expect(layerIds.indexOf("artwork")).toBeLessThan(layerIds.indexOf("levelPlate"))
    expect(layerIds.indexOf("level")).toBeGreaterThan(layerIds.indexOf("levelPlate"))
  })

  it("renders the level as a number badge and the stats bar for every monster variant", () => {
    for (const cardVariant of monsterVariants) {
      const presentation = presentationFor({ cardVariant })
      expect(presentation.presets).toStrictEqual({ frame: `dynamis-${cardVariant}-frame` })
      expect(presentation.layerVisibility).toMatchObject({
        atk: true,
        atkBadge: true,
        attribute: true,
        attributeGlyph: true,
        attributePlateDark: true,
        def: true,
        defBadge: true,
        level: true,
        levelLabel: true,
        levelPlate: true,
        spellTrapIconPlate: false,
        statsSeparator: true,
      })
      expect(presentation.text.levelLabel?.value).toBe("LEVEL")
      expect(presentation.text.attributeGlyph?.value).toBe("闇")
    }
  })

  it("shows one attribute plate for the selected attribute", () => {
    const presentation = presentationFor({ attribute: "FIRE", cardVariant: "effect" })
    expect(presentation.layerVisibility).toMatchObject({
      attributePlateDark: false,
      attributePlateFire: true,
      attributePlateSpell: false,
    })
    expect(presentation.text.attribute?.value).toBe("FIRE")
    expect(presentation.text.attributeGlyph?.value).toBe("炎")
  })

  it("swaps the level badge for a spell or trap icon plate", () => {
    const spell = presentationFor({
      cardVariant: "spell",
      spellTrapType: "quick-play",
      types: ["Signature Move", "Quick-Play Spell Card"],
    })
    expect(spell.presets).toStrictEqual({ frame: "dynamis-spell-frame" })
    expect(spell.layerVisibility).toMatchObject({
      atk: false,
      attributePlateSpell: true,
      def: false,
      level: false,
      levelPlate: false,
      spellTrapIconPlate: true,
      spellTrapIconQuickPlay: true,
      spellTrapIconCounter: false,
    })
    expect(spell.text.attribute?.value).toBe("SPELL")
    expect(spell.text.attributeGlyph?.value).toBe("魔")

    const trap = presentationFor({ cardVariant: "trap", spellTrapType: "normal" })
    expect(trap.presets).toStrictEqual({ frame: "dynamis-trap-frame" })
    expect(trap.layerVisibility).toMatchObject({
      attributePlateTrap: true,
      spellTrapIconPlate: true,
    })
    for (const icon of ["Continuous", "Counter", "Equip", "Field", "QuickPlay", "Ritual"]) {
      expect(trap.layerVisibility[`spellTrapIcon${icon}`]).toBe(false)
    }
    expect(trap.text.attribute?.value).toBe("TRAP")
    expect(trap.text.attributeGlyph?.value).toBe("罠")
  })

  it("toggles the Aether and Signature Move icons from boolean fields", () => {
    const plain = presentationFor({})
    expect(plain.layerVisibility).toMatchObject({ aetherIcon: false, signatureStar: false })
    const flagged = presentationFor({ aether: true, signatureMove: true })
    expect(flagged.layerVisibility).toMatchObject({ aetherIcon: true, signatureStar: true })
    expect(flagged.text.aetherIcon?.value).toBe("Æ")
  })

  it("resolves every referenced frame preset against the frame target", () => {
    const presets = official.colorPresets
    for (const rule of template.presentationRules ?? []) {
      for (const [target, name] of Object.entries(rule.presets ?? {})) {
        expect(target).toBe("frame")
        expect(presets[name]?.metadata?.target).toBe("frame")
      }
    }
    for (const name of ["effect", "ultimatch", "transformation", "god"]) {
      const preset = presets[`dynamis-${name}-frame`]
      expect(preset?.method).toBe("rgb-polynomial")
      if (preset?.method === "rgb-polynomial") expect(preset.exponents).toHaveLength(4)
    }
  })

  it("publishes only shared assets, reused Series 10 icons, and referenced fonts", () => {
    const assets = official.assets
    expect(assets["card.dynamis-duel.border"]).toMatch(/border\.(?:png|webp)$/u)
    expect(assets["card.dynamis-duel.frame-texture"]).toMatch(/frame-texture\.(?:png|webp)$/u)
    expect(assets["card.dynamis-duel.spell-trap.icon.counter"]).toMatch(
      /spell-trap-icon-counter\.(?:png|webp)$/u,
    )
    expect(Object.keys(assets).filter((id) => id.startsWith("font."))).toHaveLength(7)
    expect(assets).not.toHaveProperty("font.rogsansrfstd-bd")
  })
})
