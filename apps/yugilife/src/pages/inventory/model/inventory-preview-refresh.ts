import { getOfficialTemplate } from "yugilife-templates"

import { acquirePreparedTextures } from "../../build/templates/prepare-template-textures"
import { readStoredTemplate } from "../../build/templates/template-storage"
import {
  listInventoryCards,
  readInventoryCard,
  saveInventoryCardSnapshot,
} from "../persistence/inventory-storage"

import { migrateInventoryCardToCurrentTemplate } from "./inventory-card-migration"
import { processedInventoryMask, renderInventoryPreview } from "./inventory-preview-render"

import type { InventoryCard } from "./inventory-card"
import type { PreparedTextures } from "yugilife-core"
import type { LoadedTemplateBundle } from "yugilife-templates"

export interface InventoryPreviewRefreshProgress {
  cardId: string | undefined
  completed: number
  total: number
}

export interface InventoryPreviewRefreshOptions {
  onCardRendered?: (cardId: string) => void
  onProgress?: (progress: InventoryPreviewRefreshProgress) => void
  signal?: AbortSignal
}

export interface InventoryPreviewRefreshResult {
  failed: readonly string[]
  updated: number
}

function abortError() {
  return new DOMException("The preview refresh was cancelled.", "AbortError")
}

interface RefreshTemplate {
  bundle: LoadedTemplateBundle
  preparedTextures: PreparedTextures | undefined
}

function templateLoader(signal: AbortSignal | undefined) {
  const templates = new Map<string, RefreshTemplate>()
  return async function templateFor(templateId: string) {
    const cached = templates.get(templateId)
    if (cached) return cached
    const bundle = await loadBundle(templateId, signal)
    const prepared = await acquirePreparedTextures(bundle, signal ? { signal } : {})
    const resolved: RefreshTemplate = { bundle, preparedTextures: prepared?.textures }
    templates.set(templateId, resolved)
    return resolved
  }
}

async function loadBundle(templateId: string, signal: AbortSignal | undefined) {
  if (templateId.startsWith("user/")) {
    const stored = await readStoredTemplate(templateId)
    if (!stored || stored.source !== "user") {
      throw new Error(`User template "${templateId}" is not installed.`)
    }
    return stored.bundle
  }
  return await getOfficialTemplate(templateId).load(signal ? { signal } : {})
}

async function refreshOne(
  card: InventoryCard,
  templateFor: (templateId: string) => Promise<RefreshTemplate>,
) {
  const migrated = await migrateInventoryCardToCurrentTemplate(card)
  const { bundle, preparedTextures } = await templateFor(migrated.document.templateId)
  const image = await renderInventoryPreview(
    migrated.document,
    bundle,
    await processedInventoryMask(migrated.document, bundle),
    preparedTextures,
  )
  await saveInventoryCardSnapshot(migrated, {
    cardId: migrated.id,
    cardRevision: migrated.revision,
    image,
  })
}

export async function refreshInventoryPreviews(
  options: InventoryPreviewRefreshOptions = {},
): Promise<InventoryPreviewRefreshResult> {
  const summaries = await listInventoryCards()
  const templateFor = templateLoader(options.signal)
  const failed: string[] = []
  let completed = 0
  let updated = 0
  const report = (cardId: string | undefined) =>
    options.onProgress?.({ cardId, completed, total: summaries.length })
  report(undefined)
  for (const summary of summaries) {
    if (options.signal?.aborted) throw abortError()
    // Announced before the work so the gallery can mark this card as rendering while it happens.
    report(summary.id)
    try {
      const card = await readInventoryCard(summary.id)
      // A card deleted while the refresh is running is not a failure.
      if (card) {
        await refreshOne(card, templateFor)
        updated += 1
        options.onCardRendered?.(summary.id)
      }
    } catch (error: unknown) {
      if (options.signal?.aborted) throw abortError()
      failed.push(summary.title)
      if (import.meta.env.DEV) {
        console.warn(`Could not refresh the preview for inventory card "${summary.id}".`, error)
      }
    }
    completed += 1
  }
  report(undefined)
  return { failed, updated }
}
