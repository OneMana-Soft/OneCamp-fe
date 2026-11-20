// What the board's lazy pieces draw and write with, handed to them from the board's own chunk (V-1262). The workbench
// loads every one of these already (the notes bar's parts and icons, the sticky tool's keys, starring's doc graph), so
// a piece that takes them from here costs the board nothing. A piece that imported them itself would add its chunk
// to each one's set of chunk groups, and Turbopack, which buckets a group's modules by that set, would re-cut the
// chunks of every route and lazy view that holds them: the mind-map bar's own imports gave the doc editor a third copy
// and lifted every app route (a lazy chunk never imports the shared core). app/firstLoad.test.ts pins the mind-map bar
// off every module imported here.
import { FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import { BarPicker } from "@/components/board/barPicker"
import { notForTheBoard } from "@/components/board/boardKeys"
import { ChevronDown, Ellipsis, Plus } from "@/lib/icons"
import { createDoc, deleteDoc } from "@/services/docGraphService"

export const BOARD_KIT = {
  /** A bar's buttons, divider and More picker (a popover, a drawer on a phone), as the notes bar draws them. */
  FloatingBarButton,
  FloatingBarDivider,
  BarPicker,
  icons: { ChevronDown, Ellipsis, Plus },
  /** Whether a key event belongs to a text field or a dialog rather than to the board. */
  notForTheBoard,
  /** A new doc, and the trash for one that couldn't be finished (they refresh the doc tree and lists). */
  createDoc,
  deleteDoc,
}

export type BoardKit = typeof BOARD_KIT
