import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  disposeArtworkMaskWorker,
  hasArtworkMaskEffects,
  processArtworkMaskBlob,
  processArtworkMaskSource,
} from "@/lib/pin-mask/artwork-mask-effects"
import { isQuickSelectionWorkerAbortError } from "@/lib/pin-mask/quick-selection-worker-client"

import {
  canPresentArtworkMaskFrame,
  isArtworkMaskFrameCurrent,
} from "../editor/model/artwork-mask-frame"
import {
  requireCompletedArtworkMask,
  selectedArtworkMask as selectArtworkMask,
} from "../editor/model/artwork-mask-state"
import { artworkEditorConfig } from "../editor/model/editor-config"

import type { ArtworkMaskFrameIdentity } from "../editor/model/artwork-mask-frame"
import type { EditorDocumentState } from "../editor/model/editor-document"
import type { ProcessedArtworkMaskPixels } from "@/lib/pin-mask/artwork-mask-effects"
import type { CardTemplate } from "yugilife-core"

type MaskChannel = "alpha" | "luminance"

interface CompletedMaskSource {
  artwork: Blob
  source: Blob
  channel: MaskChannel
  mode: EditorDocumentState["artworkMask"]["mode"]
}

function artworkMaskEffectsKey(effects: { antiAlias?: boolean; glow?: number } | undefined) {
  return `${effects?.antiAlias === true ? "1" : "0"}:${effects?.glow ?? 0}`
}

interface ArtworkMaskPreviewInput {
  readonly artwork: EditorDocumentState["card"]["artwork"]
  readonly artworkMask: EditorDocumentState["artworkMask"]
  readonly artworkMaskEffects: EditorDocumentState["artworkMaskEffects"]
  readonly ready: boolean
  readonly template: CardTemplate
}

export function useArtworkMaskPreview({
  artwork,
  artworkMask,
  artworkMaskEffects,
  ready,
  template,
}: ArtworkMaskPreviewInput) {
  const config = useMemo(() => artworkEditorConfig(template), [template])
  const currentMaskSource = selectArtworkMask(artworkMask)
  const [completedMaskSource, setCompletedMaskSource] = useState<CompletedMaskSource>()
  // Only the live preview may bridge a pending pin edit with the previous completed source.
  const selectedArtworkMask =
    currentMaskSource ??
    (artworkMask.mode === "manual" &&
    completedMaskSource?.mode === "manual" &&
    completedMaskSource.artwork === artwork &&
    completedMaskSource.channel === config.maskChannel
      ? completedMaskSource.source
      : undefined)
  if (
    currentMaskSource &&
    artwork instanceof Blob &&
    (completedMaskSource?.source !== currentMaskSource ||
      completedMaskSource.artwork !== artwork ||
      completedMaskSource.mode !== artworkMask.mode ||
      completedMaskSource.channel !== config.maskChannel)
  ) {
    setCompletedMaskSource({
      artwork,
      source: currentMaskSource,
      mode: artworkMask.mode,
      channel: config.maskChannel,
    })
  } else if (
    !currentMaskSource &&
    (!artwork || artworkMask.mode === "automatic") &&
    completedMaskSource
  ) {
    setCompletedMaskSource(undefined)
  }

  const effects = config.maskField ? artworkMaskEffects[config.maskField] : undefined
  const [processedArtwork, setProcessedArtwork] = useState<
    ArtworkMaskFrameIdentity & { blob?: Blob }
  >()
  // Native pixels stay in the worker; this ref holds only the bounded workspace preview.
  const processedPixelsRef = useRef<
    (ArtworkMaskFrameIdentity & { pixels: ProcessedArtworkMaskPixels }) | undefined
  >(undefined)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const [failedFrame, setFailedFrame] = useState<ArtworkMaskFrameIdentity>()
  const effectsKey = useMemo(() => artworkMaskEffectsKey(effects), [effects])
  const effectsActive = hasArtworkMaskEffects(effects)
  const requestedFrame = useMemo<ArtworkMaskFrameIdentity | undefined>(
    () =>
      ready && effectsActive && artwork instanceof Blob && selectedArtworkMask
        ? {
            artwork,
            source: selectedArtworkMask,
            mode: artworkMask.mode,
            channel: config.maskChannel,
            effectsKey,
          }
        : undefined,
    [
      ready,
      effectsActive,
      artwork,
      selectedArtworkMask,
      artworkMask.mode,
      config.maskChannel,
      effectsKey,
    ],
  )
  // Derived in render so there is no frame where a replacement is pending but reported complete.
  const busy =
    !!requestedFrame &&
    !isArtworkMaskFrameCurrent(processedArtwork, requestedFrame) &&
    !isArtworkMaskFrameCurrent(failedFrame, requestedFrame)
  const processedArtworkMask =
    processedArtwork && canPresentArtworkMaskFrame(processedArtwork, requestedFrame)
      ? processedArtwork.blob
      : undefined
  const getProcessedArtworkMaskPixels = useCallback(() => {
    const current = processedPixelsRef.current
    return current && canPresentArtworkMaskFrame(current, requestedFrame)
      ? current.pixels
      : undefined
  }, [requestedFrame])

  const requestCounter = useRef(0)
  useEffect(() => {
    const requestId = (requestCounter.current += 1)
    const controller = new AbortController()
    const identity = requestedFrame
    const source = selectedArtworkMask
    const isCurrent = () => !controller.signal.aborted && requestCounter.current === requestId
    if (!identity || !source || effects === undefined || !hasArtworkMaskEffects(effects)) {
      return () => controller.abort()
    }
    if (isArtworkMaskFrameCurrent(processedPixelsRef.current, identity)) {
      return () => controller.abort()
    }
    setError(undefined)
    void processArtworkMaskSource(source, effects, config.maskChannel, controller.signal)
      .then((processed) => {
        if (!isCurrent()) return
        processedPixelsRef.current = { ...identity, pixels: processed }
        setProcessedArtwork({ ...identity, blob: processed.blob })
        setFailedFrame(undefined)
        setRevision((value) => value + 1)
      })
      .catch((reason: unknown) => {
        if (!isCurrent()) return
        setFailedFrame(identity)
        if (isQuickSelectionWorkerAbortError(reason)) return
        setError(reason instanceof Error ? reason.message : "Unable to process the mask.")
        setRevision((value) => value + 1)
      })
    return () => controller.abort()
  }, [config.maskChannel, effects, selectedArtworkMask, requestedFrame, retryCount])

  useEffect(
    () => () => {
      processedPixelsRef.current = undefined
      disposeArtworkMaskWorker()
    },
    [],
  )

  // Durable operations reuse only an exact completed frame and never publish into the preview.
  async function processedMaskForDocument(document: EditorDocumentState, forTemplate = template) {
    const documentConfig = artworkEditorConfig(forTemplate)
    requireCompletedArtworkMask(document, documentConfig.field)
    const source = selectArtworkMask(document.artworkMask)
    if (!source) return undefined
    const documentEffects = documentConfig.maskField
      ? document.artworkMaskEffects[documentConfig.maskField]
      : undefined
    if (
      processedArtwork?.blob &&
      processedArtwork.source === source &&
      processedArtwork.channel === documentConfig.maskChannel &&
      processedArtwork.effectsKey === artworkMaskEffectsKey(documentEffects)
    ) {
      return processedArtwork.blob
    }
    return processArtworkMaskBlob(source, documentEffects, documentConfig.maskChannel)
  }

  function retryArtworkEffects() {
    disposeArtworkMaskWorker()
    setFailedFrame(undefined)
    setError(undefined)
    setRetryCount((value) => value + 1)
  }

  return {
    artworkConfig: config,
    artworkEffectsError: requestedFrame ? error : undefined,
    getProcessedArtworkMaskPixels,
    processedArtworkBusy: busy,
    processedArtworkMask,
    processedArtworkRevision: revision,
    processedMaskForDocument,
    retryArtworkEffects,
    selectedArtworkMask,
  }
}
