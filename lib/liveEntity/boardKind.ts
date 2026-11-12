import { Presentation } from "@/lib/icons"
import { registerEntityKind } from "./registry"

/**
 * A whiteboard as a chip: read through POST /entities as the server's registry
 * reads one for one reader (business/EntityLink readBoards: its title, when
 * they can open it), opened at its page. The one "board" kind, for every
 * surface that draws one (a doc's whiteboard block, miro-34; an event's files,
 * calendar head B). Each imports this module from its own lazy code, so the
 * app's first load carries none of it; a module runs once, so the kind is
 * registered once (boardKind.test.ts loads both surfaces, either way round).
 */
export interface BoardChipData {
  title?: string
}

registerEntityKind<BoardChipData>({
  kind: "board",
  icon: Presentation,
  noun: "board",
  view: (d) => ({ title: d.title || "Untitled board" }),
  href: (id) => `/app/board/${id}`,
})
