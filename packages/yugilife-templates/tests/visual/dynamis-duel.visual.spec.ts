import { expect } from "@playwright/test"

import { checkPreparedTextures, showFixture, test } from "./visual-fixture"

import type { Locator } from "@playwright/test"

const templateId = "card/dynamis-duel"

function search(parameters: Record<string, string>) {
  return `?${new URLSearchParams({ template: templateId, ...parameters }).toString()}`
}

async function expectPortableOutlinedSvg(card: Locator) {
  const svg = card.locator("svg")
  await expect(svg).toHaveAttribute("data-yugilife-text-mode", "paths")
  await expect(svg.locator("text, tspan")).toHaveCount(0)
  expect(await svg.locator("path").count()).toBeGreaterThan(0)
}

const cases = [
  ["effect-monster", {}],
  [
    "god-monster-with-icons",
    { variant: "god", attribute: "DIVINE", aether: "true", signatureMove: "true", level: "10" },
  ],
  [
    "quick-play-spell",
    {
      variant: "spell",
      spellTrapType: "quick-play",
      types: "Signature Move|Quick-Play Spell Card",
    },
  ],
  ["counter-trap-without-artwork", { variant: "trap", spellTrapType: "counter", artwork: "false" }],
  ["transformation-full-art", { variant: "transformation", fullArt: "true" }],
] as const

for (const [name, parameters] of cases) {
  test(`Dynamis Duel ${name}`, async ({ fixturePage }) => {
    const card = await showFixture(fixturePage, search({ ...parameters }))
    await expect(card).toHaveAttribute("data-ready", "true")
    await expect(card).toHaveAttribute("data-card-fixture", `synthetic:${templateId}`)
    await expectPortableOutlinedSvg(card)
    await expect(card).toHaveScreenshot(`dynamis-duel/${name}.webp`)
  })
}

test("Dynamis Duel prepared textures hold exactly the graded pixels", async ({ fixturePage }) => {
  const { checked, mismatches } = await checkPreparedTextures(fixturePage, templateId)

  expect(mismatches).toEqual([])
  expect(checked).toBeGreaterThan(0)
})
