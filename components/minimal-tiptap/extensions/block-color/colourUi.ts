"use client"

import { createElement } from "react"
import type { Editor } from "@tiptap/core"
import { Baseline } from "@/lib/icons"
import { registerAction, registerBlock, registerDialog } from "@/components/docEditor/registry/registry"
import type { SlashEntry } from "@/components/docEditor/registry/types"
import { COLOUR_LABEL, DOC_COLOURS, inkOf, tintOf, type DocColour } from "@/lib/docColours"
import { DOC_EDITORS } from "../../blocks/kinds"

/**
 * The colour UI (B2; editor.md P1-2), registered as the colour chunk loads,
 * before any doc editor is built: "/red", "/sky background", "/grey" and
 * "/gray" for the caret's block, and Colour (colour.open) on the selection
 * bar, the block menu and the phone's bar, which opens the grid
 * (docEditor/ColourGrid.tsx, loaded the first time it opens).
 */

type Pick = { colour: DocColour | null; background: boolean }
type Chain = { setBlockColour(p: Pick): { run(): boolean } }

const swatch = (c: DocColour | null, bg: boolean) =>
  function ColourSwatch() {
    return createElement(
      "span",
      {
        "aria-hidden": true,
        className: "grid size-5 place-items-center rounded-[5px] text-[13px] font-[590] ring-1 ring-inset ring-line",
        style: { color: c && !bg ? inkOf(c) : "var(--ink)", background: c && bg ? tintOf(c) : undefined },
      },
      bg && !c ? null : "A",
    )
  }

const entry = (c: DocColour | null, bg: boolean): SlashEntry => {
  const name = c ? COLOUR_LABEL[c] : "Default"
  return {
    id: `colour.${c ?? "default"}${bg ? "_background" : ""}`,
    title: bg ? `${name} background` : c ? name : "Default colour",
    description: bg ? (c ? `A ${name.toLowerCase()} background for this block` : "No background behind this block") : `${name} text for this block`,
    aliases: c ? [bg ? `${c} background` : c] : [],
    section: "Colour",
    icon: swatch(c, bg),
    run: (editor, range) => {
      ;(editor.chain().focus().deleteRange(range) as unknown as Chain).setBlockColour({ colour: c, background: bg }).run()
    },
  }
}

registerBlock({
  id: "colourSlash",
  editors: DOC_EDITORS,
  edition: "both",
  schema: [],
  slash: [false, true].flatMap((bg) => [null, ...DOC_COLOURS].map((c) => entry(c, bg))),
})

/** What the grid was opened on: the editor, the block menu's blocks and where it stood. */
export interface ColourAsk {
  editor: Editor
  range: { from: number; to: number } | null
  /** The block menu's chosen blocks, by id in document order (B1): preferred to range, so blocks chosen apart never colour what lies between. */
  blocks?: string[] | null
  anchor: { left: number; top: number; bottom: number } | null
}
let asked: ColourAsk | null = null
const heard = new Set<() => void>()
export const colourAsk = () => asked
/** Lets the ask (and its editor) go, once the grid has closed. */
export const clearColourAsk = () => {
  asked = null
}
export const onColourAsk = (l: () => void) => (heard.add(l), () => void heard.delete(l))

registerAction({
  id: "colour.open",
  label: "Colour",
  icon: Baseline,
  group: "style",
  surfaces: ["selection", "phoneBar", "blockMenu"],
  edition: "both",
  isEnabled: (ctx) => !!ctx.editor?.isEditable && ctx.canEdit && !ctx.editor.isActive("codeBlock"),
  run: (ctx) => {
    if (!ctx.editor) return
    const blocks = ctx.state?.blocks
    asked = {
      editor: ctx.editor,
      range: (ctx.state?.range as ColourAsk["range"]) ?? null,
      blocks: Array.isArray(blocks) ? blocks.filter((b): b is string => typeof b === "string") : null,
      anchor: (ctx.state?.anchor as ColourAsk["anchor"]) ?? null,
    }
    heard.forEach((l) => l())
    ctx.bus.emit("openDialog", { id: "doc.colour" })
  },
})

registerDialog({ id: "doc.colour", edition: "both", load: () => import("@/components/docEditor/ColourGrid") })
