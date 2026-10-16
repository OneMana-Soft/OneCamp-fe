"use client"

/**
 * The blocks and marks StarterKit bundles, one spec each: every editor carries
 * them, in one StarterKit configured from these specs (registry/factory.ts),
 * with the classes the doc's spacing hangs on (snapshotHtml.ts reads them back).
 */

import type { Editor } from "@tiptap/core"
import { Bold, Code, Heading1, Heading2, Heading3, Heading4, Italic, List, ListOrdered, Quote, Strikethrough, Type } from "@/lib/icons"
import { registerBlock } from "@/components/docEditor/registry/registry"
import type { ShortcutRow } from "@/components/docEditor/registry/types"
import { isDesktopApp } from "@/lib/desktopApp"
import { EVERY_EDITOR, ORDER, SLASH_ORDER, TYPING_EDITORS } from "./kinds"

const chain = (editor: Editor) => editor.chain().focus()
const plain = (editor: Editor) => (editor.commands.leaveToggleSummary?.(), chain(editor))

// The doc itself, its text, a line break, and the drop and gap carets.
registerBlock({
  id: "core",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.starterKit,
  starterKit: {
    document: {},
    text: {},
    hardBreak: {},
    dropcursor: { width: 2, class: "ProseMirror-dropcursor border" },
    gapcursor: {},
  },
  schema: [
    { kind: "node", name: "doc", attrs: [] },
    { kind: "node", name: "text", attrs: [] },
    { kind: "node", name: "hardBreak", attrs: [] },
  ],
  shortcuts: [{ keys: "Shift-Enter", label: "Line break", group: "Doc", order: 60 }],
})

registerBlock({
  id: "paragraph",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.starterKit,
  starterKit: { paragraph: { HTMLAttributes: { class: "text-node" } } },
  schema: [{ kind: "node", name: "paragraph", attrs: [] }],
  turnInto: {
    id: "text",
    label: "Text",
    icon: Type,
    order: 10,
    detect: 100,
    isActive: (e) => e.isActive("paragraph") && !e.isActive("bulletList") && !e.isActive("orderedList") && !e.isActive("taskList"),
    run: (e) => plain(e).clearNodes().setParagraph().run(),
  },
  snapshotClass: ["p", "text-node"],
  shortcuts: [{ keys: "Mod-Alt-0", label: "Text", group: "Blocks", order: 20 }],
})

const LEVELS = [
  { level: 1 as const, icon: Heading1, description: "Large section heading", aliases: ["h1", "#", "title"], kbd: "#" },
  { level: 2 as const, icon: Heading2, description: "Medium section heading", aliases: ["h2", "##", "subtitle"], kbd: "##" },
  { level: 3 as const, icon: Heading3, description: "Small section heading", aliases: ["h3", "###"], kbd: "###" },
  { level: 4 as const, icon: Heading4, description: "The smallest heading", aliases: ["h4", "####"], kbd: "####" },
]

registerBlock({
  id: "heading",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.starterKit,
  starterKit: { heading: { HTMLAttributes: { class: "heading-node" } } },
  schema: [{ kind: "node", name: "heading", attrs: ["level"] }],
  slash: LEVELS.map(({ level, icon, description, aliases, kbd }) => ({
    id: `heading${level}`,
    title: `Heading ${level}`,
    description,
    aliases,
    kbd: [kbd],
    icon,
    section: "Basic",
    order: level < 4 ? SLASH_ORDER[`heading${level as 1 | 2 | 3}`] : SLASH_ORDER.heading3 + 5,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level }).run()
    },
  })),
  turnInto: LEVELS.map(({ level, icon }) => ({
    id: `h${level}`,
    label: `Heading ${level}`,
    icon,
    order: level < 4 ? 10 + level * 10 : 45,
    detect: 20 + level,
    isActive: (e: Editor) => e.isActive("heading", { level }),
    run: (e: Editor) => plain(e).clearNodes().setHeading({ level }).run(),
  })),
  snapshotClass: ["h1, h2, h3, h4, h5, h6", "heading-node"],
  // H4 has no ⌘⌥ key (⌘⌥4 is the to-do's).
  shortcuts: LEVELS.map(({ level, kbd }) => ({ keys: level < 4 ? `Mod-Alt-${level}` : undefined, typed: [kbd], label: `Heading ${level}`, group: "Blocks", order: 20 + level * 10 })),
})

registerBlock({
  id: "blockquote",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.starterKit,
  starterKit: { blockquote: { HTMLAttributes: { class: "block-node" } } },
  schema: [{ kind: "node", name: "blockquote", attrs: [] }],
  slash: [
    {
      id: "blockquote",
      title: "Quote",
      description: "Insert a blockquote",
      aliases: ["quote", '"', ">", "blockquote"],
      kbd: [">"],
      icon: Quote,
      section: "Basic",
      order: SLASH_ORDER.blockquote,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run()
      },
    },
  ],
  turnInto: { id: "quote", label: "Quote", icon: Quote, order: 80, detect: 30, isActive: (e) => e.isActive("blockquote"), run: (e) => chain(e).toggleBlockquote().run() },
  snapshotClass: ["blockquote", "block-node"],
  shortcuts: [{ keys: "Mod-Shift-b", typed: ['"'], label: "Quote", group: "Blocks", order: 90 }],
})

registerBlock({
  id: "lists",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.starterKit,
  starterKit: {
    bulletList: { HTMLAttributes: { class: "list-node" } },
    orderedList: { HTMLAttributes: { class: "list-node" } },
    listItem: {},
  },
  schema: [
    { kind: "node", name: "bulletList", attrs: [] },
    { kind: "node", name: "orderedList", attrs: ["start", "type"] },
    { kind: "node", name: "listItem", attrs: [] },
  ],
  slash: [
    {
      id: "bulletList",
      title: "Bullet list",
      description: "Create a simple bullet list",
      aliases: ["ul", "bullet", "-", "unordered"],
      kbd: ["-"],
      icon: List,
      section: "Basic",
      order: SLASH_ORDER.bulletList,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run()
      },
    },
    {
      id: "orderedList",
      title: "Numbered list",
      description: "Create a numbered list",
      aliases: ["ol", "number", "1.", "ordered"],
      kbd: ["1."],
      icon: ListOrdered,
      section: "Basic",
      order: SLASH_ORDER.orderedList,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run()
      },
    },
  ],
  turnInto: [
    { id: "bullet", label: "Bulleted list", icon: List, order: 50, detect: 11, isActive: (e) => e.isActive("bulletList"), run: (e) => chain(e).toggleBulletList().run() },
    { id: "ordered", label: "Numbered list", icon: ListOrdered, order: 60, detect: 12, isActive: (e) => e.isActive("orderedList"), run: (e) => chain(e).toggleOrderedList().run() },
  ],
  snapshotClass: ['ul:not([data-type="taskList"]), ol', "list-node"],
  shortcuts: [
    { keys: "Mod-Alt-5", alt: ["Mod-Shift-8"], typed: ["-"], label: "Bulleted list", group: "Blocks", order: 60 },
    { keys: "Mod-Alt-6", alt: ["Mod-Shift-7"], typed: ["1."], label: "Numbered list", group: "Blocks", order: 70 },
    { keys: "Tab", alt: ["Shift-Tab"], label: "Nest or un-nest a list item", group: "Blocks", order: 140 },
  ],
})

const mark = (id: string, starterKey: string, title: string, description: string, aliases: string[], icon: typeof Bold, keys: string, order: number, slashOrder: number, toggle: (e: Editor) => unknown, starterOptions: Record<string, unknown> = {}) =>
  registerBlock({
    id,
    editors: EVERY_EDITOR,
    edition: "both",
    order: ORDER.starterKit,
    starterKit: { [starterKey]: starterOptions },
    schema: [{ kind: "mark", name: id, attrs: [] }],
    slash: [
      {
        id: id === "code" ? "inlineCode" : id === "strike" ? "strikethrough" : id,
        title,
        description,
        aliases,
        icon,
        section: "Format",
        order: slashOrder,
        editors: TYPING_EDITORS,
        run: (editor, range) => {
          toggle(editor.chain().focus().deleteRange(range) as unknown as Editor)
        },
      },
    ],
    shortcuts: [{ keys, label: title, group: "Text", order }],
  })

type MarkChain = { toggleBold(): { run(): boolean }; toggleItalic(): { run(): boolean }; toggleStrike(): { run(): boolean }; toggleCode(): { run(): boolean } }
const as = (c: unknown) => c as MarkChain

mark("bold", "bold", "Bold", "Make text bold", ["strong", "b"], Bold, "Mod-b", 10, SLASH_ORDER.bold, (c) => as(c).toggleBold().run())
mark("italic", "italic", "Italic", "Make text italic", ["emphasis", "i"], Italic, "Mod-i", 20, SLASH_ORDER.italic, (c) => as(c).toggleItalic().run())
mark("strike", "strike", "Strikethrough", "Cross out text", ["strike", "s", "~"], Strikethrough, "Mod-Shift-s", 40, SLASH_ORDER.strikethrough, (c) => as(c).toggleStrike().run())
mark("code", "code", "Inline code", "Format text as inline code", ["code", "mono"], Code, "Mod-e", 50, SLASH_ORDER.inlineCode, (c) => as(c).toggleCode().run(), {
  HTMLAttributes: { class: "inline", spellcheck: "false" },
})

/**
 * Slack's formatting keys in a message box, beside ours, so a Slack person's
 * hands keep working (MC-4, D-M2): ⌘⇧X strikes through, ⌘⇧9 quotes, ⌘⌥⇧C
 * makes a code block. ⌘⌥8, the code block's key every editor lists, was bound
 * only by the doc's keymap, so the composer binds it here too. Slack's ⌘⇧C
 * for code only in the desktop app: a browser opens its inspector on it
 * (D-SD2). Never in a doc, where ⌘⇧9 is the to-do list and Notion's keys
 * stand. The shortcut table binds them (behaviour.ts).
 */
const slackKeys: ShortcutRow[] = [
  { keys: "Mod-Shift-x", label: "Strikethrough", group: "Text", order: 40, run: (e) => as(chain(e)).toggleStrike().run() },
  ...(isDesktopApp() ? [{ keys: "Mod-Shift-c", label: "Inline code", group: "Text", order: 50, run: (e: Editor) => as(chain(e)).toggleCode().run() }] : []),
  { keys: "Mod-Shift-9", label: "Quote", group: "Blocks", order: 90, run: (e) => chain(e).toggleBlockquote().run() },
  { keys: "Mod-Alt-Shift-c", alt: ["Mod-Alt-8"], label: "Code block", group: "Blocks", order: 100, run: (e) => chain(e).toggleCodeBlock().run() },
]

registerBlock({
  id: "slackKeys",
  editors: ["chat"],
  edition: "both",
  schema: [],
  shortcuts: slackKeys,
})
