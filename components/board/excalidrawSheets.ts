import type { ForeignSheet } from "@/components/ui/foreignSheets"

/**
 * Excalidraw's own overlays, each the app's sheet on a phone (miro-40 H1):
 * the board docks them through components/ui/foreignSheets. Their roots are
 * Excalidraw's class names, so app/excalidrawSheetsGuard.test.ts holds this
 * list to the version it was checked against (the test keeps that version:
 * the copy rules allow no version number in the app's own source), each
 * overlay opened at 390, and holds every overlay root that version's bundle
 * draws (a Radix popover, a dialog, a portal) to being docked or named.
 */

export const EXCALIDRAW_SHEETS: readonly ForeignSheet[] = [
  { name: "the main menu, More tools and the library's menu", classes: ["dropdown-menu", "App-toolbar__extra-tools-dropdown"], detent: "menu" },
  { name: "a long press's menu", classes: ["context-menu"], box: ".popover", detent: "menu" },
  { name: "the shape panel's popovers: the colour pickers, the font list, the arrowheads' picker", classes: ["color-picker-content", "properties-content", "picker"], box: "[data-radix-popper-content-wrapper]", detent: "medium" },
  { name: "a link's editor", classes: ["excalidraw-hyperlinkContainer"], detent: "medium" },
  { name: "linking to an object", classes: ["ElementLinkDialog"], detent: "medium" },
  { name: "the dialogs: Help, Save as image, a confirm", classes: ["Modal__content"], detent: "large", actions: ["ImageExportModal__settings__buttons", "confirm-dialog-buttons"] },
  { name: "the library", classes: ["sidebar"], detent: "large" },
]

/** Every overlay family in Excalidraw's stylesheet: docked above, or named below. */
export const EXCALIDRAW_FAMILIES: readonly string[] = [
  "dropdown-menu",
  "App-toolbar__extra-tools-dropdown",
  "context-menu",
  "popover",
  "color-picker-content",
  "excalidraw-hyperlinkContainer",
  "ElementLinkDialog",
  "Modal__content",
  "sidebar",
  "exc-stats",
  "excalidraw-tooltip",
  "Toast",
  "follow-mode",
  "excalidraw-eye-dropper-container",
]

/** Families and roots the board never shows as an overlay on a phone, each with why. */
export const EXCALIDRAW_NOT_SHOWN: Readonly<Record<string, string>> = {
  popover: "the box around a long press's menu, which docks as that menu's sheet",
  "exc-stats": "Stats for nerds: nothing on the board opens it",
  "excalidraw-tooltip": "a hover hint, and a phone has no hover",
  Toast: "Excalidraw's own toast: a toast, never a sheet",
  "follow-mode": "following someone in Excalidraw's own collaboration, which the board replaces with its own",
  "excalidraw-eye-dropper-container": "the eye dropper picks a colour off the canvas: a mode over the whole board, holding nothing",
  "excalidraw-eye-dropper-preview": "the eye dropper's swatch beside the pointer while it picks: part of that mode, holding nothing",
  "color-picker-container": "the shape panel's colour row, which Excalidraw marks a dialog: a row of the panel, whose pickers dock",
  FontPicker__container: "the shape panel's font row, which Excalidraw marks a dialog: a row of the panel, whose font list docks",
  Island: "a panel, the root of an overlay only in the list of who else is on the board (its UserList), from Excalidraw's own collaboration, which the board replaces with its own",
}
