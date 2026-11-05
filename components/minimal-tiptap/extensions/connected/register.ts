import { registerBlock } from "@/components/docEditor/registry/registry"
import { DOC_EDITORS } from "../../blocks/kinds"
import { once } from "@/lib/lazy/once"

/**
 * Connected work (docs programme C1): what a doc's schema holds of it and
 * where its code is. The blocks load with the doc's other blocks, in one
 * chunk (chunk.ts), which adds the rest as it loads (contrib.ts): "/" entries,
 * the to-do's action and the pickers. The guest's page has the same schema
 * (I4) and none of the asking: no "[[", and nothing more in the "@" list.
 */

const chunk = once(() => import("./chunk"))
type Part = "Subpage" | "DateMention" | "TaskListEmbed" | "BoardEmbed" | "WhiteboardEmbed" | "TaskItemLink" | "PageLink" | "MentionInDoc"
const load = (...names: Part[]) => () => chunk().then((m) => names.map((name) => m[name]))

// A node block, named as its node: the ids it keeps (miro-34's whiteboard keeps only the board's).
const node = (name: string, part: Part, attrs: string[], more?: { label?: string; wide?: boolean }) =>
  registerBlock({ id: name, editors: DOC_EDITORS, edition: "both", load: load(part), schema: [{ kind: "node", name, attrs }], ...more })
node("subpage", "Subpage", ["docId", "title"], { label: "Page" })
node("dateMention", "DateMention", ["date", "reminder"])
node("taskListEmbed", "TaskListEmbed", ["projectId", "show"])
node("boardEmbed", "BoardEmbed", ["projectId"], { wide: true })
node("whiteboardEmbed", "WhiteboardEmbed", ["boardId"], { wide: true })
registerBlock({
  id: "taskItemLink",
  editors: DOC_EDITORS,
  edition: "both",
  load: load("TaskItemLink"),
  schema: [],
  globalAttrs: [{ name: "taskId", on: ["taskItem"] }],
  shortcuts: [
    { keys: "Mod-Shift-Enter", label: "Make a to-do a task", group: "Blocks", order: 125 },
    { keys: "Mod-Enter", label: "Open the selected page or task", group: "Blocks", order: 126 },
  ],
})
// "[[", and what the "@" list adds in a doc: dates, the doc's people first, who can't open it.
registerBlock({ id: "pageLink", editors: ["doc"], edition: "both", load: load("PageLink", "MentionInDoc"), schema: [], shortcuts: [{ typed: ["[["], label: "Link a page", group: "Doc", order: 72 }] })
