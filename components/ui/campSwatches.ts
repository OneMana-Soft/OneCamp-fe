import type { CampHue } from "@/lib/campHue"

/**
 * The six camp hues as named swatches, in the order every colour picker
 * draws them (STEP5_PLAN §3 C): an event's or a calendar's colour, a
 * folder's, a selection's. A colour is one of these or none; there is no
 * free colour (DESIGN_V3 §3.5, docs D-31).
 */
export const CAMP_SWATCHES: ReadonlyArray<{ hue: CampHue; name: string }> = [
  { hue: "moss", name: "Moss" },
  { hue: "sun", name: "Sun" },
  { hue: "lake", name: "Lake" },
  { hue: "sky", name: "Sky" },
  { hue: "dusk", name: "Dusk" },
  { hue: "berry", name: "Berry" },
]

/** A hue's name, or "No colour". */
export const swatchName = (hue: CampHue | null | undefined) => CAMP_SWATCHES.find((s) => s.hue === hue)?.name ?? "No colour"

/** A colour that may be cleared: none, then the six (docs F1: a folder's, a selection's). */
export const HUE_CHOICES: ReadonlyArray<{ hue: CampHue | null; name: string }> = [{ hue: null, name: "No colour" }, ...CAMP_SWATCHES]
