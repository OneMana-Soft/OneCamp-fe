"use client"

import * as React from "react"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { answerBlockMenu, type BlockMenuRequest } from "@/components/minimal-tiptap/extensions/block-commands/menuRequest"
import { useBlockLinks } from "@/components/minimal-tiptap/extensions/block-link/useBlockLinks"

// The menu and the sheet load on first use; the host only listens.
const BlockMenuPopover = React.lazy(() => import("./BlockMenuPopover"))
const BlockSheet = React.lazy(() => import("./BlockSheet"))

/**
 * THE BLOCK MENU (B1; editor.md P0-3; content.md D10). The handle's ⋮⋮ click
 * and ⌘/ open it for the block (or the chosen blocks); a phone's long-press
 * opens the same actions as a sheet (BlockSheet.tsx). It is the registry
 * surface `blockMenu` (WAVE_B_CONTRACTS): a package adds a block action by
 * registering it there (B2's Colour, B9's Ask AI), and it shows here with
 * nothing else edited. Turn into and Text direction are the menu's own rows,
 * each with its list beside it.
 *
 * Search actions filters everything, the two lists' entries included. All of
 * it works from the keyboard: ↑ ↓ move, → opens a list and ← or Esc closes
 * it, ↩ runs, Esc closes the menu with the blocks still chosen.
 *
 * Before an action runs, its blocks are selected (a NodeSelection for one, a
 * block selection for several) and it is given ctx.state.blocks (their ids,
 * in document order: what an action acts on, so blocks chosen apart never
 * take in those between them), ctx.state.range (the span they cover) and
 * ctx.state.anchor (where the menu stood, in viewport px).
 */

/**
 * The block menu's host: one per doc editor, in its overlay slot. It answers
 * the handle, ⌘/ and a long-press, and follows the doc's block links
 * (useBlockLinks: the jump, its flash and the Back chip).
 */
export default function BlockMenuHost({ docId, editor }: SlotProps) {
  const [request, setRequest] = React.useState<BlockMenuRequest | null>(null)
  const back = useBlockLinks(editor ?? null, docId)

  React.useEffect(() => {
    if (!editor) return
    return answerBlockMenu(editor, setRequest)
  }, [editor])

  // A phone (MediaQueryContext's isMobile: under 640 px) gets the sheet; read here, so the host needs no provider.
  const sheet = !!request && (request.via === "press" || (typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches))
  const close = React.useCallback(
    (refocus: boolean) => {
      setRequest(null)
      // A phone's sheet gives the doc back without its keyboard.
      if (!editor || editor.isDestroyed || sheet) return
      // Back to the doc, the blocks still chosen; unless an action opened
      // something of its own (a picker, a dialog) that holds focus now.
      setTimeout(() => {
        const el = document.activeElement
        if (!editor.isDestroyed && (refocus || !el || el === document.body)) editor.view.focus()
      }, 0)
    },
    [editor, sheet],
  )

  if (!editor) return back
  return (
    <>
      {request && !sheet ? <React.Suspense fallback={null}><BlockMenuPopover editor={editor} docId={docId} request={request} onClose={close} /></React.Suspense> : null}
      {request && sheet ? (
        <React.Suspense fallback={null}>
          <BlockSheet editor={editor} docId={docId} request={request} onClose={close} />
        </React.Suspense>
      ) : null}
      {back}
    </>
  )
}
