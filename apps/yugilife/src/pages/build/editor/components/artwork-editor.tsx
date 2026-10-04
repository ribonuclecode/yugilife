import { useState } from "react"

import { Download, Eraser, Minus, MousePointer2, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { NumberInput } from "@/components/ui/number-input"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip } from "@/components/ui/tooltip"
import { powerSliderScale } from "@/lib/slider-scale"

import { TransformSlider } from "./artwork-transform-controls"
import {
  formatPosition,
  POSITION_STEP,
  positionNudge,
  useRafCoalescedArtworkTransform,
} from "./artwork-transform-input"
import { MaskImageInput } from "./mask-image-input"

import type { ArtworkMaskEditingState, ArtworkMaskEffects } from "../model/editor-document"
import type { ArtworkEditorTool } from "./artwork-mask-workspace"
import type { ArtworkTransform } from "yugilife-core"

const PIN_SIZE_MIN = 4
const PIN_SIZE_MAX = 128
const ARTWORK_ZOOM_MAX = 2.5
// Keep fine control over small seeds without changing the stored semantic size values.
const PIN_SIZE_SCALE = powerSliderScale(32, 0.5)

interface ArtworkEditorProps {
  artwork: Blob
  canResetTransform: boolean
  mask: ArtworkMaskEditingState
  maskEffects: ArtworkMaskEffects | undefined
  onMaskChange: (mask: ArtworkMaskEditingState) => void
  onMaskEffectsChange: ((effects: ArtworkMaskEffects) => void) | undefined
  onSelectedPinChange: (id: number | null) => void
  onPinSizeChange: (size: number) => void
  onResetTransform: () => void
  onToolChange: (tool: ArtworkEditorTool) => void
  onTransformChange: (transform: ArtworkTransform) => void
  pinSize: number
  selectedPinId: number | null
  tool: ArtworkEditorTool
  transform: ArtworkTransform
}

export function ArtworkEditor({
  artwork,
  canResetTransform,
  mask,
  maskEffects,
  onMaskChange,
  onMaskEffectsChange,
  onSelectedPinChange,
  onPinSizeChange,
  onResetTransform,
  onToolChange,
  onTransformChange,
  pinSize,
  selectedPinId,
  tool,
  transform,
}: ArtworkEditorProps) {
  const transformWriter = useRafCoalescedArtworkTransform(onTransformChange)
  const [removedImageMask, setRemovedImageMask] = useState<{
    artwork: Blob
    mask: Blob
    replacement: Blob | undefined
  }>()
  const [clearedPins, setClearedPins] = useState<{
    artwork: Blob
    points: ArtworkMaskEditingState["points"]
  }>()
  const [initialDots, setInitialDots] = useState({ artwork, points: mask.points })
  if (initialDots.artwork !== artwork) {
    setInitialDots({ artwork, points: mask.points })
  }
  const selectedPin = mask.points.find(({ id }) => id === selectedPinId)
  const dotsChanged = mask.points !== initialDots.points
  const displayedPinSize = Math.max(
    PIN_SIZE_MIN,
    Math.min(PIN_SIZE_MAX, selectedPin && tool === "select" ? selectedPin.size : pinSize),
  )

  const changePinSize = (size: number) => {
    if (tool === "select" && selectedPin) {
      onMaskChange({
        ...mask,
        points: mask.points.map((point) =>
          point.id === selectedPin.id ? { ...point, size } : point,
        ),
      })
      return
    }
    onPinSizeChange(size)
  }

  const nudgePosition = (axis: "x" | "y", event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = positionNudge(event, axis)
    if (delta === undefined) return
    transformWriter.update(transform, (current) => ({
      ...current,
      [axis]: Math.max(-1, Math.min(1, Number((current[axis] + delta).toFixed(5)))),
    }))
  }

  const removeSelectedPin = () => {
    if (!selectedPin) return
    onMaskChange({
      ...mask,
      points: mask.points.filter(({ id }) => id !== selectedPin.id),
    })
    onSelectedPinChange(null)
  }

  const downloadDotMask = () => {
    if (!mask.manualMask) return
    const url = URL.createObjectURL(mask.manualMask)
    const link = document.createElement("a")
    link.href = url
    link.download = "yugilife-dot-mask.png"
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-subtitle font-medium">Artwork adjustments</h3>
          <Button
            disabled={!canResetTransform}
            leadingIcon={RotateCcw}
            size="default"
            type="button"
            variant="text"
            onClick={onResetTransform}
          >
            Reset crop
          </Button>
        </div>
        <TransformSlider
          formatValue={(value) => `${value.toFixed(2)}×`}
          label="Zoom"
          max={ARTWORK_ZOOM_MAX}
          min={1}
          value={transform.scale}
          onChange={(scale) => transformWriter.schedule({ ...transform, scale })}
          onChangeEnd={transformWriter.flush}
        />
        <TransformSlider
          formatValue={formatPosition}
          label="Horizontal position"
          max={1}
          min={-1}
          step={POSITION_STEP}
          value={transform.x}
          onChange={(x) => transformWriter.schedule({ ...transform, x })}
          onChangeEnd={transformWriter.flush}
          onKeyDownCapture={(event) => nudgePosition("x", event)}
        />
        <TransformSlider
          formatValue={formatPosition}
          label="Vertical position"
          max={1}
          min={-1}
          step={POSITION_STEP}
          value={transform.y}
          onChange={(y) => transformWriter.schedule({ ...transform, y })}
          onChangeEnd={transformWriter.flush}
          onKeyDownCapture={(event) => nudgePosition("y", event)}
        />
      </div>

      <div className="grid gap-3">
        <div className="grid gap-0.5">
          <h3 className="text-subtitle font-medium">Artwork mask</h3>
          <p className="text-caption text-muted-foreground">
            Image masks and dot masks are independent. Uploading an image mask does not change your
            pins.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            active={mask.mode === "automatic"}
            aria-pressed={mask.mode === "automatic"}
            type="button"
            variant="tertiary"
            onClick={() => {
              onMaskChange({ ...mask, mode: "automatic" })
              onSelectedPinChange(null)
            }}
          >
            Image mask
          </Button>
          <Button
            active={mask.mode === "manual"}
            aria-pressed={mask.mode === "manual"}
            type="button"
            variant="tertiary"
            onClick={() => {
              onMaskChange({
                ...mask,
                mode: "manual",
              })
              if (mask.mode !== "manual") {
                onToolChange("select")
                onSelectedPinChange(null)
              }
            }}
          >
            Dot mask
          </Button>
        </div>
        {mask.mode === "automatic" ? (
          <Field>
            <FieldLabel>Image mask</FieldLabel>
            <MaskImageInput
              artwork={artwork}
              value={mask.automaticMask}
              onChange={(automaticMask) => {
                if (mask.automaticMask && automaticMask !== mask.automaticMask)
                  setRemovedImageMask({
                    artwork,
                    mask: mask.automaticMask,
                    replacement: automaticMask,
                  })
                else setRemovedImageMask(undefined)
                onMaskChange({ ...mask, automaticMask })
              }}
            />
          </Field>
        ) : (
          <div className="grid gap-3">
            <h3 className="text-subtitle font-medium">Dot masking controls</h3>
            <div className="grid grid-cols-3 gap-2">
              <Button
                active={tool === "keep"}
                aria-pressed={tool === "keep"}
                leadingIcon={Plus}
                type="button"
                variant="tertiary"
                onClick={() => onToolChange("keep")}
              >
                Keep area
              </Button>
              <Button
                active={tool === "remove"}
                aria-pressed={tool === "remove"}
                leadingIcon={Minus}
                type="button"
                variant="tertiary"
                onClick={() => onToolChange("remove")}
              >
                Exclude area
              </Button>
              <Button
                active={tool === "select"}
                aria-pressed={tool === "select"}
                leadingIcon={MousePointer2}
                type="button"
                variant="tertiary"
                onClick={() => onToolChange("select")}
              >
                Select pin
              </Button>
            </div>
            <Slider
              formatValue={(value) => `${Math.round(value)}px`}
              label={selectedPin && tool === "select" ? "Selected pin size" : "New pin size"}
              max={PIN_SIZE_MAX}
              min={PIN_SIZE_MIN}
              scale={PIN_SIZE_SCALE}
              step={1}
              value={displayedPinSize}
              variant="scrubber"
              onChange={(value: number) => changePinSize(value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Tooltip
                content={
                  mask.manualMask
                    ? "Download the current dot mask"
                    : "Finish updating the dot mask before downloading it"
                }
              >
                <Button
                  className="w-full"
                  disabled={!mask.manualMask}
                  leadingIcon={Download}
                  type="button"
                  variant="tertiary"
                  onClick={downloadDotMask}
                >
                  Download mask
                </Button>
              </Tooltip>
              <ConfirmDialog
                confirmLabel="Reset dots"
                description="Return the dots to the set that was present when this artwork was opened. The dot mask will be recalculated."
                disabled={!dotsChanged}
                title="Reset dots?"
                onConfirm={() => {
                  onMaskChange({
                    ...mask,
                    mode: "manual",
                    points: initialDots.points,
                  })
                  onSelectedPinChange(null)
                  onToolChange("select")
                }}
                trigger={
                  <Button
                    className="w-full"
                    disabled={!dotsChanged}
                    leadingIcon={RotateCcw}
                    type="button"
                    variant="tertiary"
                  >
                    Reset dots
                  </Button>
                }
              />
              <ConfirmDialog
                confirmLabel="Clear all pins"
                description="This removes every keep and exclude pin, then recalculates the dot mask."
                disabled={mask.points.length === 0}
                title="Clear all pins?"
                onConfirm={() => {
                  setClearedPins({ artwork, points: mask.points })
                  onMaskChange({ ...mask, mode: "manual", points: [] })
                  onSelectedPinChange(null)
                }}
                trigger={
                  <Button className="w-full" leadingIcon={Eraser} type="button" variant="tertiary">
                    Clear all pins
                  </Button>
                }
              />
              <Tooltip content="Delete current pin">
                <Button
                  aria-label="Delete current pin"
                  className="w-full"
                  disabled={!selectedPin || tool !== "select"}
                  leadingIcon={Trash2}
                  type="button"
                  variant="tertiary"
                  onClick={removeSelectedPin}
                >
                  Delete current pin
                </Button>
              </Tooltip>
            </div>
          </div>
        )}
        {removedImageMask?.artwork === artwork &&
          mask.automaticMask === removedImageMask.replacement && (
            <Button
              variant="ghost"
              onClick={() => {
                onMaskChange({ ...mask, automaticMask: removedImageMask.mask })
                setRemovedImageMask(undefined)
              }}
            >
              {mask.automaticMask ? "Undo image mask replacement" : "Undo image mask removal"}
            </Button>
          )}
        {mask.points.length === 0 && clearedPins?.artwork === artwork && (
          <Button
            variant="ghost"
            onClick={() => {
              onMaskChange({ ...mask, points: clearedPins.points })
              setClearedPins(undefined)
            }}
          >
            Undo clear pins
          </Button>
        )}
        <p className="text-caption text-muted-foreground">
          {mask.mode === "manual"
            ? selectedPin && tool === "select"
              ? `${selectedPin.polarity === "keep" ? "Keep area" : "Exclude area"} selected. Drag it on the artwork or resize it below.`
              : "Dot mask is active and updates as pins change. Select a pin to move or resize it."
            : "The image mask is active. Dot mode begins from the database pins."}
        </p>
      </div>

      {maskEffects && onMaskEffectsChange && (
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel>Mask anti-aliasing</FieldLabel>
            <Toggle
              className="w-full"
              pressed={maskEffects.antiAlias === true}
              onPressedChange={(pressed) =>
                onMaskEffectsChange({ ...maskEffects, antiAlias: pressed })
              }
            >
              {maskEffects.antiAlias === true ? "On" : "Off"}
            </Toggle>
          </Field>
          <Field>
            <FieldLabel>Mask glow</FieldLabel>
            <NumberInput
              max={128}
              min={0}
              step={1}
              value={maskEffects.glow ?? 0}
              onValueChange={(value) => onMaskEffectsChange({ ...maskEffects, glow: value ?? 0 })}
            />
          </Field>
        </div>
      )}
    </div>
  )
}
