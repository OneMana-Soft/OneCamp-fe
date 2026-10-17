// B8: version history (a dialog) and live presence (over each editor). Both load on first use,
// but for presence's start: this tab's edits said and everyone's read from the
// editor's first moment, a block loaded with the doc's others (presence/fromTheStart.ts).
import { registerBlock, registerDialog, registerSlot } from "@/components/docEditor/registry/registry"

registerDialog({ id: "doc.history", edition: "both", load: () => import("./HistorySheet") })
registerSlot({ slot: "editorOverlay", id: "presence.live", edition: "both", load: () => import("@/components/docEditor/presence/PresenceOverlay") })
registerBlock({
  id: "presence.start",
  editors: ["doc"],
  edition: "both",
  schema: [],
  load: () => import("@/components/docEditor/presence/fromTheStart").then((m) => m.presenceFor),
})
