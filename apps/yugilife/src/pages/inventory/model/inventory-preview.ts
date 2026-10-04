import type { InventoryCardPreview, InventoryCardSummary } from "./inventory-card"

export const inventoryPreviewExportOptions = {
  format: "webp",
  quality: 0.8,
  size: { scale: 0.5 },
} as const

export function inventoryPreviewMatchesCard(
  preview: InventoryCardPreview,
  card: Pick<InventoryCardSummary, "id" | "revision">,
) {
  return preview.cardId === card.id && preview.cardRevision === card.revision
}
