import { FIGURE_TYPE } from "@/components/data-visualization"
import { cn } from "@/lib/utils"

import artwork from "./assets/flute/artwork.webp"
import cutout from "./assets/flute/cutout.webp"
import fullArt from "./assets/flute/full-art.webp"
import mask from "./assets/flute/mask.webp"

const STAGES = [
  { label: "The artwork", note: "original artwork, upscaled", src: artwork },
  { label: "The alpha", note: "what the finished pipeline produces", src: mask },
  { label: "The foreground", note: "the artwork with that alpha applied", src: cutout },
  { label: "The card", note: "full art, rendered from the two above", src: fullArt },
] as const

export function FullArtStages() {
  return (
    <figure>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
        {STAGES.map((stage) => (
          <div key={stage.label}>
            <div className="min-h-14 sm:min-h-10">
              <div className={cn(FIGURE_TYPE.label, "text-foreground font-medium")}>
                {stage.label}
              </div>
              <div className={cn(FIGURE_TYPE.note, "text-muted-foreground")}>{stage.note}</div>
            </div>
            <div className="border-border bg-muted mt-1.5 aspect-3/4 overflow-hidden rounded-lg border">
              <img
                alt={`${stage.label}: ${stage.note}.`}
                className="!my-0 size-full !max-h-none !rounded-none !border-0 object-contain"
                loading="lazy"
                src={stage.src}
              />
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        Breakdown of final results for the sample card "The Flute of Summoning Kuriboh".
      </figcaption>
    </figure>
  )
}
