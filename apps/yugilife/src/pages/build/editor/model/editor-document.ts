import type { PinMaskPoint } from "@/lib/pin-mask/quick-selection"
import type { ArtworkMaskEffects } from "@/lib/pin-mask/quick-selection-types"
import type { CardData, LayerVisibility, PresentationOverrides, TemplateId } from "yugilife-core"

export type { ArtworkMaskEffects } from "@/lib/pin-mask/quick-selection-types"

export type EditorMode = "automatic" | "advanced"

interface CatalogArtworkSource {
  artworkId: number
  cardCid: number
  name: string
  passcode?: string
}

export interface ArtworkMaskEditingState {
  catalogSource?: CatalogArtworkSource

  automaticMask?: Blob | undefined
  manualMask?: Blob | undefined
  mode: "automatic" | "manual"
  points: readonly PinMaskPoint[]
}

export interface EditorDocumentState {
  artworkMask: ArtworkMaskEditingState
  artworkMaskEffects: Readonly<Record<string, ArtworkMaskEffects | undefined>>
  card: CardData
  layers: LayerVisibility
  mode: EditorMode
  presetOverrides: Readonly<Record<string, string>>
  presentationOverrides: PresentationOverrides
  templateId: TemplateId
  templateVersion: string
}
