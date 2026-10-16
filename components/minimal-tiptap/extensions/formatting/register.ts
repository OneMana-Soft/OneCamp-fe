"use client"

import { registerBlock } from "@/components/docEditor/registry/registry"
import { DOC_EDITORS } from "../../blocks/kinds"

// B2's formatting: its chunk (formatting.ts) loads with the doc's editor; the shortcut rows are read before.
registerBlock({
  id: "formatting",
  editors: DOC_EDITORS,
  edition: "both",
  load: () => import("./formatting").then(() => []),
  schema: [],
  shortcuts: [
    { keys: "Mod-Shift-h", label: "Last colour used", group: "Text", order: 80 },
    { typed: ["==text=="], label: "Highlight", group: "Text", order: 85 },
    { typed: ["a.", "i."], label: "Lettered or roman list", group: "Blocks", order: 75 },
  ],
})
