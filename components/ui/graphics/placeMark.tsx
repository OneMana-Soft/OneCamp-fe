import { ChannelTile } from "@/components/ui/graphics/ChannelTile"
import { StatusGlyph, type StatusKind } from "@/components/ui/graphics/glyphs"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { DocIcon } from "@/components/docEditor/DocIcon"
import { CalendarDays, Clock, LayoutDashboard, MessageCircle, MessageSquare, Paperclip, Users } from "@/lib/icons"
import { knownDocIcon } from "@/lib/docLook"
import { placeHue, type PlaceHue } from "@/lib/placeHue"
import { avatarSeed } from "@/lib/utils/getAvatarColor"

/**
 * What a listed thing is, for its mark: a place (a person, a project, a
 * channel, a doc, a team, a board), a task, or a hit that isn't a place (a
 * message, a reply or a DM, a file, an event).
 */
export type PlaceMarkKind = "person" | "project" | "channel" | "doc" | "task" | "team" | "board" | "message" | "reply" | "file" | "event"

export interface MarkedPlace {
  kind: PlaceMarkKind | null | undefined
  /** Its id: a project's or a channel's hue and tile, a doc's hue and glyph. */
  id?: string | null
  /** Its name: a person's initials and hue. */
  label?: string
  /** A channel: a lock instead of the #. */
  isPrivate?: boolean
  /** A doc's icon as its source has it; undefined where the source doesn't carry it (lib/docLook knownDocIcon). */
  icon?: string | null
  /** A task's status, as the glyph set's kind. */
  status?: StatusKind
}

const GLYPH = { team: Users, board: LayoutDashboard, message: MessageSquare, reply: MessageCircle, file: Paperclip, event: CalendarDays }

/** A doc's icon: its source's, or the one the app last saw where its source has none. */
const docIcon = (p: MarkedPlace) => (p.icon === undefined ? knownDocIcon(p.id) : p.icon)

/**
 * THE ONE MARK FOR A LISTED THING, 20px, wherever places are listed: the
 * palette's places, hits and Recent, and Home's "Jump back in". Its identity
 * where it has one, in its hue (INTERACTION_SPEC D13, lib/placeHue): a
 * person's face, a project's tile, a channel's tile, a doc's glyph; a task's
 * status glyph; anything else its kind's glyph in ink-3. The palette drew
 * these from three maps of its own (REVIEW-FE-SHELL), Home from a fourth.
 */
export function PlaceMark({ place }: { place: MarkedPlace }) {
  switch (place.kind) {
    case "person":
      return <IdentityMark variant="avatar" size={20} id={avatarSeed(place.label)} label={place.label} />
    case "project":
      return <ProjectTile id={place.id} size={20} />
    case "channel":
      return <ChannelTile id={place.id} isPrivate={place.isPrivate} size={20} />
    case "doc":
      return <DocIcon id={place.id} icon={docIcon(place)} />
    case "task":
      return <StatusGlyph status={place.status ?? "todo"} />
    case "team":
    case "board":
    case "message":
    case "reply":
    case "file":
    case "event": {
      const Glyph = GLYPH[place.kind]
      return <Glyph className="size-4 text-ink-3" aria-hidden="true" />
    }
    default:
      return <Clock className="size-4 text-ink-3" aria-hidden="true" />
  }
}

/** The hue a listed thing's row tints in (lib/placeHue), the one its mark wears; none for a kind with no identity. */
export function placeMarkHue(place: MarkedPlace): PlaceHue | undefined {
  switch (place.kind) {
    case "person":
      return placeHue("person", null, { person: place.label })
    case "project":
    case "channel":
      return placeHue(place.kind, place.id)
    case "doc":
      return placeHue("doc", place.id, { icon: docIcon(place) })
    default:
      return undefined
  }
}
