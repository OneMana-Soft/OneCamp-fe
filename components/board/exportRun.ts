import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import type { ExportElement } from "@/lib/board/exportBoard"
import type { useToast } from "@/hooks/use-toast"
import { urlToDataURL } from "@/lib/utils/file/urlToDataURL"
import { downloadFile, exportFileName } from "@/lib/export/download"
import { EXPORT_FAILED, recordBoardExport, type BoardExportFormat } from "@/components/board/exportRecord"

// What both export paths run, the Export dialog (./boardExport) and Ctrl or Cmd+S (./exportRecord), in a module
// of its own: the key, which rides in Excalidraw's lazy chunk wherever a board's canvas draws (a call's stage, a
// guest's viewer), loads only this. Loading the dialog's module there would carry the dialog's chunks to each
// of those places (main's ruling, 2 Nov).

/**
 * The board as an .excalidraw file named after it ("Board" when no name is
 * known), its pictures read into it so it opens anywhere. What's said of it.
 */
export async function saveBoardFile(api: ExcalidrawImperativeAPI, title: string): Promise<string> {
  const name = exportFileName(title || "Board")
  const elements = api.getSceneElements() as unknown as ExportElement[]
  const excalidraw = await import("@excalidraw/excalidraw")
  const files: Record<string, unknown> = {}
  const used = new Set(elements.map((e) => (e as { fileId?: string }).fileId).filter(Boolean))
  let missing = 0
  for (const [id, f] of Object.entries(api.getFiles())) {
    if (!used.has(id)) continue
    const dataURL = await urlToDataURL(String((f as { dataURL?: string }).dataURL ?? ""))
    if (dataURL) files[id] = { ...(f as object), dataURL }
    else missing++
  }
  const json = excalidraw.serializeAsJSON(api.getSceneElements(), api.getAppState(), files as never, "local")
  downloadFile(`${name}.excalidraw`, json, "application/vnd.excalidraw+json")
  return missing > 0 ? `Saved as ${name}.excalidraw, without ${missing} ${missing === 1 ? "picture" : "pictures"} that couldn't be read` : `Saved as ${name}.excalidraw`
}

/**
 * An export made, said, and told to the admin log once its file is made
 * (./exportRecord): the Export dialog's and Ctrl or Cmd+S's alike. A picture
 * is told at its own dialog's PNG or SVG instead. `made` runs before the
 * toast. Whether it was made.
 */
export async function runBoardExport({
  format,
  make,
  boardId,
  toast,
  made,
}: {
  format: BoardExportFormat
  make: () => Promise<string | null>
  boardId: string
  toast: ReturnType<typeof useToast>["toast"]
  made?: () => void
}): Promise<boolean> {
  try {
    const said = await make()
    if (format !== "picture") recordBoardExport(boardId, format)
    made?.()
    if (said) toast({ title: said })
    return true
  } catch {
    toast({ variant: "destructive", ...EXPORT_FAILED })
    return false
  }
}
