// The words for the effects' choices (effects.ts), for the picker and its
// notices: loaded with the picker, none of a call's first load.

import type { BackdropId, Background, NoiseLevel } from "./effects"

export const BACKDROPS: readonly { id: BackdropId; name: string }[] = [
  { id: "moss", name: "Meadow" },
  { id: "sun", name: "Sunrise" },
  { id: "lake", name: "Lagoon" },
  { id: "sky", name: "Open sky" },
  { id: "dusk", name: "Dusk" },
  { id: "berry", name: "Berry" },
]

export const NOISE_LEVELS: readonly { level: NoiseLevel; name: string; detail: string }[] = [
  { level: "standard", name: "Standard", detail: "Your browser's own noise reduction" },
  { level: "strong", name: "Strong", detail: "Removes typing, traffic and fans, on this device" },
  { level: "off", name: "Off", detail: "Your sound as it is, for music" },
]

/** The words for a background, for a menu or a notice. Pure. */
export function backgroundName(b: Background): string {
  switch (b.kind) {
    case "none":
      return "No effect"
    case "blur":
      return b.strength === "light" ? "Light blur" : "Strong blur"
    case "backdrop":
      return BACKDROPS.find((d) => d.id === b.id)?.name ?? "Backdrop"
    case "picture":
      return "Your picture"
  }
}
