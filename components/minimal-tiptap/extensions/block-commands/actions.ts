"use client"

import { ArrowDown, ArrowRightToLine, ArrowUp, Copy, Link2, MessageSquarePlus, Plus, Trash2 } from "@/lib/icons"
import { actionById, dialogFor, registerAction } from "@/components/docEditor/registry/registry"
import type { ActionContext, Surface } from "@/components/docEditor/registry/types"
import type { BlockTarget } from "./commands"

/**
 * The block actions (B1): what the block menu, the phone's block sheet and
 * the phone bar show for blocks. Each is the editor's own command of the same
 * work (blockKeys.ts), on the blocks the menu stood for (ctx.state.range) or
 * the chosen ones. Turn into and Text direction are the menu's own rows;
 * Colour (B2) and Ask AI (B9) are those packages' actions on 'blockMenu'.
 *
 * Registered as the doc's editor loads (blockOnly.ts imports this): the
 * surfaces that show them are drawn only once an editor exists.
 */

/**
 * The block menu's groups, in order (content.md D10): Turn into, Colour and
 * Text direction; Copy link and Duplicate; the moves; Comment; Ask AI; and
 * Delete, alone and last.
 */
export const BLOCK_MENU_GROUPS = ["style", "block", "move", "comment", "ai"]

type Cmds = Record<string, ((...a: unknown[]) => unknown) | undefined>
type Chain = Record<string, (...a: unknown[]) => { run(): boolean }>

/**
 * What the menu stood for: the chosen blocks' ids (ctx.state.blocks, so
 * blocks chosen apart never take in those between them), else their range.
 */
const range = (ctx: ActionContext): BlockTarget => {
  const ids = ctx.state?.blocks
  if (Array.isArray(ids) && ids.length && ids.every((id) => typeof id === "string" && id)) return ids as string[]
  return (ctx.state?.range as { from: number; to: number } | undefined) ?? null
}
const gate = (ctx: ActionContext) => ctx.gate ?? { ai: false }

/** Whether the editor's command would do something here (asked dry). */
const can = (ctx: ActionContext, name: string, ...args: unknown[]) => {
  const dry = ctx.editor?.can() as unknown as Cmds | undefined
  return ctx.canEdit && typeof dry?.[name] === "function" && !!dry[name]!(...args)
}

/** Runs the editor's command; back in the text, except from the phone's sheet (no keyboard pops up). */
const exec = (ctx: ActionContext, name: string, ...args: unknown[]) => {
  const editor = ctx.editor
  if (!editor) return
  const chain = (ctx.state?.via === "press" ? editor.chain() : editor.chain().focus()) as unknown as Chain
  chain[name]?.(...args).run()
}

/** One block action, run by the editor's command of the same work. */
function blockAction(id: string, label: string, icon: typeof Copy, group: string, order: number, surfaces: Surface[], name: string, args: (ctx: ActionContext) => unknown[], more: Partial<Parameters<typeof registerAction>[0]> = {}) {
  registerAction({
    id,
    label,
    icon,
    group,
    order,
    surfaces,
    edition: "both",
    shortcutScope: "editor",
    isEnabled: (ctx) => can(ctx, name, ...args(ctx)),
    run: (ctx) => exec(ctx, name, ...args(ctx)),
    ...more,
  })
}

const inRange = (ctx: ActionContext) => [range(ctx)]

blockAction("block.copyLink", "Copy link to block", Link2, "block", 10, ["blockMenu"], "copyBlockLink", inRange, {
  shortcut: "Alt-Shift-l",
  // A link needs no right to edit.
  isEnabled: (ctx) => !!ctx.editor,
})
blockAction("block.duplicate", "Duplicate", Copy, "block", 20, ["blockMenu", "phoneBar"], "duplicateBlocks", inRange, { shortcut: "Mod-d" })
blockAction("block.moveUp", "Move up", ArrowUp, "move", 10, ["blockMenu"], "moveBlocks", (ctx) => [-1, range(ctx)], { shortcut: "Mod-Shift-ArrowUp" })
blockAction("block.moveDown", "Move down", ArrowDown, "move", 20, ["blockMenu"], "moveBlocks", (ctx) => [1, range(ctx)], { shortcut: "Mod-Shift-ArrowDown" })
blockAction("block.delete", "Delete", Trash2, "delete", 10, ["blockMenu", "phoneBar"], "deleteBlocks", inRange, { destructive: true, shortcut: "Delete" })
// The phone bar's "+": a line under the caret's block, with "/" open in it.
blockAction("block.add", "Add a block", Plus, "insert", 5, ["phoneBar"], "addLineBelow", () => [], {
  run: (ctx) => void ctx.editor?.chain().focus().addLineBelow().insertContent("/").run(),
})

// Move to… shows only while B6's dialog is there; the dialog takes the blocks
// staged here. A child page's block has its own, which moves the page (docs C7a).
registerAction({
  id: "block.moveTo",
  label: "Move to…",
  icon: ArrowRightToLine,
  group: "move",
  order: 30,
  surfaces: ["blockMenu"],
  edition: "both",
  isVisible: (ctx) => ctx.canEdit && !!dialogFor("doc.moveTo", gate(ctx)) && !actionById("subpage.moveTo", gate(ctx))?.isVisible?.(ctx),
  run: (ctx) =>
    void import("@/components/docEditor/blockMove").then((m) => {
      if (ctx.editor && m.stageBlockMove(ctx.docId, ctx.editor, range(ctx))) ctx.bus.emit("openDialog", { id: "doc.moveTo" })
    }),
})

// Comment is A1's text.comment (A8's threads and B7 take it), on the blocks' text.
registerAction({
  id: "block.comment",
  label: "Comment",
  icon: MessageSquarePlus,
  group: "comment",
  order: 10,
  surfaces: ["blockMenu"],
  edition: "both",
  isVisible: (ctx) => !!actionById("text.comment", gate(ctx)) && !!ctx.editor && (ctx.editor.can() as unknown as Cmds).selectBlockText?.(range(ctx)) === true,
  run: (ctx) => {
    exec(ctx, "selectBlockText", range(ctx))
    void actionById("text.comment", gate(ctx))?.run(ctx)
  },
})
