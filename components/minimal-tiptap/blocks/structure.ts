"use client"

/**
 * The divider, the code block and the read-only blocks agents write (a poll,
 * a chart, a diff, a meeting recording), in every editor: a message or a doc
 * holding one keeps it. What draws a poll, chart, diff or recording loads the
 * first time one shows, and so does the code block's highlighting, so an
 * editor that never holds one (the chat composer) never fetches them (I20).
 */

import type { Editor } from "@tiptap/core"
import { Code, Minus } from "@/lib/icons"
import { registerBlock } from "@/components/docEditor/registry/registry"
import { HorizontalRule } from "../extensions/horizontal-rule/horizontal-rule"
import { LazyCodeBlock } from "../extensions/code-block-lowlight/lazyCodeBlock"
import { Poll } from "../extensions/poll/poll"
import { RecordingEmbed } from "../extensions/recording-embed/recording-embed"
import { ChartEmbed } from "../extensions/chart-embed/chart-embed"
import { DiffEmbed } from "../extensions/diff-embed/diff-embed"
import { EVERY_EDITOR, ORDER, SLASH_ORDER } from "./kinds"

registerBlock({
  id: "horizontalRule",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.horizontalRule,
  extensions: [HorizontalRule],
  schema: [{ kind: "node", name: "horizontalRule", attrs: [] }],
  slash: [
    {
      id: "horizontalRule",
      title: "Divider",
      description: "Insert a horizontal divider",
      aliases: ["hr", "---", "line", "separator", "rule"],
      kbd: ["---"],
      icon: Minus,
      section: "Basic",
      order: SLASH_ORDER.horizontalRule,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run()
      },
    },
  ],
  shortcuts: [{ typed: ["---"], label: "Divider", group: "Blocks", order: 110 }],
})

registerBlock({
  id: "codeBlock",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.codeBlock,
  extensions: [LazyCodeBlock],
  schema: [{ kind: "node", name: "codeBlock", attrs: ["language"] }],
  slash: [
    {
      id: "codeBlock",
      title: "Code block",
      description: "Insert a code block",
      aliases: ["code", "```", "pre", "snippet"],
      kbd: ["```"],
      icon: Code,
      section: "Basic",
      order: SLASH_ORDER.codeBlock,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).setCodeBlock().run()
      },
    },
  ],
  turnInto: {
    id: "code",
    label: "Code",
    icon: Code,
    order: 90,
    detect: 31,
    isActive: (e: Editor) => e.isActive("codeBlock"),
    run: (e: Editor) => e.chain().focus().toggleCodeBlock().run(),
  },
  snapshotClass: ["pre", "block-node"],
  excludesTypography: true,
  wide: true,
  shortcuts: [{ keys: "Mod-Alt-8", typed: ["```"], label: "Code block", group: "Blocks", order: 100 }],
})

// Polls render in messages (read-only editors) and survive a re-edit.
registerBlock({ id: "poll", editors: EVERY_EDITOR, edition: "both", order: ORDER.poll, extensions: [Poll], schema: [{ kind: "node", name: "poll", attrs: ["id"] }] })

// The meeting-recap agent's "Play recording" block.
registerBlock({
  id: "recordingEmbed",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.recordingEmbed,
  extensions: [RecordingEmbed],
  schema: [{ kind: "node", name: "recordingEmbed", attrs: ["egress", "kind", "sid", "u1", "u2"] }],
  wide: true,
})

// An agent's reply: ```chart becomes a chart, inline in a message or a doc.
registerBlock({ id: "chartEmbed", editors: EVERY_EDITOR, edition: "both", order: ORDER.chartEmbed, extensions: [ChartEmbed], schema: [{ kind: "node", name: "chartEmbed", attrs: ["spec"] }], wide: true })

registerBlock({ id: "diffEmbed", editors: EVERY_EDITOR, edition: "both", order: ORDER.diffEmbed, extensions: [DiffEmbed], schema: [{ kind: "node", name: "diffEmbed", attrs: ["diff"] }], wide: true })
