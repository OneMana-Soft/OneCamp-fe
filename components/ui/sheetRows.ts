/**
 * A phone sheet's footer row and its line under the title: one spelling for
 * every sheet (the shared one, ./responsive-sheet; the frame a lazily loaded
 * sheet shows, ./sheetFrame; a board comment's sheet), so they can't drift.
 * A module of its own, so a page that lays out a sheet's footer doesn't carry
 * the frame (4.4 KB of source on the board's first screen, miro-40 H1).
 */
export const SHEET_FOOTER_ROW = "flex flex-col-reverse gap-2 sm:flex-row [&>*]:h-11 sm:[&>*]:flex-1"
export const SHEET_LINE = "mt-0.5 text-meta text-ink-3"
