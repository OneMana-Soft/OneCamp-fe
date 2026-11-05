import { entityKind, registerEntityKind } from "@/lib/liveEntity"
import { Presentation } from "@/lib/icons"

/** A whiteboard as POST /entities reads it for one reader (the API's EntityLink readBoards): its title, when they can open it. */
export interface BoardChipData {
  title?: string
}

// The "board" kind, registered by the code that first shows one (a doc's
// whiteboard block, miro-34), so the app's first load carries none of it.
if (!entityKind("board")) {
  registerEntityKind<BoardChipData>({
    kind: "board",
    icon: Presentation,
    noun: "board",
    view: (b) => ({ title: b.title || "Untitled board" }),
    href: (id) => `/app/board/${id}`,
  })
}
