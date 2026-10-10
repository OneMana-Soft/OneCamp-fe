import type { CampHue } from "@/lib/campHue"

/**
 * The admin page's colours: one camp hue per group of its menu, shared by the
 * group's menu tiles and by the tiles in that group's cards and empty states.
 *
 * Per group, not per item: nineteen sections in nineteen colours would be the
 * random pastel per element the playful layer rules out. Five groups in five
 * hues make the menu scan as five places, and a card's tile says which place
 * it belongs to. Identity colour only: the accent keeps the one primary
 * action, focus and the current section.
 */
export const ADMIN_GROUP_HUE = {
  people: "sky",
  workspace: "sun",
  ai: "dusk",
  connections: "lake",
  system: "moss",
} as const satisfies Record<string, CampHue>

export type AdminGroup = keyof typeof ADMIN_GROUP_HUE
