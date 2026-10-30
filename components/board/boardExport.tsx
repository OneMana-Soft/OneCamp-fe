"use client"

// A board's exports and its file in (miro-36), loaded when More › Export… or
// More › Open a board file… is pressed:
// - a PDF, one page per frame in the Frames panel's order (the whole board on
//   one page when it has none), through the browser's print dialog, as a
//   doc's PDF is (lib/export/print), drawn by Excalidraw's own SVG export;
// - the notes as CSV for a spreadsheet (lib/board/exportBoard);
// - the board as an .excalidraw file, its pictures inside it, which opens
//   here or in Excalidraw;
// - a picture of it, through Excalidraw's own dialog;
// - an .excalidraw file laid on the board, as one undo step
//   (boardOps.addCopies); its pictures are kept as the board's own as a
//   pasted one is (the canvas uploads a picture new to the board).
// Nothing goes through a server but the pictures read back for the file.

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { addCopies, type SceneElement } from "@/components/board/boardOps"
import { facilitationOf, roundIn } from "@/components/board/facilitationDock"
import { closedVotes, noteRows, notesCsv, pdfFrames, type ExportElement } from "@/lib/board/exportBoard"
import { NOTE_AUTHORS } from "@/lib/board/authors"
import { frameOrderOf } from "@/lib/board/frames"
import { urlToDataURL } from "@/lib/utils/file/urlToDataURL"
import { downloadFile, exportFileName } from "@/lib/export/download"
import { printTitled } from "@/lib/export/print"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { FileSpreadsheet, FileText, ImageIcon, Layers } from "@/lib/icons"

type Format = "pdf" | "csv" | "file" | "picture"

/** The board's own order and votes, from its shared document. */
function shared(provider: HocuspocusProvider) {
  const doc = provider.document
  return {
    frameOrder: frameOrderOf(doc.getMap<unknown>("boardMeta")),
    voting: roundIn(facilitationOf(doc)),
    votes: Array.from(doc.getMap<unknown>("votes").entries()) as [string, unknown][],
    authors: doc.getMap<unknown>(NOTE_AUTHORS),
  }
}

/**
 * Prints each page's SVG, one page each, then takes them away again once the
 * dialog closes. A browser that never says so (printTitled) keeps them, out of
 * sight, until the next export takes them away.
 */
function printPages(svgs: SVGSVGElement[], title: string) {
  for (const left of document.querySelectorAll("[data-board-print], style[data-board-print-style]")) left.remove()
  const host = document.createElement("div")
  host.setAttribute("data-board-print", "")
  for (const svg of svgs) {
    const page = document.createElement("section")
    svg.removeAttribute("width")
    svg.removeAttribute("height")
    page.appendChild(svg)
    host.appendChild(page)
  }
  const style = document.createElement("style")
  style.setAttribute("data-board-print-style", "")
  style.textContent = `@media screen{[data-board-print]{display:none}}@media print{@page{margin:12mm}body>*:not([data-board-print]){display:none!important}[data-board-print] section{display:flex;align-items:center;justify-content:center;height:calc(100vh - 1px);break-after:page}[data-board-print] section:last-child{break-after:auto}[data-board-print] svg{max-width:100%;max-height:100%}}`
  document.head.appendChild(style)
  document.body.appendChild(host)
  printTitled(title, () => {
    host.remove()
    style.remove()
  })
}

export async function exportBoard(
  format: Format,
  api: ExcalidrawImperativeAPI,
  provider: HocuspocusProvider,
  title: string,
): Promise<string | null> {
  const elements = api.getSceneElements() as unknown as ExportElement[]
  const name = exportFileName(title || "Board")
  const { frameOrder, voting, votes, authors } = shared(provider)
  if (format === "picture") {
    api.updateScene({ appState: { openDialog: { name: "imageExport" } } as never })
    return null
  }
  if (format === "csv") {
    const live = new Set(elements.map((e) => e.id))
    const counts = closedVotes(voting, votes, live)
    const rows = noteRows(elements, frameOrder, counts, window.location.origin, authors)
    downloadFile(`${name}.csv`, notesCsv(rows, counts !== null), "text/csv;charset=utf-8")
    return `${rows.length} ${rows.length === 1 ? "note" : "notes"} saved as ${name}.csv`
  }
  const excalidraw = await import("@excalidraw/excalidraw")
  if (format === "file") {
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
  // A PDF: each frame a page, in the Frames panel's order.
  const frames = pdfFrames(elements, frameOrder)
  const appState = { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: "#ffffff" }
  const svgs: SVGSVGElement[] = []
  for (const frame of frames.length ? frames : [null]) {
    svgs.push(
      await excalidraw.exportToSvg({
        elements: api.getSceneElements(),
        appState: appState as never,
        files: api.getFiles(),
        exportPadding: frame ? 0 : 24,
        ...(frame ? { exportingFrame: frame as never } : {}),
      }),
    )
  }
  printPages(svgs, title || "Board")
  return null
}

/** Lays an .excalidraw file's drawing on the board, where the person is looking, as one undo step. */
export async function openBoardFile(api: ExcalidrawImperativeAPI, file: File): Promise<number> {
  const { loadFromBlob } = await import("@excalidraw/excalidraw")
  const scene = await loadFromBlob(file, null, null)
  const elements = scene.elements.filter((e) => !e.isDeleted) as unknown as SceneElement[]
  const files = Object.values(scene.files ?? {})
  if (files.length > 0) api.addFiles(files)
  return addCopies(api, elements, `file-${Date.now().toString(36)}`, { animate: !prefersReducedMotion() }).length
}

const OPTIONS: { id: Format; label: string; says: (frames: number, notes: number) => string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    id: "pdf",
    label: "PDF",
    says: (frames) => (frames === 0 ? "The whole board on one page." : `Each frame on a page, in the Frames panel's order (${frames} ${frames === 1 ? "page" : "pages"}).`),
    icon: FileText,
  },
  { id: "csv", label: "Notes as CSV", says: (_, notes) => (notes === 0 ? "No notes on this board yet." : `Words, who wrote them, colours, tags, frames, tasks and closed votes of ${notes} ${notes === 1 ? "note" : "notes"}, for a spreadsheet.`), icon: FileSpreadsheet },
  { id: "file", label: "Board file (.excalidraw)", says: () => "Everything on the board with its pictures, to open here or in Excalidraw.", icon: Layers },
  { id: "picture", label: "Picture", says: () => "PNG or SVG of the board, or of what is selected.", icon: ImageIcon },
]

export default function BoardExport({
  api,
  provider,
  title,
  onClose,
}: {
  api: ExcalidrawImperativeAPI
  provider: HocuspocusProvider
  title: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const [format, setFormat] = React.useState<Format>("pdf")
  const [busy, setBusy] = React.useState(false)
  const counts = React.useMemo(() => {
    const els = api.getSceneElements() as unknown as ExportElement[]
    return { frames: pdfFrames(els, shared(provider).frameOrder).length, notes: noteRows(els, null, null).length }
  }, [api, provider])

  const run = async () => {
    setBusy(true)
    try {
      const said = await exportBoard(format, api, provider, title)
      onClose()
      if (said) toast({ title: said })
    } catch {
      toast({ variant: "destructive", title: "The board couldn't be exported", description: "Try again. A large board's pictures can take a moment to read." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      title="Export this board"
      description="A copy to keep or share. It is made here, in this browser."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={format === "csv" && counts.notes === 0} busy={busy} className="gap-1.5" data-board-export-run="">
            Export
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Format" className="grid gap-2" data-board-export="">
        {OPTIONS.map((o) => {
          const on = format === o.id
          const Icon = o.icon
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFormat(o.id)}
              className={cn(
                "flex min-h-11 items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-brand/40 bg-brand-muted ring-1 ring-inset ring-brand/30" : "border-line hover:bg-hover",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-brand-text" : "text-ink-3")} />
              <span className="grid gap-0.5">
                <span className="text-ui-sm font-medium text-ink">{o.label}</span>
                <span className="text-meta text-ink-3">{o.says(counts.frames, counts.notes)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </ResponsiveDialog>
  )
}
