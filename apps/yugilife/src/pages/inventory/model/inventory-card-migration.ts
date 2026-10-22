import { officialTemplateBundle } from "../../build/editor/model/editor-config"
import { validateEditorDocumentState } from "../../build/editor/model/editor-document-validation"
import { createInitialEditorDocument } from "../../build/editor/model/editor-store"
import {
  moveLegacyArtworkMaskEffects,
  moveLegacyArtworkTransformMode,
} from "../../build/migrations/document"
import { migrateEditorTemplateVersion } from "../../build/migrations/template"
import { readStoredTemplate } from "../../build/templates/template-storage"

import type { EditorDocumentState } from "../../build/editor/model/editor-document"
import type { InventoryCard } from "./inventory-card"
import type { CardTemplateBundle } from "yugilife-core"

export function migrateInventoryCardDocument(
  document: EditorDocumentState,
  current: EditorDocumentState,
  template?: Parameters<typeof validateEditorDocumentState>[1],
  colorPresets?: Parameters<typeof validateEditorDocumentState>[2],
) {
  const migrated = migrateEditorTemplateVersion(document, current)
  if (!migrated) {
    throw new Error(
      `No migration is available from template "${document.templateId}@${document.templateVersion}" to "${current.templateId}@${current.templateVersion}".`,
    )
  }
  const moved = moveLegacyArtworkTransformMode(moveLegacyArtworkMaskEffects(migrated))
  const candidate: EditorDocumentState = {
    ...current,
    ...moved,
    card: { ...current.card, ...moved.card },
    layers: moved.layers ?? {},
    presetOverrides: moved.presetOverrides ?? {},
    presentationOverrides: moved.presentationOverrides ?? {},
    artworkMaskEffects: moved.artworkMaskEffects ?? {},
    templateId: current.templateId,
    templateVersion: current.templateVersion,
  }
  return validateEditorDocumentState(candidate, template, colorPresets)
}

/**
 * The bundle a card's template ID resolves to: a stored user template, or the official template of
 * that ID. An unknown official ID resolves to the default, whose migration then rejects the card.
 */
export async function resolveCardTemplateBundle(templateId: string): Promise<CardTemplateBundle> {
  if (!templateId.startsWith("user/")) return officialTemplateBundle(templateId)
  const stored = await readStoredTemplate(templateId)
  if (!stored || stored.source !== "user") {
    throw new Error(`The card requires user template "${templateId}", which is not installed.`)
  }
  return stored.bundle
}

export async function migrateInventoryCardToCurrentTemplate(saved: InventoryCard) {
  const bundle = await resolveCardTemplateBundle(saved.document.templateId)
  const document = migrateInventoryCardDocument(
    saved.document,
    createInitialEditorDocument(bundle),
    bundle.template,
    bundle.colorPresets,
  )
  if (
    document.templateId === saved.document.templateId &&
    document.templateVersion === saved.document.templateVersion
  ) {
    return saved
  }
  return {
    ...saved,
    document,
    revision: saved.revision + 1,
    updatedAt: Date.now(),
  }
}
