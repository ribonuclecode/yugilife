import { useCallback, useEffect, useRef, useState } from "react"

import { useNavigate } from "react-router"
import { TEMPLATE_CATALOG } from "yugilife-templates"

import { errorMessage } from "@/lib/utils"

import { createInitialEditorDocument } from "../build/editor/model/editor-store"

import { inventoryPreviewMatchesCard } from "./model/inventory-preview"
import { refreshInventoryPreviews } from "./model/inventory-preview-refresh"
import {
  createInventoryCard,
  deleteInventoryCard,
  duplicateInventoryCard,
  getInventoryStorageMode,
  readInventoryPreview,
} from "./persistence/inventory-storage"
import { initializeInventory } from "./inventory-initialization"

import type { InventoryCardSummary } from "./model/inventory-card"
import type { InventoryPreviewRefreshProgress } from "./model/inventory-preview-refresh"

export interface InventoryPreviewStatus {
  outdated: number
  templateUpgrade: string | undefined
}

function publishedTemplateVersion(templateId: string) {
  return TEMPLATE_CATALOG.find(({ id }) => id === templateId)?.version
}

export function previewUpdateDescription(total: number, status: InventoryPreviewStatus) {
  if (total === 1) {
    if (status.outdated === 0) {
      return "This card's preview already matches its saved card. Updating re-renders it anyway."
    }
    return status.templateUpgrade
      ? `This card needs a new preview, and is updated to template ${status.templateUpgrade}.`
      : "This card needs a new preview."
  }
  if (status.outdated === 0) {
    return `All ${total} previews already match their saved cards. Updating re-renders every card anyway, which can take a while.`
  }
  const upgrade = status.templateUpgrade
    ? ` Cards on an older template are updated to ${status.templateUpgrade}.`
    : ""
  // The noun agrees with the collection size; the verb agrees with how many are behind.
  const verb = status.outdated === 1 ? "needs" : "need"
  return `${status.outdated} of ${total} cards ${verb} a new preview.${upgrade} Every card is re-rendered, which can take a while.`
}

const refreshMessageDurationMs = 3000
// Outlasts the gallery crossfade so a replaced preview is never blanked mid-transition.
const previewUrlReleaseDelayMs = 700

export function useInventoryController() {
  const navigate = useNavigate()
  const [cards, setCards] = useState<readonly InventoryCardSummary[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string>()
  const [previewUrls, setPreviewUrls] = useState<Readonly<Record<string, string>>>({})
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string>()
  const [previewRefresh, setPreviewRefresh] = useState<InventoryPreviewRefreshProgress>()
  const [previewRefreshMessage, setPreviewRefreshMessage] = useState<string>()
  const [previewStatus, setPreviewStatus] = useState<InventoryPreviewStatus>({
    outdated: 0,
    templateUpgrade: undefined,
  })
  const refreshRequest = useRef(0)
  const liveUrls = useRef<ReadonlySet<string>>(new Set())
  const previewRefreshRequest = useRef<AbortController>(undefined)

  const refresh = useCallback(async (select?: string) => {
    const requestId = ++refreshRequest.current
    const cancelled = () => requestId !== refreshRequest.current
    const stagedUrls: string[] = []
    let published = false
    setBusy(true)
    setError(undefined)
    try {
      const summaries = await initializeInventory()
      if (cancelled()) return
      const sorted = [...summaries].sort(
        (left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id),
      )
      setCards(sorted)
      const exists = (id: string | undefined) =>
        id !== undefined && sorted.some((card) => card.id === id)
      setSelectedCardId((current) =>
        exists(select) ? select : exists(current) ? current : sorted[0]?.id,
      )

      const previews: Array<readonly [string, string]> = []
      const upgrades = new Set<string>()
      let outdated = 0
      for (const summary of sorted) {
        const preview = await readInventoryPreview(summary.id)
        if (cancelled()) return
        const currentVersion = publishedTemplateVersion(summary.templateId)
        const behindTemplate =
          currentVersion !== undefined && currentVersion !== summary.templateVersion
        if (behindTemplate) upgrades.add(currentVersion)
        const usable = preview && inventoryPreviewMatchesCard(preview, summary)
        if (!usable || behindTemplate) outdated += 1
        // A card with no committed preview shows its placeholder until it is opened or refreshed.
        if (!usable) continue
        const url = URL.createObjectURL(preview.image)
        stagedUrls.push(url)
        previews.push([summary.id, url])
      }
      setPreviewUrls(Object.fromEntries(previews))
      setPreviewStatus({
        outdated,
        // Only name a target version when every outdated card agrees on one.
        templateUpgrade: upgrades.size === 1 ? [...upgrades][0] : undefined,
      })
      published = true
    } catch (caught: unknown) {
      if (!cancelled()) setError(errorMessage(caught))
    } finally {
      if (!published) stagedUrls.forEach((url) => URL.revokeObjectURL(url))
      if (!cancelled()) setBusy(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(timeout)
      refreshRequest.current += 1
    }
  }, [refresh])

  const releasePreviewUrl = useCallback((url: string) => {
    window.setTimeout(() => {
      if (!liveUrls.current.has(url)) URL.revokeObjectURL(url)
    }, previewUrlReleaseDelayMs)
  }, [])

  useEffect(() => {
    const urls = Object.values(previewUrls)
    liveUrls.current = new Set(urls)
    return () => {
      liveUrls.current = new Set()
      urls.forEach(releasePreviewUrl)
    }
  }, [previewUrls, releasePreviewUrl])

  useEffect(
    () => () => {
      previewRefreshRequest.current?.abort()
      previewRefreshRequest.current = undefined
    },
    [],
  )

  useEffect(() => {
    if (previewRefreshMessage === undefined) return
    const timeout = window.setTimeout(
      () => setPreviewRefreshMessage(undefined),
      refreshMessageDurationMs,
    )
    return () => window.clearTimeout(timeout)
  }, [previewRefreshMessage])

  async function createCard() {
    setError(undefined)
    try {
      const card = await createInventoryCard(createInitialEditorDocument())
      void navigate(`/build/${encodeURIComponent(card.id)}`)
    } catch (caught: unknown) {
      setError(errorMessage(caught))
    }
  }

  async function duplicateCard(id: string) {
    setError(undefined)
    try {
      const card = await duplicateInventoryCard(id)
      await refresh(card.id)
    } catch (caught: unknown) {
      setError(errorMessage(caught))
    }
  }

  async function deleteCard(id: string) {
    setError(undefined)
    try {
      await deleteInventoryCard(id)
      await refresh()
    } catch (caught: unknown) {
      setError(errorMessage(caught))
    }
  }

  async function refreshPreviews() {
    if (previewRefreshRequest.current) return
    const controller = new AbortController()
    previewRefreshRequest.current = controller
    const active = () => previewRefreshRequest.current === controller
    setError(undefined)
    setPreviewRefreshMessage(undefined)
    setPreviewRefresh({ cardId: undefined, completed: 0, total: cards.length })
    try {
      const result = await refreshInventoryPreviews({
        onCardRendered: (cardId) => {
          if (!active()) return
          void readInventoryPreview(cardId).then((preview) => {
            if (!active() || !preview) return
            const url = URL.createObjectURL(preview.image)
            setPreviewUrls((current) => ({ ...current, [cardId]: url }))
          })
        },
        onProgress: (progress) => {
          if (active()) setPreviewRefresh(progress)
        },
        signal: controller.signal,
      })
      if (!active()) return
      if (result.failed.length > 0) {
        setError(
          `${result.failed.length} card${result.failed.length === 1 ? "" : "s"} could not be updated: ${result.failed.join(", ")}.`,
        )
      } else {
        setPreviewRefreshMessage(
          `Updated ${result.updated} ${result.updated === 1 ? "preview" : "previews"}.`,
        )
      }
      await refresh()
    } catch (caught: unknown) {
      if (!active() || controller.signal.aborted) return
      setError(errorMessage(caught))
    } finally {
      if (active()) {
        previewRefreshRequest.current = undefined
        setPreviewRefresh(undefined)
      }
    }
  }

  function cancelPreviewRefresh() {
    if (!previewRefreshRequest.current) return
    previewRefreshRequest.current.abort()
    previewRefreshRequest.current = undefined
    setPreviewRefresh(undefined)
    // Cards committed before the cancellation keep their new previews, so the gallery is re-read.
    setPreviewRefreshMessage("Preview update cancelled.")
    void refresh()
  }

  return {
    busy,
    cancelPreviewRefresh,
    cards,
    createCard,
    deleteCard,
    duplicateCard,
    error,
    previewRefresh,
    previewRefreshMessage,
    renderingCardId: previewRefresh?.cardId,
    previewStatus,
    previewUrls,
    refreshPreviews,
    selectedCardId,
    setSelectedCardId,
    storageMode: getInventoryStorageMode(),
  }
}
