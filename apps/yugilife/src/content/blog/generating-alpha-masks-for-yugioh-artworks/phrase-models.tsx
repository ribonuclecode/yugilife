import { FIGURE_TYPE } from "@/components/data-visualization"
import { cn } from "@/lib/utils"

import original006 from "./assets/comparison/006-original.webp"
import original010 from "./assets/comparison/010-original.webp"
import original015 from "./assets/comparison/015-original.webp"
import original021 from "./assets/comparison/021-original.webp"

interface Reading {
  readonly model: string
  readonly phrases: readonly string[]
  readonly notable?: readonly string[]
}

interface ArtworkReadings {
  readonly name: string
  readonly src: string
  readonly what: string
  readonly readings: readonly Reading[]
}

const ARTWORKS: readonly ArtworkReadings[] = [
  {
    name: "Endymion, the Mighty Master of Magic",
    readings: [
      {
        model: "WD SwinV2 v3",
        phrases: ["person", "white hair", "duel monster", "cape", "armor"],
      },
      { model: "Florence-2", notable: ["footwear"], phrases: ["footwear", "person"] },
      {
        model: "LFM2.5-VL",
        phrases: [
          "fantasy character",
          "black and gold armor",
          "purple and gold wings",
          "purple and gold staff",
          "pink gemstones",
        ],
      },
      {
        model: "FastVLM",
        notable: ["<start of description>"],
        phrases: ["<start of description>", "warrior or mage"],
      },
    ],
    src: original006,
    what: "a spellcaster inside a magic circle",
  },
  {
    name: "Odd-Eyes Rebellion Dragon",
    readings: [
      {
        model: "WD SwinV2 v3",
        notable: ["robot", "mecha"],
        phrases: ["robot", "mecha", "wings", "red eyes"],
      },
      { model: "Florence-2", notable: ["person"], phrases: ["person"] },
      {
        model: "LFM2.5-VL",
        notable: ["robot"],
        phrases: ["robot", "wings", "armor", "clothing", "gear"],
      },
      { model: "FastVLM", phrases: [] },
    ],
    src: original015,
    what: "a dragon in a storm",
  },
  {
    name: "Infinite Impermanence",
    readings: [
      {
        model: "WD SwinV2 v3",
        notable: ["pokemon creature"],
        phrases: ["dragon", "wings", "tail", "open mouth", "pokemon creature"],
      },
      { model: "Florence-2", notable: ["person"], phrases: ["person"] },
      {
        model: "LFM2.5-VL",
        phrases: [
          "dragon: main character",
          "wings: wings",
          "armor: armor",
          "clothing: clothing",
          "gear: gear",
        ],
      },
      { model: "FastVLM", phrases: ["dragon", "mechanical appendages"] },
    ],
    src: original010,
    what: "a serpentine mechanical dragon",
  },
  {
    name: "The Arrival Cyberse @Ignister",
    readings: [
      {
        model: "WD SwinV2 v3",
        phrases: ["robot", "holding weapon", "mecha", "holding polearm"],
      },
      { model: "Florence-2", notable: ["person"], phrases: ["person"] },
      {
        model: "LFM2.5-VL",
        phrases: ["fantasy creature", "black and purple armor", "sword", "ribbon"],
      },
      { model: "FastVLM", phrases: ["character", "weapon"] },
    ],
    src: original021,
    what: "a cyberse warrior against a rainbow of data",
  },
]

export function PhraseModelReadings() {
  return (
    <figure>
      <div className="grid gap-7">
        {ARTWORKS.map((artwork) => (
          <div className="flex items-start gap-4 sm:gap-5" key={artwork.name}>
            <img
              alt={`${artwork.name}: ${artwork.what}.`}
              className="!my-0 !max-h-none !w-24 shrink-0 !rounded-lg sm:!w-32"
              loading="lazy"
              src={artwork.src}
            />
            <div className="min-w-0 flex-1">
              <div className={cn(FIGURE_TYPE.heading, "text-foreground")}>{artwork.name}</div>
              <div className={cn(FIGURE_TYPE.description, "text-muted-foreground mt-0.5")}>
                {artwork.what}
              </div>
              <dl className="mt-3 grid gap-2">
                {artwork.readings.map((reading) => (
                  <div
                    className="grid gap-1 sm:grid-cols-[7.5rem_1fr] sm:items-baseline sm:gap-x-3"
                    key={reading.model}
                  >
                    <dt className={cn(FIGURE_TYPE.table, "text-muted-foreground")}>
                      {reading.model}
                    </dt>
                    <dd className="flex min-w-0 flex-wrap gap-1.5">
                      {reading.phrases.length === 0 ? (
                        <span className={cn(FIGURE_TYPE.table, "text-muted-foreground italic")}>
                          nothing usable
                        </span>
                      ) : (
                        reading.phrases.map((phrase) => (
                          <span
                            className={cn(
                              FIGURE_TYPE.table,
                              "rounded-md px-1.5 py-0.5",
                              reading.notable?.includes(phrase)
                                ? "bg-(--user-accent) text-(--user-accent-foreground)"
                                : "bg-surface-2 text-foreground",
                            )}
                            key={phrase}
                          >
                            {phrase}
                          </span>
                        ))
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        The subject phrases each frontend produced, exactly as they were handed to SAM3. Across the
        full 25 artworks, Florence-2 returned nothing usable eight times and FastVLM three times.
      </figcaption>
    </figure>
  )
}
