"use client"

/**
 * Comments' registry entry (docs programme B7): the doc's comments in its
 * editor (Comment claimed, the threads drawn on their words, a reader's
 * Comment button) and the margin's markers. Both load, in one chunk, when
 * the doc's editor first draws them; this module is all a doc's page carries
 * of them.
 *
 * The integrator adds `import '@/components/docComments/register'` to
 * components/docEditor/registry/index.ts when B7 merges.
 */
import { registerSlot } from "@/components/docEditor/registry/registry"

/** Both pieces, from one chunk (inDocSlots): loaded once, whichever draws first. */
const inDoc = () => import("./inDocSlots")

registerSlot({
    slot: "editorOverlay",
    id: "comments",
    edition: "both",
    load: () => inDoc().then((m) => ({ default: m.CommentsOverlay })),
})

registerSlot({
    slot: "gutter",
    id: "comments",
    edition: "both",
    load: () => inDoc().then((m) => ({ default: m.ThreadGutter })),
})
