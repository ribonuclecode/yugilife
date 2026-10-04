import { parseRichText, plainTextFromRichText } from "yugilife-core"

import { migrateInventoryCardToCurrentTemplate } from "./model/inventory-card-migration"
import {
  createInventoryCard,
  listInventoryCards,
  seedInventoryIfPristine,
} from "./persistence/inventory-storage"
import { readLegacyEditorDocument } from "./persistence/legacy-editor-storage"
import { createInventorySeed } from "./seed/inventory-seed"

export async function initializeInventory() {
  let summaries = await listInventoryCards()
  if (summaries.length > 0) return summaries

  const legacy = await readLegacyEditorDocument()
  if (legacy) {
    const now = Date.now()
    const migrated = await migrateInventoryCardToCurrentTemplate({
      createdAt: now,
      document: legacy.document,
      id: "legacy-import",
      revision: 1,
      title:
        typeof legacy.document.card.name === "string" && legacy.document.card.name.trim()
          ? plainTextFromRichText(parseRichText(legacy.document.card.name).document)
          : "Recovered card",
      updatedAt: now,
    })
    await createInventoryCard(migrated.document, migrated.title)
    await legacy.remove()
  } else {
    await seedInventoryIfPristine(createInventorySeed)
  }

  summaries = await listInventoryCards()
  return summaries
}
