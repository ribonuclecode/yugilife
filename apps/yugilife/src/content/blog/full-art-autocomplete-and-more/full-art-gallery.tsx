import { FIGURE_TYPE } from "@/components/data-visualization"
import { cn } from "@/lib/utils"

import darkMagicalCircle from "./assets/full-art/dark-magical-circle.webp"
import elementalHeroFlameWingman from "./assets/full-art/elemental-hero-flame-wingman.webp"
import firewallDragon from "./assets/full-art/firewall-dragon.webp"
import gaiaTheFierceKnight from "./assets/full-art/gaia-the-fierce-knight.webp"
import maleficBlueEyesWhiteDragon from "./assets/full-art/malefic-blue-eyes-white-dragon.webp"
import oddEyesPendulumDragon from "./assets/full-art/odd-eyes-pendulum-dragon.webp"

const CARDS = [
  {
    alt: "Dark Magical Circle rendered as a full art Spell Card.",
    name: "Dark Magical Circle",
    src: darkMagicalCircle,
  },
  {
    alt: "Firewall Dragon rendered as a full art Link monster.",
    name: "Firewall Dragon",
    src: firewallDragon,
  },
  {
    alt: "Odd-Eyes Pendulum Dragon rendered as a full art Pendulum monster.",
    name: "Odd-Eyes Pendulum Dragon",
    src: oddEyesPendulumDragon,
  },
  {
    alt: "Elemental HERO Flame Wingman rendered as a full art Fusion monster.",
    name: "Elemental HERO Flame Wingman",
    src: elementalHeroFlameWingman,
  },
  {
    alt: "Malefic Blue-Eyes White Dragon rendered as a full art monster.",
    name: "Malefic Blue-Eyes White Dragon",
    src: maleficBlueEyesWhiteDragon,
  },
  {
    alt: "Gaia The Fierce Knight rendered as a full art Normal monster.",
    name: "Gaia The Fierce Knight",
    src: gaiaTheFierceKnight,
  },
] as const

export function FullArtGallery() {
  return (
    <figure>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {CARDS.map((card) => (
          <div key={card.name}>
            <img
              alt={card.alt}
              className="!my-0 !max-h-none !rounded-md"
              loading="lazy"
              src={card.src}
            />
            <div className={cn(FIGURE_TYPE.label, "text-muted-foreground mt-1.5 text-center")}>
              {card.name}
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        Six full art cards made in Yugilife. Every one of them was made in the ordinary editor, with
        the artwork layer switched to full art and tweaked.
      </figcaption>
    </figure>
  )
}
