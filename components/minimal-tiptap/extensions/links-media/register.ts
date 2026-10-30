import { registerBlock } from "@/components/docEditor/registry/registry"
import type { BlockSpec } from "@/components/docEditor/registry/types"
import { DOC_EDITORS } from "../../blocks/kinds"
import { once } from "@/lib/lazy/once"

// B4's blocks: their schema and loader. The chunk adds the rest (contrib.ts).
const chunk = once(() => import("./chunk"))
const block = (id: string, attrs: string[]): BlockSpec => ({
  id,
  editors: DOC_EDITORS,
  edition: "both",
  load: () => chunk().then((m) => [m[id as "Bookmark"]]),
  schema: [{ kind: "node", name: id[0].toLowerCase() + id.slice(1), attrs }],
})

registerBlock({ ...block("SmartPaste", []), editors: ["doc"], schema: [] })
registerBlock(block("LinkMention", ["href", "icon", "siteName", "title"]))
registerBlock(block("Bookmark", ["description", "href", "icon", "image", "siteName", "title"]))
registerBlock({ ...block("WebEmbed", ["height", "src"]), wide: true })
registerBlock(block("FileBlock", ["caption", "id", "kind", "mime", "name", "size", "src"]))
