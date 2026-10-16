"use client"

import * as React from "react"
import { ArrowUpDown, ImageIcon, Loader2, Trash2, Upload } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "@/hooks/use-toast"
import { useClientConfig } from "@/hooks/useClientConfig"
import { useUploadFile } from "@/hooks/useUploadFile"
import { exceedsUploadLimit, uploadLimitMessage } from "@/lib/utils/uploadLimit"
import { cn } from "@/lib/utils/helpers/cn"
import { docCoverOf } from "@/lib/docLook"
import { setDocLook } from "@/services/docChromeService"
import { apiErrorMessage } from "@/lib/utils/apiError"
import "./chrome/band.css"
import "./chrome/cover.css"

/** The gallery, as people name the covers. Each is a token gradient (chrome/cover.css). */
export const GALLERY: { name: string; label: string }[] = [
  { name: "sky", label: "Sky" },
  { name: "lake", label: "Lake" },
  { name: "moss", label: "Moss" },
  { name: "sun", label: "Sunrise" },
  { name: "berry", label: "Berry" },
  { name: "dusk", label: "Dusk" },
  { name: "dawn", label: "Dawn" },
  { name: "tide", label: "Tide" },
  { name: "paper", label: "Paper" },
  { name: "ink", label: "Ink" },
]

/** Picks a cover: the gallery, or an image uploaded to the doc. */
export function CoverPicker({ docId, current, onDone }: { docId: string; current?: string; onDone: () => void }) {
  const config = useClientConfig()
  const upload = useUploadFile()
  const [busy, setBusy] = React.useState(false)
  const file = React.useRef<HTMLInputElement>(null)
  const pick = async (cover: string) => {
    try {
      await setDocLook({ doc_uuid: docId, cover, cover_offset: 50 })
      onDone()
    } catch (e) {
      toast({ title: "The cover didn't change", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }
  const uploadOne = async (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: "A cover is an image", description: "Choose a PNG, JPG, GIF or WebP file.", variant: "destructive" })
      return
    }
    if (exceedsUploadLimit(f.size, config.upload_limit_bytes)) {
      toast({ title: "Image too large", description: uploadLimitMessage(f.size, config.upload_limit_mb, f.name), variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      const res = await upload.uploadImageToDoc(f, docId)
      if (!res?.object_uuid) throw new Error("no file")
      await pick(`${docId}/${res.object_uuid}`)
    } catch (e) {
      toast({ title: "The image didn't upload", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex w-[320px] max-w-full flex-col gap-3" data-doc-cover-picker="">
      <div className="grid grid-cols-5 gap-2" role="listbox" aria-label="Gallery">
        {GALLERY.map((g) => (
          <button
            key={g.name}
            type="button"
            role="option"
            aria-selected={current === `gallery:${g.name}`}
            aria-label={g.label}
            title={g.label}
            onClick={() => void pick(`gallery:${g.name}`)}
            className={cn(
              "h-10 overflow-hidden rounded-lg outline-none ring-1 ring-inset ring-line transition-transform duration-[140ms] hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-brand motion-reduce:hover:scale-100",
              current === `gallery:${g.name}` && "ring-2 ring-brand",
            )}
          >
            <span aria-hidden="true" className={`doc-cover-art doc-cover-${g.name} block h-full w-full`} />
          </button>
        ))}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void uploadOne(f)
        }}
      />
      <Button variant="secondary" size="sm" className="gap-1.5" disabled={busy} onClick={() => file.current?.click()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
        {busy ? "Uploading…" : "Upload an image"}
      </Button>
      <p className="text-meta text-ink-3">Wide images work best: 1500 px across or more.</p>
    </div>
  )
}

/**
 * The cover's controls (D-2), over its foot while the page is pointed at:
 * Change cover, Reposition (drag the image, or ↑ ↓, then Save) and Remove.
 * The cover itself is drawn with the doc (DocTitle).
 */
export function DocCover({ docId, cover, offset = 50, padded }: { docId: string; cover: string; offset?: number; padded: string }) {
  const of = docCoverOf(cover)
  const [picking, setPicking] = React.useState(false)
  const [moving, setMoving] = React.useState(false)
  const [at, setAt] = React.useState(offset)
  const root = React.useRef<HTMLDivElement>(null)
  const img = () => root.current?.closest("[data-doc-title-block]")?.querySelector<HTMLImageElement>("[data-doc-cover] img") ?? null

  React.useEffect(() => setAt(offset), [offset])
  // While moving, the image follows; Cancel puts it back.
  React.useEffect(() => {
    const el = img()
    if (el) el.style.objectPosition = `center ${moving ? at : offset}%`
  }, [moving, at, offset])

  const overflow = () => {
    const el = img()
    if (!el?.naturalWidth || !el.parentElement) return 0
    const box = el.parentElement.getBoundingClientRect()
    const scale = Math.max(box.width / el.naturalWidth, box.height / el.naturalHeight)
    return Math.max(0, el.naturalHeight * scale - box.height)
  }
  const save = async () => {
    setMoving(false)
    if (Math.round(at) === offset) return
    try {
      await setDocLook({ doc_uuid: docId, cover_offset: Math.round(at) })
    } catch (e) {
      setAt(offset)
      toast({ title: "The cover didn't move", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }
  const remove = async () => {
    try {
      await setDocLook({ doc_uuid: docId, cover: "" })
    } catch (e) {
      toast({ title: "The cover is still there", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const range = overflow()
    if (!range) return
    const start = e.clientY
    const from = at
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => setAt(Math.min(100, Math.max(0, from - ((ev.clientY - start) / range) * 100)))
    const up = () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
  }

  const chip = "doc-band-ctl h-7 gap-1.5 bg-[color-mix(in_oklab,var(--pop)_88%,transparent)] px-2.5 text-ui-sm text-ink shadow-e1 backdrop-blur hover:bg-pop [&_svg]:size-3.5"
  return (
    <div ref={root} className={cn("pointer-events-none absolute inset-x-0 bottom-full", padded)} data-doc-cover-controls="">
      {moving ? (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Cover position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(at)}
          aria-valuetext={`${Math.round(at)}% down`}
          autoFocus
          onPointerDown={drag}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault()
              setAt((v) => Math.min(100, Math.max(0, v + (e.key === "ArrowUp" ? -5 : 5))))
            } else if (e.key === "Enter") {
              e.preventDefault()
              void save()
            } else if (e.key === "Escape") {
              e.preventDefault()
              e.stopPropagation()
              setMoving(false)
            }
          }}
          className="pointer-events-auto absolute bottom-0 left-1/2 h-[var(--doc-cover-h)] w-[100cqi] -translate-x-1/2 cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand active:cursor-grabbing"
          data-doc-cover-drag=""
        >
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[color-mix(in_oklab,var(--pop)_88%,transparent)] px-3 py-1.5 text-ui-sm text-ink shadow-e2 backdrop-blur">
            Drag the image to place it
          </span>
          <span className="absolute bottom-3 right-5 flex gap-2 md:right-8">
            <Button size="sm" variant="secondary" onClick={() => setMoving(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()}>
              Save position
            </Button>
          </span>
        </div>
      ) : (
        <div className="pointer-events-auto mb-3 flex justify-end gap-1.5">
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={chip} data-open={picking ? "" : undefined}>
                <ImageIcon aria-hidden="true" />
                Change cover
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto rounded-xl p-3">
              <CoverPicker docId={docId} current={cover} onDone={() => setPicking(false)} />
            </PopoverContent>
          </Popover>
          {of && "file" in of ? (
            <Button variant="ghost" size="sm" className={chip} onClick={() => (overflow() ? setMoving(true) : toast({ title: "This image already fits", description: "There's nothing above or below to show." }))}>
              <ArrowUpDown aria-hidden="true" />
              Reposition
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className={chip} onClick={() => void remove()} aria-label="Remove the cover">
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
