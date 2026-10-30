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
type Part = "Subpage" | "DateMention" | "TaskListEmbed" | "BoardEmbed" | "TaskItemLink" | "PageLink" | "MentionInDoc"
const load = (...names: Part[]) => () => chunk().then((m) => names.map((name) => m[name]))

registerBlock({ id: "subpage", editors: DOC_EDITORS, edition: "both", label: "Page", load: load("Subpage"), schema: [{ kind: "node", name: "subpage", attrs: ["docId", "title"] }] })
registerBlock({ id: "dateMention", editors: DOC_EDITORS, edition: "both", load: load("DateMention"), schema: [{ kind: "node", name: "dateMention", attrs: ["date", "reminder"] }] })
registerBlock({ id: "taskListEmbed", editors: DOC_EDITORS, edition: "both", load: load("TaskListEmbed"), schema: [{ kind: "node", name: "taskListEmbed", attrs: ["projectId", "show"] }] })
registerBlock({ id: "boardEmbed", editors: DOC_EDITORS, edition: "both", load: load("BoardEmbed"), schema: [{ kind: "node", name: "boardEmbed", attrs: ["projectId"] }], wide: true })
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
