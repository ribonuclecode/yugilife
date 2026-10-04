import { generatedDefaultTemplateIds, generatedTemplateEntries } from "./generated-catalog.js"

import type {
  CardTemplate,
  ColorPresetCollection,
  TemplateId,
  TemplateIdentity,
  TemplateManifest,
} from "yugilife-core"

export interface OfficialTemplateEntry {
  readonly assets: Readonly<Record<string, string>>
  readonly colorPresets: ColorPresetCollection
  readonly manifest: TemplateManifest
  readonly template: CardTemplate
}

export const officialTemplateEntries =
  generatedTemplateEntries as unknown as readonly OfficialTemplateEntry[]

export const DEFAULT_TEMPLATE_ID: TemplateId = generatedDefaultTemplateIds.card

export function templateIdentity({ id, kind, name, version }: TemplateManifest): TemplateIdentity {
  return { id, kind, name, version }
}
