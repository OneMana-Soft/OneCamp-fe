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
 * truncates to whatever room the card has, and the tail, which never shrinks,
 * so "q4-launch-checkou…final.png" keeps its start and its type at any width.
 * The tail is the extension and the word before it when that word is 4 to 10
 * letters, else the last 4 letters before the extension; a name with no
 * short extension keeps its last 6. Pure.
 *
 * A short name stays whole, unless keepExtension: then its extension is the
 * tail, so a chip with less room than "Logo.png" reads "Lo….png", never
 * "Logo.…" (a table's files cell).
 */
export function splitForMiddle(name: string, keepExtension = false): [head: string, tail: string] {
    const dot = name.lastIndexOf(".")
    const typed = dot > 0 && name.length - dot <= 8
    const cut = typed ? lastWordAt(name, dot) : Math.max(0, name.length - 6)
    if (name.length <= 12 || cut <= 0) return keepExtension && typed ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
    return [name.slice(0, cut), name.slice(cut)]
}

/**
 * Where the word of 4 to 10 letters before the extension at dot starts, after
 * its break (a dash, an underscore, a dot or a space); dot - 4 when there is
 * none. A space goes with the tail, which keeps it, where the truncating head
 * would drop it.
 */
function lastWordAt(name: string, dot: number): number {
    for (let i = dot - 5; i > 0 && dot - i <= 11; i--) {
        if ("-_. ".includes(name[i])) return name[i] === " " ? i : i + 1
    }
    return Math.max(0, dot - 4)
}
