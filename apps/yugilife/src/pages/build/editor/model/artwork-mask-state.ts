import type { ArtworkMaskEditingState, EditorDocumentState } from "./editor-document"

export function selectedArtworkMask(mask: ArtworkMaskEditingState) {
  return mask.mode === "manual" ? mask.manualMask : mask.automaticMask
}

export function artworkMaskPending(
  document: Pick<EditorDocumentState, "artworkMask" | "card">,
  artworkField: string,
) {
  return (
    !!document.card[artworkField] &&
    document.artworkMask.mode === "manual" &&
    !document.artworkMask.manualMask
  )
}

export function requireCompletedArtworkMask(
  document: Pick<EditorDocumentState, "artworkMask" | "card">,
  artworkField: string,
) {
  if (artworkMaskPending(document, artworkField)) {
    throw new Error(
      "Wait for the dot mask to finish, or retry it in the artwork preview before saving or exporting.",
    )
  }
}
