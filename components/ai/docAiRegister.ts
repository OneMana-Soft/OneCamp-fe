// Doc AI (B9; AI edition only): the bar at the text, the empty doc's row,
// agents' margin marks, AI activity. Only registers: the rest loads on use.

import { AlignLeft, ScrollText, Sparkles } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics/motifs"
import { registerAction, registerBlock, registerDialog, registerSlot } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import type { BarRequest } from "./docAiStore"

// The bar on the selection, or the block menu's range, anchor and blocks
// (chosen ids, read alone); state.prompt is what followed "/".
function open(ctx: ActionContext, ask: Pick<BarRequest, "mode" | "action" | "source">) {
  const editor = ctx.editor
  if (!editor) return
  const s = ctx.state ?? {}
  const r = (s.range as { from: number; to: number } | undefined) ?? editor.state.selection
  const prompt = typeof s.prompt === "string" && s.prompt.trim() ? s.prompt.trim() : undefined
  const action = ask.action ?? (prompt ? "write" : undefined)
  const blocks = Array.isArray(s.blocks) && s.blocks.length ? (s.blocks as string[]) : undefined
  // What the person may do decides how an answer is given (outputKind).
  const canChange = ctx.abilities ? ctx.abilities.askWrite : ctx.canEdit
  void import("./docAiStore").then((m) =>
    m.openAiBar(editor, { ...ask, action, prompt, blocks, canChange, docId: ctx.docId, from: r.from, to: r.to, anchor: s.anchor as BarRequest["anchor"] }),
  )
}

registerAction({
  id: "aiBar.open",
  label: "Ask AI",
  icon: Spark,
  group: "ai",
  order: 10,
  surfaces: ["selection", "phoneBar", "blockMenu", "palette"],
  shortcut: "Mod-j",
  shortcutScope: "editor",
  edition: "ai",
  // A reader too: Ask AI's reading actions need only view (lib/docs/abilities
  // askRead; docs incident, 14 Oct 2026).
  isEnabled: (ctx) => !!ctx.editor && (ctx.canEdit || !!ctx.abilities?.askRead),
  run: (ctx) => open(ctx, { mode: "actions", source: "action" }),
})

registerAction({
  id: "ai.askDoc",
  label: "Ask AI about this doc",
  icon: Spark,
  group: "doc",
  order: 24,
  surfaces: ["palette", "phoneSheet"],
  shortcut: "Mod-Shift-j",
  shortcutScope: "editor",
  shortcutOrder: 10,
  edition: "ai",
  isEnabled: (ctx) => !!ctx.editor,
  run: (ctx) => open(ctx, { mode: "ask", source: "action" }),
})

// "/" keeps A1's ids, so Recent still finds them.
registerAction({
  id: "ai-write",
  label: "Write with AI",
  description: "Write, change or ask, at the caret",
  aliases: ["ai", "write", "draft", "generate", "ask"],
  icon: Sparkles,
  group: "AI",
  order: 10,
  surfaces: ["slash"],
  edition: "ai",
  run: (ctx) => open(ctx, { mode: "actions", source: "slash" }),
})

registerAction({
  id: "ai-summarize",
  label: "Summarise with AI",
  description: "A summary of the whole doc, at the caret",
  aliases: ["ai", "summary", "summarize", "tldr"],
  icon: AlignLeft,
  group: "AI",
  order: 20,
  surfaces: ["slash"],
  edition: "ai",
  run: (ctx) => open(ctx, { mode: "actions", action: "summarize", source: "slash" }),
})

registerAction({
  id: "ai.activity",
  label: "AI activity",
  icon: ScrollText,
  group: "doc",
  order: 25,
  surfaces: ["more", "phoneSheet", "palette"],
  edition: "ai",
  run: (ctx) => ctx.bus.emit("openDialog", { id: "ai.activity" }),
})

registerDialog({ id: "ai.activity", edition: "ai", load: () => import("./DocAiActivityDialog") })

// The bar's keys and pins, on the doc page's editor from when it is made
// (docAiPlugin.ts); the overlay, which loads later, only draws the bar.
registerBlock({
  id: "ai.markers",
  editors: ["doc"],
  edition: "ai",
  schema: [],
  load: () => import("./docAiPlugin").then((m) => m.docAiMarkersFor),
})
registerSlot({ slot: "editorOverlay", id: "ai.bar", edition: "ai", load: () => import("./DocAiOverlay") })
registerSlot({ slot: "emptyStarter", id: "ai.draft", edition: "ai", order: 20, load: () => import("./DocAiStarter") })
registerSlot({ slot: "gutter", id: "ai.agentEdits", edition: "ai", load: () => import("./DocAiAgentEdits") })
