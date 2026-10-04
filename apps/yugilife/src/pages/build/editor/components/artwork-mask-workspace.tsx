import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import {
  isQuickSelectionWorkerAbortError,
  QuickSelectionWorkerClient,
} from "@/lib/pin-mask/quick-selection-worker-client"
import { resampleAlpha } from "@/lib/pin-mask/resample-alpha"
import { useShape } from "@/lib/shape-context"
import { cn, errorMessage } from "@/lib/utils"

import { selectedArtworkMask } from "../model/artwork-mask-state"

import {
  createWorkspaceMaskPixels,
  createWorkspaceMaskSurfaces,
  drawWorkspaceStripes,
  loadWorkspaceSource,
  workspaceDimensions,
} from "./artwork-mask-canvas"

import type { ArtworkMaskEditingState } from "../model/editor-document"
import type { ArtworkWorkspaceSource } from "./artwork-mask-canvas"
import type {
  ArtworkMaskChannel,
  ProcessedArtworkMaskPixels,
} from "@/lib/pin-mask/artwork-mask-effects"
import type { PinMaskPoint } from "@/lib/pin-mask/quick-selection"

export type ArtworkEditorTool = PinMaskPoint["polarity"] | "select"

export interface ArtworkMaskWorkspaceProps {
  artwork: Blob
  mask: ArtworkMaskEditingState
  maskChannel: ArtworkMaskChannel
  artworkEffectsError?: string | undefined
  processedMaskBusy: boolean
  getProcessedMaskPixels: () => ProcessedArtworkMaskPixels | undefined
  processedMaskRevision: number
  onMaskChange: (mask: ArtworkMaskEditingState) => void
  onMaskComplete?: (artwork: Blob, points: ArtworkMaskEditingState["points"], mask: Blob) => void
  onRetryArtworkEffects?: () => void
  onSelectedPinChange: (id: number | null) => void
  pinSize: number
  selectedPinId: number | null
  tool: ArtworkEditorTool
}

function artworkCanvasPoint(
  clientX: number,
  clientY: number,
  target: HTMLCanvasElement,
  coordinateWidth: number,
  coordinateHeight: number,
): { x: number; y: number; scale: number } | undefined {
  const bounds = target.getBoundingClientRect()
  if (bounds.width === 0 || bounds.height === 0) return undefined
  const scale = Math.min(bounds.width / coordinateWidth, bounds.height / coordinateHeight)
  return {
    scale,
    x: Math.max(
      0,
      Math.min(coordinateWidth - 1, ((clientX - bounds.left) / bounds.width) * coordinateWidth),
    ),
    y: Math.max(
      0,
      Math.min(coordinateHeight - 1, ((clientY - bounds.top) / bounds.height) * coordinateHeight),
    ),
  }
}

function nearestArtworkPin(
  points: readonly PinMaskPoint[],
  point: { x: number; y: number },
  scale: number,
) {
  let nearest: PinMaskPoint | undefined
  let distance = Number.POSITIVE_INFINITY
  for (const candidate of points) {
    const current = Math.hypot(candidate.x - point.x, candidate.y - point.y)
    if (current < distance) {
      distance = current
      nearest = candidate
    }
  }
  if (!nearest) return undefined
  const threshold = Math.max(16 / scale, nearest.size / 2 + 7 / scale)
  return distance <= threshold ? nearest : undefined
}

export function ArtworkMaskWorkspace({
  artwork,
  mask,
  maskChannel,
  artworkEffectsError,
  processedMaskBusy,
  getProcessedMaskPixels,
  processedMaskRevision,
  onMaskChange,
  onMaskComplete,
  onRetryArtworkEffects,
  onSelectedPinChange,
  pinSize,
  selectedPinId,
  tool,
}: ArtworkMaskWorkspaceProps) {
  const shape = useShape()
  const canvas = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef(mask)
  // The saved manual mask already represents these pins. Restore it without preparing and
  // refining the artwork again; the first actual pin edit invalidates this snapshot.
  const restoredPinsRef = useRef(
    mask.manualMask && mask.manualMask !== mask.automaticMask ? mask.points : undefined,
  )
  const pointsRef = useRef(mask.points)
  const selectedPinRef = useRef(selectedPinId)
  const drawFrameRef = useRef<((phase: number) => void) | undefined>(undefined)
  const activeRenderTokenRef = useRef<symbol | undefined>(undefined)
  const stripePhaseRef = useRef(0)
  const stripeTimestampRef = useRef<number | undefined>(undefined)
  const isDraggingRef = useRef(false)
  const dragRef = useRef<
    | {
        moved: boolean
        pinId: number
        pointerId: number
        startX: number
        startY: number
        x: number
        y: number
      }
    | undefined
  >(undefined)
  const preparingRef = useRef(false)
  const preparedSourceRef = useRef<ArtworkWorkspaceSource | undefined>(undefined)
  const sourceRef = useRef<ArtworkWorkspaceSource | undefined>(undefined)
  const sourceRequestRef = useRef(0)
  const workerRef = useRef<QuickSelectionWorkerClient | undefined>(undefined)
  const workerOperationRef = useRef(0)
  // Native-size pixel planes stay in refs so React never has to retain or inspect them as state.
  // Revisions below are the small invalidation signals that drive the render effects.
  const sourcePixelsRef = useRef<ImageData | undefined>(undefined)
  const selectionRef = useRef<Uint8Array | undefined>(undefined)
  const [source, setSource] = useState<ArtworkWorkspaceSource>()
  const [preparedRevision, setPreparedRevision] = useState(0)
  const [selectionRetry, setSelectionRetry] = useState(0)
  const [selectionRevision, setSelectionRevision] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [workerBusy, setWorkerBusy] = useState(false)
  const [status, setStatus] = useState<string>()
  const [paintedMaskRevisions, setPaintedMaskRevisions] = useState({ selection: 0, effects: 0 })
  const workspaceBusy =
    workerBusy ||
    processedMaskBusy ||
    (!status &&
      (paintedMaskRevisions.selection !== selectionRevision ||
        paintedMaskRevisions.effects !== processedMaskRevision))

  useEffect(() => {
    maskRef.current = mask
    pointsRef.current = mask.points
    selectedPinRef.current = selectedPinId
  }, [mask, selectedPinId])

  useEffect(() => {
    if (tool !== "select" && selectedPinId !== null) onSelectedPinChange(null)
  }, [onSelectedPinChange, selectedPinId, tool])

  useEffect(() => {
    if (selectedPinId !== null && !mask.points.some(({ id }) => id === selectedPinId)) {
      onSelectedPinChange(null)
    }
  }, [mask.points, onSelectedPinChange, selectedPinId])

  useEffect(
    () => () => {
      isDraggingRef.current = false
      dragRef.current = undefined
      activeRenderTokenRef.current = undefined
      drawFrameRef.current = undefined
    },
    [],
  )

  useEffect(() => {
    const requestId = sourceRequestRef.current + 1
    sourceRequestRef.current = requestId
    onSelectedPinChange(null)
    sourceRef.current = undefined
    preparedSourceRef.current = undefined
    activeRenderTokenRef.current = undefined
    drawFrameRef.current = undefined
    workerOperationRef.current += 1
    preparingRef.current = false
    let cancelled = false
    const reset = window.setTimeout(() => {
      if (cancelled || requestId !== sourceRequestRef.current || sourceRef.current) return
      setSource(undefined)
      sourcePixelsRef.current = undefined
      selectionRef.current = undefined
      setSelectionRevision((revision) => revision + 1)
      setPreparing(false)
      setWorkerBusy(false)
      setStatus(undefined)
    }, 0)
    const activeMask = selectedArtworkMask(maskRef.current)
    restoredPinsRef.current =
      maskRef.current.manualMask && maskRef.current.manualMask !== maskRef.current.automaticMask
        ? maskRef.current.points
        : undefined
    void loadWorkspaceSource(artwork, activeMask)
      .then((next) => {
        if (cancelled || requestId !== sourceRequestRef.current) {
          next.artwork.close()
          next.mask?.close()
          return
        }
        sourcePixelsRef.current = undefined
        selectionRef.current = undefined
        setSelectionRevision((revision) => revision + 1)
        setPreparing(false)
        setWorkerBusy(false)
        setStatus(undefined)
        sourceRef.current = next
        setSource(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled && requestId === sourceRequestRef.current) {
          setWorkerBusy(false)
          setStatus(errorMessage(reason))
        }
      })
    return () => {
      cancelled = true
      if (sourceRequestRef.current === requestId) sourceRequestRef.current += 1
      window.clearTimeout(reset)
      workerRef.current?.dispose()
      workerRef.current = undefined
      preparedSourceRef.current = undefined
    }
  }, [artwork, mask.automaticMask, mask.mode, onSelectedPinChange])

  useEffect(
    () => () => {
      source?.artwork.close()
      source?.mask?.close()
    },
    [source],
  )

  useEffect(() => {
    if (!source || preparedSourceRef.current !== source || mask.mode !== "manual") {
      return
    }
    let cancelled = false
    const worker = workerRef.current
    if (!worker) return
    const operationId = ++workerOperationRef.current
    setWorkerBusy(true)
    setStatus(undefined)
    void worker
      .refineEncoded(mask.points)
      .then(({ mask: next, blob: manualMask }) => {
        if (cancelled || preparedSourceRef.current !== source) return
        selectionRef.current = next
        setSelectionRevision((revision) => revision + 1)
        setStatus(undefined)
        if (onMaskComplete) onMaskComplete(artwork, mask.points, manualMask)
        else if (maskRef.current.points === mask.points)
          onMaskChange({ ...maskRef.current, manualMask })
      })
      .catch((reason: unknown) => {
        if (!cancelled && !isQuickSelectionWorkerAbortError(reason)) {
          setStatus(errorMessage(reason))
        }
      })
      .finally(() => {
        if (workerOperationRef.current === operationId) setWorkerBusy(false)
      })
    return () => {
      cancelled = true
      if (workerOperationRef.current === operationId) workerOperationRef.current += 1
    }
  }, [artwork, mask.mode, mask.points, onMaskChange, onMaskComplete, preparedRevision, source])

  useEffect(() => {
    const target = canvas.current
    // A newly refined raw mask is document data, not a completed presentation. Preserve the
    // previous canvas until its requested effects frame is ready; never paint intermediate alpha.
    if (!target || !source || processedMaskBusy) return
    // Assigning canvas dimensions clears its bitmap. Keep the last completed frame visible while
    // a new mask-effects job is prepared; only resize when the source itself changed.
    const displaySize = workspaceDimensions(source.artwork.width, source.artwork.height)
    if (target.width !== displaySize.width) target.width = displaySize.width
    if (target.height !== displaySize.height) target.height = displaySize.height
    const context = target.getContext("2d")
    if (!context) return

    // Build the expensive shaded/masked artwork once. Animation frames only copy this cached
    // surface and paint the lightweight stripe and pin overlays, which keeps large AVIFs responsive
    // while a user places dots. Anti-aliasing and glow have already been derived by the app-owned
    // pin-mask worker and arrive here as a display mask pixel plane. During replacement work the
    // last canvas bitmap remains visible, but its old animation closure is released.
    let cancelled = false
    const renderToken = Symbol("artwork-mask-render")

    const prepare = () => {
      const sourceWidth = source.artwork.width
      const sourceHeight = source.artwork.height
      const { height, width } = workspaceDimensions(sourceWidth, sourceHeight)
      const selection = selectionRef.current
      const sourcePixels = sourcePixelsRef.current
      const refinedSourcePixels =
        mask.mode === "manual" && selection && sourcePixels && preparedSourceRef.current === source
          ? sourcePixels
          : undefined
      const refinedSelection =
        refinedSourcePixels && selection
          ? resampleAlpha(selection, sourceWidth, sourceHeight, width, height)
          : undefined
      const sourceMaskPixels = createWorkspaceMaskPixels(
        source,
        width,
        height,
        maskChannel,
        refinedSelection,
        getProcessedMaskPixels(),
      )
      const renderMaskPixels = sourceMaskPixels
      if (cancelled) return

      const base = document.createElement("canvas")
      base.width = width
      base.height = height
      const baseContext = base.getContext("2d")
      if (!baseContext) return
      const surfaces = renderMaskPixels
        ? createWorkspaceMaskSurfaces(renderMaskPixels, width, height)
        : undefined
      if (refinedSourcePixels && refinedSelection && renderMaskPixels) {
        const shaded = baseContext.createImageData(width, height)
        for (let index = 0; index < refinedSelection.length; index += 1) {
          const offset = index * 4
          const processedAlpha = renderMaskPixels[offset + 3] ?? refinedSelection[index]!
          const brightness = 0.3 + (processedAlpha / 255) * 0.7
          shaded.data[offset] = Math.round(refinedSourcePixels.data[offset]! * brightness)
          shaded.data[offset + 1] = Math.round(refinedSourcePixels.data[offset + 1]! * brightness)
          shaded.data[offset + 2] = Math.round(refinedSourcePixels.data[offset + 2]! * brightness)
          shaded.data[offset + 3] = refinedSourcePixels.data[offset + 3]!
        }
        baseContext.putImageData(shaded, 0, 0)
      } else {
        baseContext.drawImage(source.artwork, 0, 0, width, height)
        if (surfaces) {
          baseContext.save()
          baseContext.globalAlpha = 0.75
          baseContext.globalCompositeOperation = "multiply"
          baseContext.drawImage(surfaces.foreground, 0, 0)
          baseContext.restore()
        }
      }

      const stripeCanvas = document.createElement("canvas")
      stripeCanvas.width = width
      stripeCanvas.height = height
      const backgroundMask = surfaces?.background

      const drawFrame = (phase: number) => {
        context.clearRect(0, 0, width, height)
        context.drawImage(base, 0, 0)
        drawWorkspaceStripes(context, stripeCanvas, backgroundMask, width, height, phase)
        if (mask.mode !== "manual") return
        const activeDrag = dragRef.current
        const displayScale = Math.min(width / sourceWidth, height / sourceHeight)
        for (const point of pointsRef.current) {
          const sourceX = activeDrag?.pinId === point.id ? activeDrag.x : point.x
          const sourceY = activeDrag?.pinId === point.id ? activeDrag.y : point.y
          const x = sourceX * (width / sourceWidth)
          const y = sourceY * (height / sourceHeight)
          const radius = Math.max(3, point.size * displayScale * 0.5)
          if (point.id === selectedPinRef.current) {
            context.beginPath()
            context.arc(x, y, radius + Math.max(5, width / 180), 0, Math.PI * 2)
            context.lineWidth = Math.max(2, width / 350)
            context.strokeStyle = "#ffffff"
            context.stroke()
          }
          context.beginPath()
          context.arc(x, y, radius, 0, Math.PI * 2)
          context.fillStyle = point.polarity === "keep" ? "#63e2a055" : "#ff748055"
          context.fill()
          context.lineWidth = Math.max(2, width / 500)
          context.strokeStyle = point.polarity === "keep" ? "#63e2a0" : "#ff7480"
          context.stroke()
        }
      }

      // Publish the new frame atomically. Until this point the previous completed bitmap remains
      // visible, so changing a control cannot blank the workspace while the worker runs.
      activeRenderTokenRef.current = renderToken
      drawFrameRef.current = drawFrame
      drawFrame(stripePhaseRef.current)
      setPaintedMaskRevisions({ selection: selectionRevision, effects: processedMaskRevision })
      const reducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (reducedMotion) return
      const animate = (timestamp: number) => {
        if (activeRenderTokenRef.current !== renderToken) return
        const elapsed =
          stripeTimestampRef.current === undefined ? 0 : timestamp - stripeTimestampRef.current
        stripeTimestampRef.current = timestamp
        if (!isDraggingRef.current) {
          stripePhaseRef.current += elapsed * 0.024
          drawFrame(stripePhaseRef.current)
        }
        window.requestAnimationFrame(animate)
      }
      window.requestAnimationFrame(animate)
    }

    queueMicrotask(() => {
      if (cancelled) return
      try {
        prepare()
      } catch (reason: unknown) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setStatus(errorMessage(reason))
        }
      }
    })
    return () => {
      cancelled = true
      // Keep the last bitmap on the canvas, but release the old frame closure and stop its RAF
      // immediately. Otherwise a superseded native-size surface stays reachable while a new mask
      // is being prepared, needlessly doubling the peak during an effects update.
      if (activeRenderTokenRef.current === renderToken) {
        activeRenderTokenRef.current = undefined
        drawFrameRef.current = undefined
        stripeTimestampRef.current = undefined
      }
    }
  }, [
    getProcessedMaskPixels,
    mask.mode,
    maskChannel,
    processedMaskRevision,
    processedMaskBusy,
    selectionRevision,
    source,
  ])

  useEffect(() => {
    if (mask.mode === "manual") drawFrameRef.current?.(stripePhaseRef.current)
  }, [mask.mode, mask.points, selectedPinId])

  const prepareEngine = useCallback(() => {
    if (
      !source ||
      sourceRef.current !== source ||
      preparedSourceRef.current === source ||
      preparingRef.current
    ) {
      return
    }
    const preparedSource = source
    const requestId = sourceRequestRef.current
    preparingRef.current = true
    setPreparing(true)
    setWorkerBusy(true)
    setStatus("Preparing dot mask…")
    const displaySize = workspaceDimensions(source.artwork.width, source.artwork.height)
    const displayCanvas = document.createElement("canvas")
    displayCanvas.width = displaySize.width
    displayCanvas.height = displaySize.height
    const displayContext = displayCanvas.getContext("2d", { willReadFrequently: true })
    if (!displayContext) {
      preparingRef.current = false
      setPreparing(false)
      setWorkerBusy(false)
      setStatus("A 2D canvas context is required to edit artwork.")
      return
    }
    displayContext.drawImage(source.artwork, 0, 0, displaySize.width, displaySize.height)
    sourcePixelsRef.current = displayContext.getImageData(
      0,
      0,
      displaySize.width,
      displaySize.height,
    )
    workerRef.current?.dispose()
    workerRef.current = undefined
    let worker: QuickSelectionWorkerClient
    try {
      worker = new QuickSelectionWorkerClient()
    } catch (reason) {
      preparingRef.current = false
      setPreparing(false)
      setWorkerBusy(false)
      setStatus(reason instanceof Error ? reason.message : "A pin mask worker could not start.")
      return
    }
    workerRef.current = worker
    const operationId = ++workerOperationRef.current
    void createImageBitmap(source.artwork)
      .then((bitmap) => {
        if (requestId !== sourceRequestRef.current || sourceRef.current !== preparedSource) {
          bitmap.close()
          return
        }
        return worker.prepareBitmap(bitmap)
      })
      .then(() => {
        if (requestId !== sourceRequestRef.current || sourceRef.current !== preparedSource) return
        preparedSourceRef.current = preparedSource
        setPreparedRevision((revision) => revision + 1)
        setStatus(undefined)
      })
      .catch((reason: unknown) => {
        if (requestId !== sourceRequestRef.current || sourceRef.current !== preparedSource) return
        setStatus(errorMessage(reason))
      })
      .finally(() => {
        if (requestId !== sourceRequestRef.current || sourceRef.current !== preparedSource) return
        preparingRef.current = false
        setPreparing(false)
        if (workerOperationRef.current === operationId) setWorkerBusy(false)
      })
  }, [source])

  useEffect(() => {
    if (
      mask.mode !== "manual" ||
      mask.points === restoredPinsRef.current ||
      !source ||
      preparedSourceRef.current === source ||
      preparingRef.current
    )
      return
    prepareEngine()
  }, [mask.mode, mask.points, prepareEngine, source, selectionRetry])

  const updatePoints = useCallback(
    (points: readonly PinMaskPoint[]) => {
      const current = maskRef.current
      const next = {
        ...current,
        mode: "manual" as const,
        points,
      }
      maskRef.current = next
      pointsRef.current = points
      onMaskChange(next)
    },
    [onMaskChange],
  )

  const resumeStripeAnimation = () => {
    isDraggingRef.current = false
    stripeTimestampRef.current = undefined
    drawFrameRef.current?.(stripePhaseRef.current)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation()
    if (
      !source ||
      mask.mode !== "manual" ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return
    }
    const target = event.currentTarget
    const point = artworkCanvasPoint(
      event.clientX,
      event.clientY,
      target,
      source.artwork.width,
      source.artwork.height,
    )
    if (!point) return
    const currentMask = maskRef.current
    const hit = nearestArtworkPin(currentMask.points, point, point.scale)
    if (hit) {
      selectedPinRef.current = hit.id
      onSelectedPinChange(hit.id)
      isDraggingRef.current = true
      dragRef.current = {
        moved: false,
        pinId: hit.id,
        pointerId: event.pointerId,
        startX: hit.x,
        startY: hit.y,
        x: hit.x,
        y: hit.y,
      }
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture is unavailable in a few embedded browser surfaces.
      }
      drawFrameRef.current?.(stripePhaseRef.current)
      return
    }
    if (tool === "select") {
      selectedPinRef.current = null
      onSelectedPinChange(null)
      drawFrameRef.current?.(stripePhaseRef.current)
      return
    }
    const nextPoint: PinMaskPoint = {
      id: Math.max(0, ...currentMask.points.map(({ id }) => id)) + 1,
      polarity: tool,
      size: pinSize,
      x: point.x,
      y: point.y,
    }
    onSelectedPinChange(null)
    updatePoints([...currentMask.points, nextPoint])
    drawFrameRef.current?.(stripePhaseRef.current)
    prepareEngine()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!source) return
    event.stopPropagation()
    const target = event.currentTarget
    const point = artworkCanvasPoint(
      event.clientX,
      event.clientY,
      target,
      source.artwork.width,
      source.artwork.height,
    )
    if (!point) return
    drag.moved = drag.moved || point.x !== drag.startX || point.y !== drag.startY
    drag.x = point.x
    drag.y = point.y
    drawFrameRef.current?.(stripePhaseRef.current)
  }

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      if (!drag) resumeStripeAnimation()
      return
    }
    event.stopPropagation()
    if (!cancelled && drag.moved) {
      const current = maskRef.current
      updatePoints(
        current.points.map((candidate) =>
          candidate.id === drag.pinId ? { ...candidate, x: drag.x, y: drag.y } : candidate,
        ),
      )
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = undefined
    resumeStripeAnimation()
  }

  const onContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!source || mask.mode !== "manual") return
    const point = artworkCanvasPoint(
      event.clientX,
      event.clientY,
      event.currentTarget,
      source.artwork.width,
      source.artwork.height,
    )
    if (!point) return
    const hit = nearestArtworkPin(maskRef.current.points, point, point.scale)
    if (!hit) return
    updatePoints(maskRef.current.points.filter(({ id }) => id !== hit.id))
    onSelectedPinChange(null)
  }

  return (
    <div className="relative flex size-full min-h-0 items-center justify-center p-4">
      <div className="relative flex max-h-full max-w-full shrink-0">
        <canvas
          ref={canvas}
          aria-label={
            mask.mode === "manual" ? "Artwork dot mask workspace" : "Artwork image mask preview"
          }
          className={`block max-h-full max-w-full object-contain ${
            mask.mode === "manual"
              ? tool === "select"
                ? "pointer-events-auto cursor-default"
                : "pointer-events-auto cursor-crosshair"
              : "pointer-events-none"
          }`}
          onPointerCancel={
            mask.mode === "manual" ? (event) => finishPointer(event, true) : undefined
          }
          onPointerDown={mask.mode === "manual" ? onPointerDown : undefined}
          onPointerMove={mask.mode === "manual" ? onPointerMove : undefined}
          onPointerUp={mask.mode === "manual" ? finishPointer : undefined}
          onContextMenu={mask.mode === "manual" ? onContextMenu : undefined}
        />
        {source && (
          <span
            aria-live={workspaceBusy ? "polite" : undefined}
            className={cn(
              "text-title text-foreground bg-surface-3 absolute bottom-full left-0 mb-2 inline-flex items-center gap-1.5 px-1.5 py-1 font-bold tabular-nums",
              shape.item,
            )}
          >
            {mask.mode === "manual" ? "Dot mask workspace" : "Image mask preview"}
            {workspaceBusy && (
              <LoadingSpinner
                aria-label={
                  processedMaskBusy
                    ? "Updating mask preview"
                    : preparing
                      ? "Preparing dot mask"
                      : "Updating dot mask"
                }
                className="h-5 w-7"
                size="compact"
              />
            )}
          </span>
        )}
      </div>
      {((status && !preparing) || artworkEffectsError) && (
        <div
          role="alert"
          className="bg-background/90 text-caption text-foreground absolute right-3 bottom-3 left-3 p-2"
        >
          {artworkEffectsError && (
            <div>
              Mask effects could not update: {artworkEffectsError}
              {onRetryArtworkEffects && (
                <Button variant="ghost" onClick={onRetryArtworkEffects}>
                  Retry mask effects
                </Button>
              )}
            </div>
          )}
          {status && !preparing && (
            <div>
              {status}
              {mask.mode === "manual" && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    workerRef.current?.dispose()
                    workerRef.current = undefined
                    preparedSourceRef.current = undefined
                    restoredPinsRef.current = undefined
                    setStatus(undefined)
                    setSelectionRetry((value) => value + 1)
                  }}
                >
                  Retry dot mask
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
