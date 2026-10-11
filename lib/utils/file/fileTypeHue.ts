import type { CampHue } from "@/lib/campHue"

/**
 * What kind of file a file is, for its card (design v3 chat, C24): every card
 * of one kind takes one hue, so a PDF reads as a PDF across the room.
 */
export type FileKind = "pdf" | "sheet" | "doc" | "slides" | "archive" | "code" | "other"

/** The kinds' hues; "other" has none and sits on the sunken ground. */
export const FILE_KIND_HUE: Record<Exclude<FileKind, "other">, CampHue> = {
    pdf: "berry",
    sheet: "moss",
    doc: "sky",
    slides: "sun",
    archive: "dusk",
    code: "lake",
}

const BY_EXTENSION: Record<string, FileKind> = {
    pdf: "pdf",
    xls: "sheet", xlsx: "sheet", csv: "sheet", tsv: "sheet", numbers: "sheet", ods: "sheet",
    doc: "doc", docx: "doc", txt: "doc", md: "doc", rtf: "doc", pages: "doc", odt: "doc",
    ppt: "slides", pptx: "slides", key: "slides", odp: "slides",
    zip: "archive", rar: "archive", tar: "archive", gz: "archive", tgz: "archive", "7z": "archive", bz2: "archive",
    json: "code", xml: "code", html: "code", css: "code", js: "code", ts: "code", tsx: "code", jsx: "code",
    go: "code", py: "code", rs: "code", java: "code", sh: "code", sql: "code", yaml: "code", yml: "code", toml: "code",
}

/** A file's kind, from its name's extension first and then its media type. Pure. */
export function fileKind(name?: string, mime?: string): FileKind {
    const ext = name?.includes(".") ? name.split(".").pop()!.toLowerCase() : ""
    if (ext && BY_EXTENSION[ext]) return BY_EXTENSION[ext]
    const m = (mime || "").toLowerCase()
    if (!m) return "other"
    if (m === "application/pdf") return "pdf"
    if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv" || m.includes("numbers")) return "sheet"
    if (m.includes("presentation") || m.includes("powerpoint") || m.includes("keynote")) return "slides"
    if (m.includes("wordprocessing") || m === "application/msword" || m.includes("pages") || m === "text/plain" || m === "text/markdown" || m === "application/rtf") return "doc"
    if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || m === "application/gzip") return "archive"
    if (m === "application/json" || m.includes("xml") || m === "text/html" || m === "text/css" || m.includes("javascript")) return "code"
    return "other"
}

/** The hue a file's card tile takes, or null for the neutral sunken tile. */
export function fileTypeHue(name?: string, mime?: string): CampHue | null {
    const kind = fileKind(name, mime)
    return kind === "other" ? null : FILE_KIND_HUE[kind]
}

/**
 * A file name in two parts for a middle cut drawn by CSS: the head, which
 * truncates to whatever room the card has, and the tail (the last letters and
 * the extension), which never shrinks, so "OneCamp brand guidel…agency.pdf"
 * keeps its start and its type at any width. Pure.
 */
export function splitForMiddle(name: string): [head: string, tail: string] {
    const dot = name.lastIndexOf(".")
    const cut = dot > 0 && name.length - dot <= 8 ? Math.max(0, dot - 4) : Math.max(0, name.length - 6)
    if (name.length <= 12 || cut <= 0) return [name, ""]
    return [name.slice(0, cut), name.slice(cut)]
}
