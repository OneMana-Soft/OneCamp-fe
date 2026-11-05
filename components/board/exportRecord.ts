import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
// Only lazy chunks import this module (boardExcalidraw, boardExport). Excalidraw's chunk reaches these two
// already (boardExcalidraw -> adminHosts -> unfurlService), so they add no module to it (main's ruling, 2 Nov).
import axiosInstance from "@/lib/axiosInstance"
import { toast } from "@/hooks/use-toast"
import { BoardExportRoutes } from "@/services/endpoints/boards.exports"
import { tellRefusal } from "@/lib/export/exportTell"

/** What a board is exported as, in the server's words. */
export type BoardExportFormat = "pdf" | "picture" | "csv" | "file"

/** What a failed export says, wherever it ran. */
export const EXPORT_FAILED = { title: "The board couldn't be exported", description: "Try again. A large board's pictures can take a moment to read." }

/** What a refused export's toast is titled; its words say why (./exportTell's tellRefusal). */
export const EXPORT_REFUSED_TITLE = "The board wasn't exported"

/**
 * Tells the admin log of an export the browser is about to make (miro-44), before the file is made: an export the
 * log can't record isn't made (V-363), as a doc's isn't (lib/export/exportDoc). A refusal throws its words: the
 * server's for too many exports in a few minutes (429), or that the export couldn't be recorded.
 */
export async function recordBoardExport(boardId: string, format: BoardExportFormat): Promise<void> {
  if (!boardId) return
  try {
    await axiosInstance.post(BoardExportRoutes.RecordBoardExport, { board_uuid: boardId, format }, { suppressErrorToast: true })
  } catch (err) {
    throw new Error(tellRefusal(err))
  }
}

/** The class on each of the image dialog's buttons, in its order: PNG, SVG, then the clipboard's copy (pinned in exportRecord.test). */
export const PICTURE_BUTTON = "ImageExportModal__settings__buttons__button"

/** A press on the image dialog's PNG or SVG button. Its third, the clipboard's copy, saves no file. */
export function makesPicture(target: EventTarget | null): boolean {
  const button = target instanceof Element ? target.closest(`.${PICTURE_BUTTON}`) : null
  const row = button?.parentElement
  if (!button || !row) return false
  const at = Array.from(row.children)
    .filter((c) => c.classList.contains(PICTURE_BUTTON))
    .indexOf(button)
  return at === 0 || at === 1
}

const saveKey = (shift: boolean) => (e: KeyboardEvent): boolean => (e.metaKey || e.ctrlKey) && e.shiftKey === shift && !e.altKey && e.key.toLowerCase() === "s"
/** Ctrl or Cmd+S, the key Excalidraw saves a board file on. */
export const isSaveKey = saveKey(false)
/** Ctrl or Cmd+Shift+S, Excalidraw's save to disk: never the same press as a save, since Excalidraw runs none that two keys claim. */
export const isSaveAsKey = saveKey(true)

/**
 * The board's name as its own page's tab gives it ("(3) Kickoff · OneCamp", lib/utils/pageTitle, pinned in
 * exportRecord.test). It's read when the file is saved, so the page passes nothing for it. A call's stage, or
 * a tab that says only "Boards" (the sidebar lists 8 boards), knows no name.
 */
export function tabBoardName(boardId: string, path = window.location.pathname, title = document.title): string {
  if (path !== `/app/board/${boardId}`) return ""
  const label = /^(?:\(\d+\+?\) )?(.+) · OneCamp$/.exec(title)?.[1]?.trim() ?? ""
  return label === "Boards" ? "" : label
}

/** Excalidraw's two saves, by their action names, each with its own key. Ours replace both with the one told save. */
const SAVES = { saveToActiveFile: isSaveKey, saveFileToDisk: isSaveAsKey } as const

const imageDialogOpen = (state: { openDialog?: { name?: string } | null }) => state.openDialog?.name === "imageExport"

/**
 * Tells the exports Excalidraw makes itself, as the Export dialog's are: a picture at its image dialog's PNG or
 * SVG, and a board file on Ctrl or Cmd+S. A member's board runs it (boardExcalidraw's MemberExcalidraw, so the
 * board's page and a call's stage). A guest's viewer has no account to tell the log with.
 */
export function useBoardExportTrail(api: ExcalidrawImperativeAPI | null, boardId: string): void {
  // Read at each export, so a canvas that comes to show another board tells that one.
  const board = React.useRef(boardId)
  board.current = boardId

  React.useEffect(() => {
    if (!api) return
    // The image dialog exports the board as it was when the dialog opened, and Excalidraw refuses an empty one,
    // so a press there saves nothing to tell.
    let drawn = false
    // A PNG or SVG press is held until the log has the picture's tell, then pressed again for Excalidraw to make
    // it (V-363). That second press is ours, and passes.
    let passing: Element | null = null
    const onPress = (e: MouseEvent) => {
      if (!drawn || !makesPicture(e.target)) return
      const button = (e.target as Element).closest<HTMLElement>(`.${PICTURE_BUTTON}`)!
      if (passing === button) {
        passing = null
        return
      }
      e.preventDefault()
      e.stopImmediatePropagation()
      recordBoardExport(board.current, "picture").then(
        () => {
          if (!button.isConnected) return
          passing = button
          button.click()
          passing = null
        },
        (err: Error) => toast({ variant: "destructive", title: EXPORT_REFUSED_TITLE, description: err.message }),
      )
    }
    // Excalidraw portals its dialogs to the body, so the presses are heard on the document, and only while this
    // board's image dialog is open.
    let open = false
    const watch = (isOpen: boolean) => {
      if (isOpen === open) return
      open = isOpen
      drawn = open && api.getSceneElements().length > 0
      if (open) document.addEventListener("click", onPress, true)
      else document.removeEventListener("click", onPress, true)
    }
    watch(imageDialogOpen(api.getAppState()))
    const stop = api.onChange((_elements, appState) => watch(imageDialogOpen(appState)))

    // Excalidraw's own save names the file "Untitled-<date>", keeps its pictures as links and tells nothing.
    // Ours saves the Export dialog's board file, from the module the dialog shares (./exportRun), never the
    // dialog's own.
    const save = () => {
      const boardId = board.current
      import("@/components/board/exportRun")
        .then((m) => m.runBoardExport({ format: "file", make: () => m.saveBoardFile(api, tabBoardName(boardId)), boardId, toast }))
        .catch(() => toast({ variant: "destructive", ...EXPORT_FAILED }))
      return false as const
    }
    for (const [name, keyTest] of Object.entries(SAVES)) {
      api.registerAction({ name, label: "buttons.save", trackEvent: false, viewMode: true, perform: save, keyTest } as never)
    }
    return () => {
      stop()
      watch(false)
    }
  }, [api])
}
