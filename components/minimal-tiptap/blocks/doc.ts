"use client"

/**
 * The doc's own blocks and keys, in the doc editor and the guest's page only
 * (the guest's schema is the doc's, I4): callouts, toggles, to-do lists, table
 * embeds, the block handle, a click below the text, and the doc's keys.
 *
 * What draws and runs them is one chunk (docOnly.ts), fetched when a doc's
 * editor is first built; what every surface reads about them (the "/" entry,
 * Turn into, the keys, the schema) is here, so a menu can show them without it.
 */

import type { Editor } from "@tiptap/core"
import { CheckSquare, ChevronRight, ListTodo, MessageSquare, Table as TableIcon } from "@/lib/icons"
import { registerBlock } from "@/components/docEditor/registry/registry"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { DOC_EDITORS, ORDER, SLASH_ORDER } from "./kinds"
import { once } from "@/lib/lazy/once"

// One fetch for all of them: every loader below shares it.
const docOnly = once(() => import("./docOnly"))

registerBlock({
  id: "callout",
  editors: DOC_EDITORS,
  edition: "both",
  order: ORDER.callout,
  load: () => docOnly().then((m) => [m.Callout]),
  schema: [{ kind: "node", name: "callout", attrs: ["color", "emoji", "icon"] }],
  turnInto: {
    id: "callout",
    label: "Callout",
    icon: MessageSquare,
    order: 95,
    detect: 90,
    isActive: (e) => e.isActive("callout"),
    run: (e) => {
      if (!e.isActive("callout")) e.chain().focus().setCallout().run()
    },
  },
  slash: [
    {
      id: "callout",
      title: "Callout",
      description: "A highlighted note, warning or idea",
      aliases: ["note", "info", "warning", "tip", "highlight"],
      icon: MessageSquare,
      section: "Basic",
      tint: "bg-camp-sun-tint text-camp-sun-ink ring-0",
      order: SLASH_ORDER.callout,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).insertContent({ type: "callout", content: [{ type: "paragraph" }] }).run()
      },
    },
  ],
})

const onToggle = (e: Editor, level: number) => {
  const { $from } = e.state.selection
  if ($from.depth < 2 || $from.node(-1).type.name !== "collapsible" || $from.index(-1) !== 0) return false
  return ($from.parent.type.name === "heading" ? $from.parent.attrs.level : 0) === level
}

registerBlock({
  id: "collapsible",
  editors: DOC_EDITORS,
  edition: "both",
  order: ORDER.collapsible,
  load: () => docOnly().then((m) => [m.Collapsible]),
  schema: [{ kind: "node", name: "collapsible", attrs: [] }],
  shortcuts: [{ keys: "Mod-Alt-7", typed: [">>"], label: "Toggle list", group: "Blocks", order: 85 }],
  slash: [0, 1, 2, 3].map((level) => ({
    id: level ? `toggleHeading${level}` : "collapsible",
    title: level ? `Toggle heading ${level}` : "Toggle list",
    description: level ? "A heading that hides and shows what is under it" : "Hide and show what is inside",
    aliases: level ? [`toggle h${level}`] : ["toggle", "collapse", "details", ">>"],
    kbd: level ? undefined : [">>"],
    icon: ChevronRight,
    section: "Basic",
    order: SLASH_ORDER.collapsible + level,
    run: (editor, range) => void editor.chain().focus().deleteRange(range).setToggle(level).run(),
  })),
  turnInto: [0, 1, 2, 3].map((level) => ({
    id: level ? `toggleH${level}` : "toggle",
    label: level ? `Toggle heading ${level}` : "Toggle list",
    icon: ChevronRight,
    order: level ? 100 + level : 75,
    detect: 5,
    isActive: (e: Editor) => onToggle(e, level),
    run: (e: Editor) => e.chain().focus().setToggle(level).run(),
  })),
})

registerBlock({
  id: "tableEmbed",
  editors: DOC_EDITORS,
  edition: "both",
  order: ORDER.tableEmbed,
  load: () => docOnly().then((m) => [m.TableEmbed]),
  schema: [{ kind: "node", name: "tableEmbed", attrs: ["tableId", "viewId"] }],
  slash: [
    {
      id: "table",
      title: "Table",
      description: "Embed an existing table or create a new one",
      aliases: ["database", "grid", "spreadsheet", "embed"],
      icon: TableIcon,
      section: "Media and embeds",
      tint: "bg-camp-moss-tint text-camp-moss-ink ring-0",
      order: SLASH_ORDER.table,
      run: (editor, range) => {
        // The table picker embeds a live view of an existing table or a new
        // one, in this doc: the doc stores only { tableId }, never the rows.
        editor.chain().focus().deleteRange(range).run()
        busFor(editor)?.emit("openDialog", { id: "doc.embedTable" })
      },
    },
  ],
  wide: true,
})

registerBlock({ id: "blockHandle", editors: DOC_EDITORS, edition: "both", order: ORDER.blockHandle, load: () => docOnly().then((m) => [m.BlockHandle]), schema: [] })

registerBlock({ id: "clickToCreate", editors: DOC_EDITORS, edition: "both", order: ORDER.clickToCreate, load: () => docOnly().then((m) => [m.ClickToCreateBlock]), schema: [] })

type TaskChain = { toggleTaskList(): { run(): boolean } }

registerBlock({
  id: "taskList",
  editors: DOC_EDITORS,
  edition: "both",
  order: ORDER.taskList,
  load: () => docOnly().then((m) => [m.TaskList, m.TaskItem]),
  schema: [
    { kind: "node", name: "taskList", attrs: [] },
    { kind: "node", name: "taskItem", attrs: ["checked"] },
  ],
  slash: [
    {
      id: "taskList",
      title: "To-do list",
      description: "Track tasks with checkboxes",
      aliases: ["todo", "to-do", "task", "checkbox", "checklist", "[]"],
      kbd: ["[]"],
      icon: CheckSquare,
      section: "Basic",
      order: SLASH_ORDER.taskList,
      run: (editor, range) => {
        ;(editor.chain().focus().deleteRange(range) as unknown as TaskChain).toggleTaskList().run()
      },
    },
  ],
  turnInto: {
    id: "todo",
    label: "To-do list",
    icon: ListTodo,
    order: 70,
    detect: 10,
    isActive: (e: Editor) => e.isActive("taskList"),
    run: (e: Editor) => (e.chain().focus() as unknown as TaskChain).toggleTaskList().run(),
  },
  snapshotClasses: [
    ['ul[data-type="taskList"]', "task-list"],
    ['li[data-type="taskItem"]', "task-item"],
  ],
  shortcuts: [{ keys: "Mod-Alt-4", alt: ["Mod-Shift-9"], typed: ["[]"], label: "To-do list", group: "Blocks", order: 80 }],
})

// The doc's keys, as Notion's (⌘⌥8, ⌘⌥T, ⌘↩, Tab, ⌘K, " + space). No nodes
// or marks: nothing for the collaboration schema.
registerBlock({
  id: "docKeymap",
  editors: DOC_EDITORS,
  edition: "both",
  order: ORDER.docKeymap,
  load: () => docOnly().then((m) => [m.DocKeymap]),
  schema: [],
  shortcuts: [
    { keys: "Mod-Enter", label: "Check a to-do, open a toggle", group: "Blocks", order: 120 },
    { keys: "Mod-Alt-t", label: "Open or close every toggle", group: "Blocks", order: 130 },
    { keys: "Mod-d", label: "Duplicate the block", group: "Blocks", order: 150 },
    { keys: "Mod-a", label: "Select the block, then everything", group: "Blocks", order: 160 },
    // The selection bar takes focus (SelectionBar, the formatting it shows).
    { keys: "Alt-F10", label: "Formatting bar", group: "Doc", order: 10 },
    { keys: "Escape", alt: ["Tab"], sequence: true, label: "Leave the text", group: "Doc", order: 80 },
  ],
})

// Keys the app binds outside the doc (the command palette, the theme), which
// the doc's shortcuts dialog lists all the same.
registerBlock({
  id: "appKeys",
  editors: DOC_EDITORS,
  edition: "both",
  order: ORDER.docKeymap + 10,
  schema: [],
  shortcuts: [
    { keys: "Mod-p", alt: ["Mod-k"], label: "Search", group: "Doc", order: 26 },
    { keys: "Mod-Shift-l", label: "Light or dark", group: "Doc", order: 28 },
  ],
})
