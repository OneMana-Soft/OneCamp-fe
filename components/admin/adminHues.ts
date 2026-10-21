import type { MarkHue } from "@/components/ui/graphics/hues"
import { AREA_HUE } from "@/lib/areas"

/**
 * The admin page's colours: one per group of its menu, shared by the group's
 * menu tiles and by the tiles in that group's cards and empty states.
 *
 * Colour names an area (lib/areas): AI and automation is the agents' area
 * and wears its indigo; people, the workspace, connections and the system
 * name no area and are ink. The accent keeps the one primary action, focus
 * and the current section.
 */
export const ADMIN_GROUP_HUE = {
  people: "ink",
  workspace: "ink",
  ai: AREA_HUE.agents,
  connections: "ink",
  system: "ink",
} as const satisfies Record<string, MarkHue>
