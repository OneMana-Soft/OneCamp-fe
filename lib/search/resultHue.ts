import { placeHue, type PlaceHue } from "@/lib/placeHue"
import type { SearchResult } from "@/services/searchService"

/**
 * The hue a search hit's row tints in (lib/placeHue, INTERACTION_SPEC D13),
 * on the search page and in the palette alike: a channel's, a doc's or a
 * project's own, a person's, or a message's author's (the face it leads with).
 * A task, a board, a team or a file has none: its row tints in the accent.
 */
export function resultHue(result: SearchResult): PlaceHue | undefined {
  switch (result.type) {
    case "channel":
      return placeHue("channel", result.channel?.ch_id)
    case "doc":
      return placeHue("doc", result.doc?.doc_uuid, { icon: result.doc?.doc_icon })
    case "project":
      return placeHue("project", result.project?.project_id)
    case "user":
      return placeHue("person", null, { person: result.user })
    case "chat":
    case "post":
    case "comment": {
      const r = result[result.type] ?? {}
      const name = r.chat_by_user_full_name || r.post_by_user_full_name || r.comment_by_user_full_name
      return name ? placeHue("person", null, { person: name }) : undefined
    }
    default:
      return undefined
  }
}
