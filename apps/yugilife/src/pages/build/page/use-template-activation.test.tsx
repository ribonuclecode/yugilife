import { act, useEffect } from "react"

import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { DEFAULT_TEMPLATE, getOfficialTemplate } from "yugilife-templates"

import { useTemplateActivation } from "./use-template-activation"

import type { CardTemplateBundle } from "yugilife-core"

const dynamisDuel = getOfficialTemplate("card/dynamis-duel")

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  templates: [] as { bundle: CardTemplateBundle; id: string; source: string; version: string }[],
}))
vi.mock("yugilife-templates", async (importOriginal) => {
  const actual = await importOriginal<{ getOfficialTemplate: typeof getOfficialTemplate }>()
  return {
    ...actual,
    getOfficialTemplate: (id: string) => ({ ...actual.getOfficialTemplate(id), load: mocks.load }),
  }
})
vi.mock("../templates/template-storage", () => ({
  deleteStoredTemplate: vi.fn(),
  getTemplateStorageMode: () => "memory",
  readStoredTemplate: (id: string) =>
    Promise.resolve(mocks.templates.find((template) => template.id === id)),
  readTemplateStorageSnapshot: () =>
    Promise.resolve({
      originStorage: {},
      preparedTextureBytes: 0,
      storageMode: "memory",
      templates: [...mocks.templates],
    }),
  storeTemplate: vi.fn(() => Promise.resolve()),
  templateBundleMatchesVersion: (bundle: CardTemplateBundle | undefined, id: string) =>
    bundle?.manifest.id === id,
}))
vi.mock("../../inventory/persistence/inventory-storage", () => ({
  listInventoryCards: () => Promise.resolve([]),
}))
vi.mock("../templates/prepare-template-textures", () => ({
  acquirePreparedTextures: () => new Promise(() => undefined),
  preparedTexturesForBundle: () => undefined,
  preparedTexturesSettled: () => false,
}))
vi.mock("../templates/template-document-io", () => ({
  templateEditorCompatibility: () => ({ compatible: true }),
  templatesShareEditorContract: (source: CardTemplateBundle, target: CardTemplateBundle) =>
    source.template === target.template,
  validateTemplateBundle: (bundle: CardTemplateBundle) => bundle,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

type Activation = ReturnType<typeof useTemplateActivation>

let activation: Activation
const expose = (value: Activation) => {
  activation = value
}
const resetCard = vi.fn()
const setTemplateIdentity = vi.fn()

function Harness({ storedTemplateId }: { storedTemplateId: string }) {
  const value = useTemplateActivation({
    inventoryBusy: false,
    resetCard,
    setTemplateIdentity,
    storedTemplateId,
  })
  useEffect(() => expose(value))
  return null
}

afterEach(() => {
  mocks.templates = []
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it("drops a template download that was in flight when another template's document opened", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const seriesLoad = deferred<CardTemplateBundle>()
  const dynamisLoad = deferred<CardTemplateBundle>()
  mocks.load.mockReturnValueOnce(seriesLoad.promise).mockReturnValueOnce(dynamisLoad.promise)
  const root = createRoot(document.createElement("div"))
  const flush = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)))

  act(() => root.render(<Harness storedTemplateId={DEFAULT_TEMPLATE.id} />))
  await flush()
  expect(mocks.load).toHaveBeenCalledTimes(1)

  // Importing a Dynamis Duel document replaces the card, then opens its template.
  act(() => root.render(<Harness storedTemplateId={dynamisDuel.id} />))
  act(() => activation.selectTemplate(dynamisDuel.id))
  await flush()

  seriesLoad.resolve(DEFAULT_TEMPLATE)
  await flush()
  dynamisLoad.resolve(dynamisDuel)
  await flush()

  expect(setTemplateIdentity).not.toHaveBeenCalledWith(DEFAULT_TEMPLATE.id, expect.anything())
  expect(setTemplateIdentity).toHaveBeenLastCalledWith(dynamisDuel.id, dynamisDuel.version)
  expect(resetCard).not.toHaveBeenCalled()
  act(() => root.unmount())
})

it("starts a blank default card when a removed user template's card cannot keep its data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const copy = { ...dynamisDuel, manifest: { ...dynamisDuel.manifest, id: "user/dynamis-copy" } }
  mocks.templates = [{ bundle: copy, id: copy.manifest.id, source: "user", version: "1" }]
  const root = createRoot(document.createElement("div"))
  const flush = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)))

  act(() => root.render(<Harness storedTemplateId={copy.manifest.id} />))
  await flush()
  expect(setTemplateIdentity).toHaveBeenLastCalledWith(copy.manifest.id, copy.manifest.version)

  mocks.templates = []
  await act(async () => {
    await activation.removeSelectedTemplate()
  })

  // Dynamis Duel fields are not Series 10 data, so relabelling the card would render garbage.
  expect(resetCard).toHaveBeenCalledWith(DEFAULT_TEMPLATE)
  act(() => root.unmount())
})
