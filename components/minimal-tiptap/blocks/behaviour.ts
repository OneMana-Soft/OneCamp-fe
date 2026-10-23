"use client"

/**
 * What every editor does beyond its blocks: the selection's wash, typography,
 * clearing marks, the placeholder, "/", the composer's Enter, and the live
 * document with other people's carets. None writes a node or a mark.
 */

import { Extension } from "@tiptap/core"
import { Typography } from "@tiptap/extension-typography"
import { Placeholder } from "@tiptap/extension-placeholder"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCursor from "@tiptap/extension-collaboration-cursor"
import { Eraser } from "@/lib/icons"
import { registerBlock } from "@/components/docEditor/registry/registry"
import { collaboratorCaret, collaboratorSelection } from "@/components/docEditor/registry/presence"
import { Selection } from "../extensions/selection/selection"
import { CaretFromScreen } from "../extensions/selection/caretFromScreen"
import { UnsetAllMarks } from "../extensions/unset-all-marks/unset-all-marks"
import { ResetMarksOnEnter } from "../extensions/reset-marks-on-enter/reset-marks-on-enter"
import { SlashCommand } from "../extensions/slash-command/slashCommandExtension"
import { isSlashMenuOpen, type SlashCommandItem } from "../extensions/slash-command/slashCommand"
import { suggestionMenuOpen } from "../extensions/suggestion-popup"
import { slashItemsFor } from "@/components/docEditor/registry/readers"
import { shortcutTableExtensions } from "@/components/docEditor/registry/shortcuts"
import { EVERY_EDITOR, ORDER, SLASH_ORDER, TYPING_EDITORS } from "./kinds"

registerBlock({ id: "selection", editors: EVERY_EDITOR, edition: "both", order: ORDER.selection, extensions: [Selection, CaretFromScreen], schema: [] })

/**
 * The automatic symbols kept as you type: curly quotes, dashes, arrows, the
 * ellipsis and © ® ™. Off: superscripts, fractions, ±, ≠, × and « », which
 * changed what was typed ("$x^2$" became "$x²$", "1920x1080" "1920×1080",
 * "<<" "«") more often than anyone asked for them (small-details T29).
 */
export const TYPOGRAPHY = {
  superscriptTwo: false,
  superscriptThree: false,
  oneHalf: false,
  oneQuarter: false,
  threeQuarters: false,
  plusMinus: false,
  notEqual: false,
  multiplication: false,
  laquo: false,
  raquo: false,
} as const

registerBlock({ id: "typography", editors: EVERY_EDITOR, edition: "both", order: ORDER.typography, extensions: [Typography.configure(TYPOGRAPHY)], schema: [] })

registerBlock({
  id: "unsetAllMarks",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.unsetAllMarks,
  extensions: [UnsetAllMarks],
  schema: [],
  slash: [
    {
      id: "clearFormatting",
      title: "Clear formatting",
      description: "Remove all text formatting",
      aliases: ["clear", "unformat", "plain"],
      icon: Eraser,
      section: "Format",
      order: SLASH_ORDER.clearFormatting,
      editors: TYPING_EDITORS,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).unsetAllMarks().run()
      },
    },
  ],
  shortcuts: [{ keys: "Mod-\\", label: "Clear formatting", group: "Text", order: 70 }],
})

registerBlock({ id: "resetMarksOnEnter", editors: EVERY_EDITOR, edition: "both", order: ORDER.resetMarksOnEnter, extensions: [ResetMarksOnEnter], schema: [] })

// Tiptap's placeholder. A host's own text ("Message #design") speaks for the
// whole box, shown only while it is empty; with none, a doc's empty block says
// what it is. A package can stand in for it (BlockSpec.replaces).
registerBlock({
  id: "tiptap-placeholder",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.placeholder,
  create: (ctx) => [
    Placeholder.configure({
      placeholder: ({ editor, node }) => {
        const placeholder = ctx.placeholderOf()
        if (placeholder?.trim()) {
          if (!editor.isEmpty) return ""
          if (node.type.name === "paragraph") return placeholder
          if (node.type.name === "heading") return `Heading ${node.attrs.level}`
          if (node.type.name === "blockquote") return "Empty quote"
          return ""
        }
        if (node.type.name === "heading") return `Heading ${node.attrs.level}`
        if (node.type.name === "paragraph") return "Type / for blocks, @ for people"
        if (node.type.name === "blockquote") return "Empty quote"
        return ""
      },
      showOnlyWhenEditable: true,
      showOnlyCurrent: ctx.showOnlyCurrentPlaceholder ?? false,
      includeChildren: false,
    }),
  ],
  schema: [],
})

// "/": the host's items when it gives them (the chat composer's commands),
// else what the registry offers this kind of editor (registry/readers.ts
// slashItemsFor): a doc's blocks and, behind the AI gate, its AI items. A
// message box also offers its conversation's commands; a doc, a guest's page
// and a task never do.
registerBlock({
  id: "slash",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.slash,
  create: (ctx) => [
    SlashCommand.configure({
      commands: (ctx.slashCommands as SlashCommandItem[] | undefined) ?? slashItemsFor(ctx.kind, ctx.gate),
      conversation: ctx.kind === "chat",
    }),
  ],
  schema: [],
  shortcuts: [{ typed: ["/"], label: "Insert a block", group: "Blocks", order: 10 }],
})

// The composer's Enter sends (onSubmit), except while a menu is up: then
// Enter picks its row. Shift-Enter is a line break, or a new line in code.
// In chat, Enter in a list or code adds a line; Mod-Enter sends (MC-BUG-5).
// Escape cancels where the host says what that means (an edit in place,
// whose hint says "esc cancel"), again after any menu that is up: a handler
// outside the editor never saw it, the editor's keymap having taken it (F-05).
registerBlock({
  id: "submit",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.submit,
  create: (ctx) => [
    Extension.create({
      name: "submitShortcut",
      addKeyboardShortcuts() {
        const composer = ctx.kind === "chat"
        // False, not true: unhandled, so the menu's own key handler runs.
        const menuUp = () => isSlashMenuOpen() || suggestionMenuOpen(this.editor)
        return {
          Enter: () => {
            if (menuUp()) return false
            if (composer && (this.editor.isActive("listItem") || this.editor.isActive("codeBlock"))) return false
            if (ctx.onSubmitRef?.current) return ctx.onSubmitRef.current()
            return false
          },
          "Mod-Enter": () => {
            if (!composer || menuUp() || !ctx.onSubmitRef?.current) return false
            return ctx.onSubmitRef.current()
          },
          Escape: () => {
            if (menuUp() || !ctx.onCancelRef?.current) return false
            return ctx.onCancelRef.current()
          },
          "Shift-Enter": () => {
            if (this.editor.isActive("codeBlock")) return this.editor.commands.newlineInCode()
            return this.editor.commands.setHardBreak()
          },
        }
      },
    }),
  ],
  schema: [],
})

// The live document, and other people's carets in their hue. Yjs keeps the
// history (your own changes only), so StarterKit's is off.
registerBlock({
  id: "collaboration",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.collaboration,
  create: (ctx) => {
    const c = ctx.collaboration
    if (!c?.enabled || !ctx.provider) return []
    return [
      Collaboration.configure({ document: ctx.provider.document, field: "default" }),
      CollaborationCursor.configure({
        provider: ctx.provider,
        user: { name: c.username, color: c.color || "#f783ac", id: c.userId || c.documentId, profileKey: c.profileKey, hue: c.hue },
        render: (user) => collaboratorCaret(user, ctx.gate),
        selectionRender: collaboratorSelection,
      }),
    ]
  },
  schema: [],
  shortcuts: [
    { keys: "Mod-z", label: "Undo", group: "Doc", order: 40 },
    { keys: "Mod-Shift-z", label: "Redo", group: "Doc", order: 50 },
  ],
})

// The shortcut table's own keys (registry/shortcuts.ts): every row with run,
// in every editor whose blocks have such rows (the doc's, and the chat
// composer's Slack keys, text.ts). An editor with none gets no extension.
registerBlock({
  id: "shortcutTable",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.shortcutTable,
  create: (ctx) => shortcutTableExtensions(ctx.kind, ctx.gate),
  schema: [],
})
