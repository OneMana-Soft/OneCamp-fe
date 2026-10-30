"use client"

// A file of Docs & Files, opened (docs F1b): its preview on the lightbox's
// own stage and viewers (components/attachments/mediaStage), near-black in
// both themes as every media viewer draws it. A PDF, a Word or an Excel file
// reads in the in-app viewer; an image zooms; video and audio play; what the
// stage can't draw (a pptx, a legacy .doc, a PDF in a browser with no PDF
// viewer, a file that didn't load) is the file's card with Download. Its versions,
// newest first, are a rail beside it (a phone's sheet swaps to them): each
// version's name, size, what changed, who and when, with View and Download.
// Replace with a new version is for whoever may edit. On a phone it is the
// shared sheet, its actions pinned in the footer; there the card's Download
// is the footer's own, which turns primary while the card shows (one
// Download on screen, design review 22 Oct).

import * as React from "react"

import { renderAsPerAttachmentType } from "@/components/attachments/mediaStage"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { useSheetMode } from "@/components/ui/overlayMode"
import { downloadVersion } from "@/components/docFiles/fileActions"
import { useFetch, useMediaFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ArrowLeft, Download, History, Replace, X } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { cn } from "@/lib/utils/helpers/cn"
import { versionFileKey, versionsKey, versionsOf } from "@/services/docFilesService"
import type { Envelope } from "@/services/docGraphService"
import type { AttachmentType } from "@/types/attachment"
import type { DocFileFacts, DocFileVersion, DocFileVersions } from "@/types/docGraph"
import type { GetMediaURLRes } from "@/types/file"

export interface PreviewFile {
  id: string
  title: string
  /** The current version's facts, as the tree's row has them: the stage starts before the versions arrive. */
  facts?: DocFileFacts
  /** Whoever may edit it may replace it with a new version. */
  canEdit: boolean
}

/** What the stage draws a file as, from its name and then its media type. Pure. */
export function stageTypeOf(name: string, mime?: string): AttachmentType {
  const byName = getAttachmentType(name)
  if (byName !== "other") return byName
  const m = (mime ?? "").toLowerCase()
  if (m.startsWith("image/")) return "image"
  if (m.startsWith("video/")) return "video"
  if (m.startsWith("audio/")) return "audio"
  return m ? "document" : "other"
}

/** "3.0 MB · Sam Rivera · 2h ago". */
function versionLine(v: Pick<DocFileVersion, "size_bytes" | "created_by" | "created_at">): string {
  const when = v.created_at ? new Date(v.created_at) : null
  return [formatFileSizeForAttachment(v.size_bytes), v.created_by ? displayNameOf(v.created_by) : "", when && !isNaN(when.getTime()) ? agoOrDate(when) : ""].filter(Boolean).join(" · ")
}

/** The version on the stage, as the versions or the row say it. */
type Showing = Pick<DocFileVersion, "n" | "attachment_id" | "name" | "size_bytes" | "mime"> & Partial<Pick<DocFileVersion, "created_by" | "created_at" | "note">>

/**
 * A read that failed, where its answer would be, with Try again (the shared
 * ErrorState), in the stage's dark on a computer.
 */
function Failed({ subject, onRetry, tone }: { subject: string; onRetry: () => void; tone: "dark" | "light" }) {
  const state = <ErrorState compact subject={subject} onRetry={onRetry} />
  return tone === "dark" ? <div className="dark">{state}</div> : state
}

/** Every version, newest first; a failed read says so, with Try again. */
function VersionsList({
  versions,
  failed,
  onRetry,
  current,
  showing,
  onView,
  onDownload,
  tone,
}: {
  versions: DocFileVersion[]
  failed: boolean
  onRetry: () => void
  current: number
  showing: number
  onView: (v: DocFileVersion) => void
  onDownload: (v: DocFileVersion) => void
  tone: "dark" | "light"
}) {
  const dark = tone === "dark"
  if (versions.length === 0 && failed) return <Failed subject="its versions" onRetry={onRetry} tone={tone} />
  if (versions.length === 0) return <p className={cn("px-2 py-6 text-center text-ui-sm", dark ? "text-white/50" : "text-ink-3")}>Loading its versions…</p>
  return (
    <ol aria-label="Versions" className="flex flex-col gap-1">
      {versions.map((v) => {
        const when = v.created_at ? new Date(v.created_at) : null
        const on = v.n === showing
        return (
          <li
            key={v.n}
            data-version={v.n}
            aria-current={on ? "true" : undefined}
            className={cn(
              "group relative flex flex-col gap-1 rounded-xl p-3",
              dark ? (on ? "bg-white/10" : "hover:bg-white/[0.06]") : on ? "bg-press" : "hover:bg-hover",
            )}
          >
            {/* The version on the stage: a bar on its leading edge, not colour
                alone, and neutral, as every chosen thing is (design review). */}
            {on ? <span aria-hidden="true" className={cn("absolute inset-y-3 left-0 w-[3px] rounded-sm", dark ? "bg-white" : "bg-ink")} /> : null}
            <div className="flex items-center gap-2">
              <span className={cn("text-meta font-semibold tabular-nums", dark ? "text-white" : "text-ink")}>Version {v.n}</span>
              {v.n === current ? (
                <span className={cn("rounded-sm px-1.5 py-px text-3xs font-medium", dark ? "bg-white/15 text-white" : "bg-sunken text-ink-2")}>Current</span>
              ) : null}
              <time className={cn("ml-auto text-meta tabular-nums", dark ? "text-white/50" : "text-ink-3")} title={when && !isNaN(when.getTime()) ? fullDateTime(when) : undefined}>
                {when && !isNaN(when.getTime()) ? agoOrDate(when) : ""}
              </time>
            </div>
            <p className={cn("truncate text-ui-sm", dark ? "text-white/85" : "text-ink")}>{v.name}</p>
            {v.note ? <p className={cn("text-ui-sm", dark ? "text-white/70" : "text-ink-2")}>“{v.note}”</p> : null}
            <div className={cn("flex items-center gap-1.5 text-meta tabular-nums", dark ? "text-white/50" : "text-ink-3")}>
              {v.created_by?.user_uuid ? <IdentityMark id={avatarSeed(v.created_by)} variant="avatar" size={16} label={displayNameOf(v.created_by)} /> : null}
              <span className="min-w-0 truncate">{[v.created_by ? displayNameOf(v.created_by) : "", formatFileSizeForAttachment(v.size_bytes)].filter(Boolean).join(" · ")}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {!on ? (
                  <button
                    type="button"
                    aria-label={`View version ${v.n}`}
                    onClick={() => onView(v)}
                    className={cn("rounded-md px-2 py-1 font-medium outline-none focus-visible:ring-2", dark ? "text-white/80 hover:bg-white/10 hover:text-white focus-visible:ring-white/60" : "text-ink-2 hover:bg-hover hover:text-ink focus-visible:ring-brand")}
                  >
                    View
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={`Download version ${v.n}`}
                  onClick={() => onDownload(v)}
                  className={cn("inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-2", dark ? "text-white/80 hover:bg-white/10 hover:text-white focus-visible:ring-white/60" : "text-ink-2 hover:bg-hover hover:text-ink focus-visible:ring-brand")}
                >
                  <Download className="size-4" aria-hidden="true" />
                </button>
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function FilePreview({ file, versions: startOnVersions = false, onClose, onReplace }: { file: PreviewFile; versions?: boolean; onClose: () => void; onReplace?: () => void }) {
  const phone = useSheetMode()
  const answer = useFetch<Envelope<DocFileVersions>>(versionsKey(file.id), undefined, undefined, OWN_ERRORS)
  const versions = versionsOf(answer.data)
  const newest = versions[0]
  const current: Showing | undefined = newest ?? (file.facts ? { n: file.facts.versions, attachment_id: file.facts.attachment_id, name: file.facts.name, size_bytes: file.facts.size_bytes, mime: file.facts.mime } : undefined)
  const [viewing, setViewing] = React.useState<Showing | null>(null)
  const showing = viewing ?? current
  const [rail, setRail] = React.useState(startOnVersions)
  const media = useMediaFetch<GetMediaURLRes>(showing ? versionFileKey(file.id, showing.attachment_id) : "")
  // Named as the file is: a new version keeps its name (the version's own
  // file name is in its row of the versions).
  const name = file.title || showing?.name || "File"
  const download = (v: Pick<DocFileVersion, "attachment_id" | "name"> | undefined) => {
    if (v) void downloadVersion(file.id, v)
  }
  const tone = phone ? "light" : "dark"
  // On a phone the sheet's footer holds Download: while the stage can't draw
  // the file, its card shows none and the footer's is the sheet's action.
  const [cant, setCant] = React.useState(false)
  const older = !!viewing && !!newest && viewing.n !== newest.n
  // "Version 3 · 1.2 MB · Sam Rivera · 2h ago"; an earlier one says which of how many.
  const label = showing ? (older ? `Version ${showing.n} of ${newest!.n}` : `Version ${showing.n}`) : ""
  const line = showing ? versionLine({ size_bytes: showing.size_bytes, created_by: showing.created_by, created_at: showing.created_at ?? "" }) : ""
  const meta = showing ? `${label} · ${line}` : ""
  const metaLine = showing ? (
    <>
      <span data-version-label="">{label}</span>
      {line ? ` · ${line}` : null}
    </>
  ) : null

  // A read that failed says so on the stage: the file's address (its signed
  // URL), or, before any version is known, its versions.
  const stage = showing && media.isError && !media.data ? (
    <Failed subject="this file" onRetry={() => void media.mutate()} tone={tone} />
  ) : !showing && answer.isError ? (
    <Failed subject="this file" onRetry={() => void answer.mutate()} tone={tone} />
  ) : showing ? (
    renderAsPerAttachmentType(stageTypeOf(showing.name, showing.mime), showing.name, {
      key: showing.attachment_id,
      url: media.data?.url ?? "",
      loading: !media.data?.url,
      onDownload: () => download(showing),
      // A file it can't draw is its card (CantPreview), in the sheet's tone on a phone.
      mime: showing.mime,
      tone,
      onCantPreview: phone ? setCant : undefined,
    })
  ) : (
    <div aria-busy="true" className="size-10 animate-pulse rounded-xl bg-white/10" />
  )

  const list = (
    <VersionsList
      versions={versions}
      failed={!!answer.isError}
      onRetry={() => void answer.mutate()}
      current={newest?.n ?? 0}
      showing={showing?.n ?? 0}
      onView={(v) => {
        setViewing(v.n === newest?.n ? null : v)
        if (phone) setRail(false)
      }}
      onDownload={download}
      tone={tone}
    />
  )

  if (phone) {
    return (
      <Drawer open detent="large" onOpenChange={(o) => !o && onClose()}>
        <DrawerContent
          data-file-preview=""
          header={
            <>
              <DrawerTitle className="max-w-full truncate text-title-3 text-ink">{name}</DrawerTitle>
              <DrawerDescription data-preview-meta="" className="text-meta tabular-nums text-ink-3">
                {metaLine}
              </DrawerDescription>
            </>
          }
          footer={
            <div className="grid grid-cols-3 gap-2 [&>*]:h-11">
              <Button variant={cant ? "default" : "secondary"} onClick={() => download(showing)} disabled={!showing}>
                Download
              </Button>
              {file.canEdit && onReplace ? (
                <Button variant="secondary" onClick={onReplace}>
                  New version
                </Button>
              ) : (
                <span />
              )}
              {/* A toggle, not an action: pressed, it takes the neutral press
                  (an ink tint and ring), never the orange of an action. */}
              <Button variant="secondary" data-tone="neutral" aria-pressed={rail} onClick={() => setRail((r) => !r)}>
                Versions
              </Button>
            </div>
          }
        >
          <div className="px-4 pb-2">
            {rail ? (
              list
            ) : (
              <div key={showing?.attachment_id} className="content-view-in relative flex h-[56dvh] items-center justify-center overflow-hidden rounded-2xl bg-[rgb(8_9_10)] p-3">
                {stage}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  // The stage is near-black in both themes, so its controls take the layer's
  // white tone (data-tone="light"), as the stage's own zoom controls do: their
  // hover, their press and a pressed toggle are white, never the accent.
  // A ghost button's icon takes the theme's ink, near-black in light under
  // the pointer: here it follows the button's white.
  const bar = "size-8 rounded-[16px] text-white/70 hover:text-white [&_svg]:text-current hover:[&_svg]:text-current focus-visible:ring-2 focus-visible:ring-white/50"
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="!fixed !inset-0 !left-0 !top-0 !h-dvh !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden !rounded-none border-0 bg-[rgb(8_9_10/.92)] p-0 !shadow-none [&>button]:hidden"
        data-file-preview=""
        data-lightbox=""
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{meta}</DialogDescription>
        </DialogHeader>
        <div className="flex h-dvh w-full">
          <div className="relative flex h-full min-w-0 flex-1 flex-col">
            <div className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-3 bg-gradient-to-b from-black/40 to-transparent px-4">
              <FileGlyph name={name} fileType={showing?.mime} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-medium text-white">{name}</p>
                <p data-preview-meta="" className="truncate text-meta tabular-nums text-white/60">
                  {metaLine}
                </p>
              </div>
              <div data-preview-bar="" className="flex shrink-0 items-center gap-0.5">
                {older ? (
                  <Button data-tone="light" variant="ghost" size="sm" onClick={() => setViewing(null)} className="mr-1 gap-1.5 text-white/80 hover:text-white [&_svg]:text-current hover:[&_svg]:text-current">
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                    Current version
                  </Button>
                ) : null}
                {file.canEdit && onReplace ? (
                  <Button data-tone="light" variant="ghost" size="icon" onClick={onReplace} className={bar} aria-label="Replace with a new version" title="Replace with a new version">
                    <Replace className="size-4" />
                  </Button>
                ) : null}
                <Button data-tone="light" variant="ghost" size="icon" onClick={() => download(showing)} className={bar} aria-label="Download" title="Download" disabled={!showing}>
                  <Download className="size-4" />
                </Button>
                <Button
                  data-tone="light"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRail((r) => !r)}
                  className={cn(bar, rail && "text-white")}
                  aria-label="See all versions"
                  title="See all versions"
                  aria-pressed={rail}
                >
                  <History className="size-4" />
                </Button>
                <Button data-tone="light" variant="ghost" size="icon" onClick={onClose} className={bar} aria-label="Close">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4 pt-14">
              <div key={showing?.attachment_id} className="content-view-in flex size-full items-center justify-center">
                {stage}
              </div>
            </div>
          </div>
          {rail ? (
            <aside className="content-view-in flex w-80 shrink-0 flex-col bg-[#16171A] pt-14 text-white" data-versions-rail="">
              <h3 className="px-4 pb-2 text-meta font-medium text-white/60">
                {versions.length ? `${versions.length} ${versions.length === 1 ? "version" : "versions"}` : "Versions"}
              </h3>
              <div className="flex-1 overflow-y-auto px-2 pb-3">{list}</div>
            </aside>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
