import { hueFor, type CampHue } from "@/lib/campHue"
import { docHue } from "@/lib/docLook"
import { projectHue } from "@/lib/projectHue"
import { personHue, type PersonSeed } from "@/lib/utils/getAvatarColor"

/**
 * THE ONE HUE FUNCTION FOR A PLACE (INTERACTION_SPEC D13, §2.2): the hue a
 * channel, a doc, a project, a person or an agent wears, and so the hue every
 * row that lists it tints in (data-hue). The sidebar, the rail, the palette,
 * search, Later and Home's lists all ask here, so one thing is one colour on
 * every screen. Each kind keeps its own rule, all built on lib/campHue:
 *
 *   channel  its id's (hueFor); channels can't pick a colour yet
 *   doc      the colour given its glyph, else its id's; grey picked on
 *            purpose is none (lib/docLook docHue)
 *   project  its own hue, shared out among the reader's projects (projectHue)
 *   person   the hue their avatar wears, keyed by their name (personHue)
 *   agent    the agent hue
 *
 * A kind with no identity (a task, a board, a team, a file) has none, and its
 * row tints in the accent.
 */
export type PlaceKind = "channel" | "doc" | "project" | "person" | "agent"
export type PlaceHue = CampHue | "agent"
type Extra = { icon?: string | null; person?: PersonSeed }

export function placeHue(kind: "agent", id?: string | null, extra?: Extra): "agent"
export function placeHue(kind: Exclude<PlaceKind, "agent">, id?: string | null, extra?: Extra): CampHue | undefined
export function placeHue(kind: string | null | undefined, id?: string | null, extra?: Extra): PlaceHue | undefined
export function placeHue(kind: string | null | undefined, id?: string | null, extra: Extra = {}): PlaceHue | undefined {
  switch (kind) {
    case "channel":
      return id ? hueFor(id) : undefined
    case "doc":
      return docHue(id, extra.icon) ?? undefined
    case "project":
      return id ? projectHue(id) : undefined
    case "person": {
      const seed = extra.person ?? id
      return seed ? personHue(seed) : undefined
    }
    case "agent":
      return "agent"
    default:
      return undefined
  }
}
