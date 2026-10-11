import { File, FileArchive, FileAudio2, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "@/lib/icons"
import type { LucideIcon } from "lucide-react"

import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * What a file is, for its glyph (content.md F03). One kind per family, each
 * on a camp tint so the files tab, attachments, the lightbox and uploads all
 * read the same: PDF berry, documents sky, sheets moss, slides sun, images
 * and audio dusk, video lake; code, archives and the rest are neutral (ink on
 * sunken), because a hue there would name nothing.
 */
export type FileKind = "pdf" | "doc" | "sheet" | "slides" | "image" | "video" | "audio" | "code" | "archive" | "other"

export const FILE_KIND_HUE: Record<FileKind, CampHue | null> = {
  pdf: "berry",
  doc: "sky",
  sheet: "moss",
  slides: "sun",
  image: "dusk",
  video: "lake",
  audio: "dusk",
  code: null,
  archive: null,
  other: null,
}

const KIND_ICON: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio2,
  code: FileCode,
  archive: FileArchive,
  other: File,
}

const EXT_KIND: Record<string, FileKind> = {
  pdf: "pdf",
  doc: "doc", docx: "doc", txt: "doc", md: "doc", markdown: "doc", rtf: "doc", odt: "doc", pages: "doc",
  xls: "sheet", xlsx: "sheet", csv: "sheet", tsv: "sheet", ods: "sheet", numbers: "sheet",
  ppt: "slides", pptx: "slides", key: "slides", odp: "slides",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", heic: "image", avif: "image", bmp: "image", psd: "image", ai: "image", eps: "image", sketch: "image", fig: "image",
  mp4: "video", mov: "video", webm: "video", mkv: "video", avi: "video", m4v: "video",
  mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", aac: "audio",
  js: "code", ts: "code", tsx: "code", jsx: "code", json: "code", html: "code", css: "code", py: "code", go: "code", rs: "code", java: "code", rb: "code", php: "code", sh: "code", sql: "code", xml: "code", yml: "code", yaml: "code", swift: "code", c: "code", cpp: "code", h: "code", log: "code",
  zip: "archive", rar: "archive", tar: "archive", gz: "archive", tgz: "archive", "7z": "archive", dmg: "archive", apk: "archive", exe: "archive",
}

/** The extension, lower case, without the dot ("" when there is none). */
export function fileExt(name: string | null | undefined): string {
  const n = (name || "").trim()
  const dot = n.lastIndexOf(".")
  return dot > 0 && dot < n.length - 1 ? n.slice(dot + 1).toLowerCase() : ""
}

/** The kind from the MIME type, then the extension. Pure. */
export function fileKind(name: string | null | undefined, fileType?: string | null): FileKind {
  const t = (fileType || "").toLowerCase()
  if (t === "application/pdf") return "pdf"
  if (t.startsWith("image/")) return "image"
  if (t.startsWith("video/")) return "video"
  if (t.startsWith("audio/")) return "audio"
  if (/spreadsheet|excel|numbers|text\/csv/.test(t)) return "sheet"
  if (/presentation|powerpoint|keynote/.test(t)) return "slides"
  if (/wordprocessing|msword|ms-word|pages|text\/plain|text\/markdown|rtf/.test(t)) return "doc"
  if (/zip|rar|tar|diskimage|android\.package|msdownload|7z|gzip/.test(t)) return "archive"
  if (/javascript|typescript|json|xml|html|css|x-sh|shellscript|text\/x-|sql/.test(t)) return "code"
  return EXT_KIND[fileExt(name)] ?? "other"
}

/** The label under a 40 px glyph: "PDF", "CSV", at most four letters. */
export function fileLabel(name: string | null | undefined, kind: FileKind): string {
  const ext = fileExt(name)
  if (ext && ext.length <= 4) return ext.toUpperCase()
  return kind === "other" ? "" : kind.toUpperCase().slice(0, 4)
}

/**
 * The bare glyph of a file's kind, in its hue's strong cut (or ink). Kept for
 * the callers that drew an icon inline (attachments, the task form).
 */
export function FileTypeIcon({ name, fileType, size = 24, className }: { name: string | null; fileType?: string; size?: number; className?: string }) {
  const kind = fileKind(name, fileType)
  const hue = FILE_KIND_HUE[kind]
  const Icon = KIND_ICON[kind]
  return (
    <Icon
      aria-hidden="true"
      data-file-kind={kind}
      size={size}
      className={cn(hue ? cn(HUE_CLASS[hue], "text-hue") : kind === "other" ? "text-ink-3" : "text-ink-2", className)}
    />
  )
}

/**
 * The file's tile (F03): 32 px (r9) or 40 px (r10) on the kind's camp tint
 * with the strong-cut glyph; a 40 px tile adds the extension in the hue's ink
 * under the glyph, drawn as part of the graphic (an SVG label, like a mark,
 * not text to read: the file's name is beside it). Code, archives and the
 * rest sit on sunken in ink.
 */
export function FileGlyph({
  name,
  fileType,
  size = 40,
  className,
}: {
  name: string | null | undefined
  fileType?: string | null
  size?: 32 | 40
  className?: string
}) {
  const kind = fileKind(name, fileType)
  const hue = FILE_KIND_HUE[kind]
  const Icon = KIND_ICON[kind]
  const label = size === 40 ? fileLabel(name, kind) : ""
  return (
    <span
      aria-hidden="true"
      data-file-glyph={kind}
      className={cn(
        "inline-flex shrink-0 flex-col items-center justify-center gap-px",
        size === 40 ? "size-10 rounded-[10px]" : "size-8 rounded-[9px]",
        hue ? cn(HUE_CLASS[hue], "bg-hue-tint text-hue") : cn("bg-sunken ring-1 ring-inset ring-line", kind === "other" ? "text-ink-3" : "text-ink-2"),
        className,
      )}
    >
      <Icon className={label ? "size-4" : size === 40 ? "size-5" : "size-4"} />
      {label ? (
        <svg width="28" height="10" viewBox="0 0 28 10" className={hue ? "text-hue-ink" : "text-ink-2"}>
          <text x="14" y="8.5" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="590" fontFamily="inherit">
            {label}
          </text>
        </svg>
      ) : null}
    </span>
  )
}
