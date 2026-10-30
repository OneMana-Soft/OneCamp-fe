"use client"

/**
 * Suggesting's registry entry (docs C5): the plugin that turns a suggesting
 * editor's typing into suggestions, the kept suggestions and the composer
 * over a doc's editor, Editing or Suggesting in the header, how many wait by
 * the title, and the list of them. Its actions come with the overlay's chunk
 * (contributions.ts), off the doc's first load. It writes no node or mark, so
 * its schema is empty and the collaboration server's manifest does not
 * change. Both editions.
 */

import { registerBlock, registerPanel, registerSlot } from "@/components/docEditor/registry/registry"

// A doc's only, so it loads with a doc's blocks and never with the chat
// composer's (the registry's entry stays light).
registerBlock({
  id: "suggest-mode",
  editors: ["doc"],
  edition: "both",
  load: async () => [(await import("./suggestMode")).SuggestMode],
  schema: [],
})

// The kept suggestions and the composer, over a doc's editor, once per editor.
registerSlot({ slot: "editorOverlay", id: "suggestions.session", edition: "both", load: () => import("./SuggestionsOverlay") })

// Editing or Suggesting, for someone who may edit.
registerSlot({ slot: "modes", id: "suggestions.mode", edition: "both", load: () => import("./SuggestModeSwitch") })

// Every suggestion on the doc, beside it; how many wait, by its title.
registerPanel({ kind: "suggestions", title: "Suggestions", edition: "both", load: () => import("@/components/proposals/SuggestionsList") })
registerSlot({ slot: "titleChips", id: "suggestions.count", edition: "both", load: () => import("./SuggestionsChip") })
