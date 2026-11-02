/** The reactions' names (lib/reactions/set), in a leaf of their own: only a tray or a rise says them, so what a page
 * loads to read a reaction (lib/calls/signals) carries none. */
import type { Reaction } from "@/lib/reactions/set"

/** Each reaction's name: its button's, and what a screen reader hears when someone sends it. */
export const REACTION_NAMES: Record<Reaction, string> = {
  "👍": "Thumbs up",
  "❤️": "Heart",
  "😂": "Laughing",
  "🎉": "Celebrate",
  "👏": "Clapping",
  "😮": "Surprised",
}
