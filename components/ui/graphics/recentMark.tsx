import { PlaceMark, placeMarkHue, type MarkedPlace } from "@/components/ui/graphics/placeMark"
import type { PlaceHue } from "@/lib/placeHue"
import type { RecentItem } from "@/store/slice/recentItemsSlice"

type Recent = Pick<RecentItem, "id" | "type" | "title">

/** A recent place as the one mark reads it (components/ui/graphics/placeMark). A recent doc's icon is the one the app last saw. */
function placeOf(item: Recent): MarkedPlace {
  switch (item.type) {
    case "user":
    case "chat":
      return { kind: "person", label: item.title }
    case "project":
    case "channel":
    case "doc":
    case "task":
    case "team":
      return { kind: item.type, id: item.id, label: item.title }
    default:
      return { kind: null }
  }
}

/**
 * A recent place's mark, 20px, wherever recent places are listed (Home's
 * "Jump back in", the palette's Recent): the one mark (PlaceMark), a person's
 * face, a project's tile, a channel's tile and a doc's glyph in their hues
 * (D13), the status glyph for a task, an ink-3 glyph for anything else. Home
 * and the palette drew the same list two ways.
 */
export function RecentMark({ item }: { item: Recent }) {
  return <PlaceMark place={placeOf(item)} />
}

/** The hue a recent place's row tints in (lib/placeHue): a person's, a project's, a channel's or a doc's own. */
export function recentHue(item: Recent): PlaceHue | undefined {
  return placeMarkHue(placeOf(item))
}
