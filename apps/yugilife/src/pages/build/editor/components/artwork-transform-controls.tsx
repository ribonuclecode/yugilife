import { useId, useLayoutEffect, useRef, useState } from "react"

import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  ARTWORK_ATTACHMENT_OVERLAP_PX,
  buildConcaveAttachmentPath,
  getShapeContainerRadius,
} from "@/lib/rounded-surface-geometry"
import { useShape } from "@/lib/shape-context"
import { cn } from "@/lib/utils"

import { toggleArtworkFullArt } from "../model/editor-config"

import type { ArtworkTransform } from "yugilife-core"

interface ArtworkFullArtToggleProps {
  onTransformChange: (transform: ArtworkTransform) => void
  transform: ArtworkTransform
}

/**
 * A template-capability control that is physically attached to the artwork input. Keeping this
 * separate from the crop/mask editor prevents the full-art presentation choice from looking like
 * another adjustment group while preserving one shared transform model.
 */
export function ArtworkFullArtToggle({ onTransformChange, transform }: ArtworkFullArtToggleProps) {
  const shape = useShape()
  const clipId = useId().replace(/:/g, "")
  const attachmentRef = useRef<HTMLDivElement>(null)
  const [attachmentSize, setAttachmentSize] = useState({ height: 0, width: 0 })
  const enabled = transform.mode === "full-art"
  const cornerRadius = getShapeContainerRadius(shape.container)

  useLayoutEffect(() => {
    const element = attachmentRef.current
    if (!element) return

    const measure = () => {
      const { height, width } = element.getBoundingClientRect()
      setAttachmentSize((previous) =>
        previous.height === height && previous.width === width ? previous : { height, width },
      )
    }

    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const attachmentPath =
    attachmentSize.width > 0 && attachmentSize.height > 0
      ? buildConcaveAttachmentPath({
          height: attachmentSize.height,
          overlap: ARTWORK_ATTACHMENT_OVERLAP_PX,
          radius: cornerRadius,
          width: attachmentSize.width,
        })
      : null

  return (
    <div
      ref={attachmentRef}
      className={cn(
        "text-foreground relative isolate z-30 flex items-center justify-between gap-3 overflow-hidden px-3 pt-5 pb-3",
        shape.container,
        "-mb-2 -translate-y-2 rounded-t-none",
      )}
    >
      {attachmentPath && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${attachmentSize.width} ${attachmentSize.height}`}
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <path d={attachmentPath} />
            </clipPath>
          </defs>
          <rect
            clipPath={`url(#${clipId})`}
            fill="var(--active)"
            height={attachmentSize.height}
            width={attachmentSize.width}
            x="0"
            y="0"
          />
        </svg>
      )}
      <span className="text-body relative z-10 font-medium">Enable full art</span>
      <Switch
        checked={enabled}
        className="relative z-10 shrink-0 py-0"
        hideLabel
        label="Enable full art"
        onToggle={() => onTransformChange(toggleArtworkFullArt(transform))}
        size="default"
      />
    </div>
  )
}

export function TransformSlider({
  formatValue,
  label,
  max,
  min,
  onChange,
  onChangeEnd,
  onKeyDownCapture,
  step = 0.01,
  value,
}: {
  formatValue: (value: number) => string
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  onChangeEnd?: () => void
  onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>
  step?: number
  value: number
}) {
  return (
    <Slider
      formatValue={formatValue}
      label={label}
      max={max}
      min={min}
      step={step}
      value={value}
      variant="scrubber"
      onChange={onChange}
      onBlurCapture={onChangeEnd}
      onKeyDownCapture={onKeyDownCapture}
      onKeyUpCapture={onChangeEnd}
      onPointerCancelCapture={onChangeEnd}
      onPointerUpCapture={onChangeEnd}
    />
  )
}
