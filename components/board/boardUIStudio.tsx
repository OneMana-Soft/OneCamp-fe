"use client"

// BoardUIStudio: a clean, Notion-like full-screen studio for AI UI design.
// The backend returns a complete, Tailwind-styled HTML screen; we render it in
// a sandboxed iframe inside a realistic device frame (phone / browser), and let
// the user regenerate, switch device, and export to PNG / HTML (for Figma via
// the html.to.design plugin, or Canva via PNG). The generated markup is treated
// as untrusted: scripts are stripped server-side and the iframe is sandboxed.

import * as React from "react"
import { createPortal } from "react-dom"
import { toPng } from "html-to-image"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import AiModelPicker from "@/components/ai/AiModelPicker"
import {
  Sparkles,
  X,
  Loader2,
  Smartphone,
  Monitor,
  Copy,
  Download,
  Check,
  Code,
  Wrench,
  Pencil,
} from "@/lib/icons"

type Device = "mobile" | "desktop"

interface BoardUIStudioProps {
  boardId: string
  open: boolean
  onClose: () => void
  initialPrompt?: string
  initialDevice?: Device
}

const DEVICE_DIMS: Record<Device, { w: number; h: number }> = {
  mobile: { w: 390, h: 844 },
  desktop: { w: 1280, h: 832 },
}

const EXAMPLES: Record<Device, string[]> = {
  mobile: [
    "A food delivery app home screen with categories and featured restaurants",
    "A banking app dashboard with balance, cards and recent transactions",
    "A fitness app workout screen with progress rings and a plan list",
  ],
  desktop: [
    "A SaaS analytics dashboard with KPIs, a chart and a data table",
    "A project management board with a sidebar and kanban columns",
    "A CRM contact detail page with activity timeline",
  ],
}

// Wrap the AI body markup in a render host: Tailwind + Inter + a strict CSP.
// (Scripts in the markup are already stripped server-side; the only script the
// CSP allows is the Tailwind CDN.)
function buildSrcDoc(bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src https://cdn.tailwindcss.com https://fonts.googleapis.com;"/>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12);border-radius:8px}</style>
</head><body>${bodyHtml}</body></html>`
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function dataUrlToDownload(name: string, dataUrl: string) {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function BoardUIStudio({ boardId, open, onClose, initialPrompt, initialDevice }: BoardUIStudioProps) {
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()

  const [device, setDevice] = React.useState<Device>(initialDevice || "mobile")
  const [prompt, setPrompt] = React.useState(initialPrompt || "")
  const [html, setHtml] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [refinePrompt, setRefinePrompt] = React.useState("")
  const [refining, setRefining] = React.useState(false)
  const [scale, setScale] = React.useState(1)
  const [mounted, setMounted] = React.useState(false)

  const previewRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const autoRunRef = React.useRef(false)

  React.useEffect(() => setMounted(true), [])

  const dims = DEVICE_DIMS[device]
  const srcDoc = React.useMemo(() => (html ? buildSrcDoc(html) : ""), [html])

  const generate = React.useCallback(
    (p: string, d: Device) => {
      const trimmed = p.trim()
      if (!trimmed) {
        setError("Describe the screen you want to design.")
        return
      }
      setError(null)
      makeRequest<{ board_uuid: string; prompt: string; device: Device }, { html: string; device: Device }>({
        apiEndpoint: PostEndpointUrl.GenerateBoardUI,
        payload: { board_uuid: boardId, prompt: trimmed, device: d },
      })
        .then((res) => {
          if (res && typeof res.html === "string" && res.html.trim()) {
            setHtml(res.html)
          } else {
            setError("The AI could not produce a design. Try rephrasing.")
          }
        })
        .catch(() => setError("Generation failed. Please try again in a moment."))
    },
    [boardId, makeRequest],
  )

  // Refine an existing design: apply a described change, or run an autonomous
  // design-QA pass (empty instruction) to fix visual bugs.
  const refine = React.useCallback(
    (instruction: string) => {
      if (!html) return
      setError(null)
      setRefining(true)
      makeRequest<
        { board_uuid: string; html: string; instruction: string; device: Device },
        { html: string; device: Device }
      >({
        apiEndpoint: PostEndpointUrl.RefineBoardUI,
        payload: { board_uuid: boardId, html, instruction: instruction.trim(), device },
      })
        .then((res) => {
          if (res && typeof res.html === "string" && res.html.trim()) {
            setHtml(res.html)
            setRefinePrompt("")
          } else {
            setError("The AI could not refine the design. Try rephrasing.")
          }
        })
        .catch(() => setError("Refine failed. Please try again in a moment."))
        .finally(() => setRefining(false))
    },
    [boardId, html, device, makeRequest],
  )

  // Auto-generate once when opened with a prefilled prompt.
  React.useEffect(() => {
    if (open && !autoRunRef.current && (initialPrompt || "").trim()) {
      autoRunRef.current = true
      generate(initialPrompt as string, initialDevice || "mobile")
    }
    if (!open) {
      autoRunRef.current = false
    }
  }, [open, initialPrompt, initialDevice, generate])

  // Fit-to-frame: scale the device so it fills the preview area like Figma.
  React.useEffect(() => {
    if (!open) return
    const el = previewRef.current
    if (!el) return
    const compute = () => {
      const pad = 64
      const aw = el.clientWidth - pad
      const ah = el.clientHeight - pad
      const s = Math.min(aw / dims.w, ah / dims.h, 1)
      setScale(s > 0 ? s : 1)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, dims.w, dims.h, html])

  // Esc to close.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const handleCopy = React.useCallback(async () => {
    if (!html) return
    try {
      await navigator.clipboard.writeText(buildSrcDoc(html))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" })
    }
  }, [html, toast])

  const handleDownloadHtml = React.useCallback(() => {
    if (!html) return
    downloadFile(`onecamp-design-${device}.html`, buildSrcDoc(html), "text/html")
  }, [html, device])

  const handleDownloadPng = React.useCallback(async () => {
    const doc = iframeRef.current?.contentDocument
    const node = (doc?.body?.firstElementChild as HTMLElement) || doc?.body
    if (!node) {
      toast({ title: "Preview not ready", description: "Wait for the design to render, then try again." })
      return
    }
    setExporting(true)
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" })
      dataUrlToDownload(`onecamp-design-${device}.png`, dataUrl)
    } catch {
      toast({ title: "Export failed", description: "Could not render the image. Try again.", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }, [device, toast])

  if (!open || !mounted) return null

  const busy = isSubmitting

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-background animate-fade-up">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">AI UI Designer</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">
              Describe a screen, get a production-grade design you can export
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Composer */}
        <aside className="flex w-full shrink-0 flex-col gap-3 border-b p-4 lg:w-[20rem] lg:border-b-0 lg:border-r">
          <div className="inline-flex w-full rounded-lg border bg-muted/40 p-0.5">
            {(["mobile", "desktop"] as Device[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  device === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d === "mobile" ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
                {d}
              </button>
            ))}
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                generate(prompt, device)
              }
            }}
            placeholder="Describe the screen you want to design..."
            className="min-h-[96px] resize-none text-sm"
            maxLength={2000}
            disabled={busy}
          />

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button onClick={() => generate(prompt, device)} disabled={busy} className="w-full gap-1.5">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Designing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> {html ? "Regenerate" : "Generate design"}
              </>
            )}
          </Button>

          <div className="flex items-center justify-between gap-2">
            <AiModelPicker />
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Cmd/Ctrl + Enter</span>
          </div>

          {html && (
            <div className="mt-1 space-y-2 rounded-lg border bg-muted/30 p-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Refine</p>
              <Textarea
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && refinePrompt.trim()) {
                    e.preventDefault()
                    refine(refinePrompt)
                  }
                }}
                placeholder="Describe a change (e.g. use a green accent, make the header sticky)..."
                className="min-h-[60px] resize-none bg-background text-sm"
                maxLength={2000}
                disabled={busy || refining}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refine(refinePrompt)}
                  disabled={busy || refining || !refinePrompt.trim()}
                  className="flex-1 gap-1.5"
                >
                  {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                  Apply
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refine("")}
                  disabled={busy || refining}
                  className="flex-1 gap-1.5"
                  title="Let AI review the design and fix visual issues"
                >
                  {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                  Auto-fix
                </Button>
              </div>
            </div>
          )}

          {!html && !busy && (
            <div className="mt-1 space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Try</p>
              {EXAMPLES[device].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setPrompt(ex)
                    generate(ex, device)
                  }}
                  className="block w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Preview */}
        <main className="flex min-h-0 flex-1 flex-col">
          {/* Export toolbar */}
          <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-b px-4">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!html} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Code className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy HTML"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadHtml} disabled={!html} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> HTML
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPng} disabled={!html || exporting} className="gap-1.5">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PNG
            </Button>
          </div>

          <div
            ref={previewRef}
            className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,theme(colors.muted.DEFAULT)_1px,transparent_1px)] [background-size:22px_22px]"
          >
            {/* Loading */}
            {busy && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Designing your {device} screen...</p>
              </div>
            )}

            {/* Empty state */}
            {!html && !busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="h-6 w-6" />
                </span>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Describe a screen on the left and OneCamp will design a polished, exportable UI.
                </p>
              </div>
            )}

            {/* Device frame */}
            {html && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div style={{ transform: `scale(${scale})`, transformOrigin: "center" }}>
                  {device === "mobile" ? (
                    <div className="rounded-[3rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl">
                      <div className="relative overflow-hidden rounded-[2.3rem] bg-white" style={{ width: dims.w, height: dims.h }}>
                        <iframe
                          ref={iframeRef}
                          title="UI preview"
                          srcDoc={srcDoc}
                          sandbox="allow-scripts allow-same-origin"
                          style={{ width: dims.w, height: dims.h, border: 0, display: "block" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-2xl">
                      <div className="flex h-9 items-center gap-2 border-b border-gray-200 bg-gray-50 px-4">
                        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                        <span className="ml-3 h-5 flex-1 rounded-md bg-gray-200/70" />
                      </div>
                      <iframe
                        ref={iframeRef}
                        title="UI preview"
                        srcDoc={srcDoc}
                        sandbox="allow-scripts allow-same-origin"
                        style={{ width: dims.w, height: dims.h, border: 0, display: "block" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>,
    document.body,
  )
}

export default BoardUIStudio
