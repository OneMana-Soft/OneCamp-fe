// What a node of the doc tree is and does (docs F1, Docs & Files): a page, a
// folder, a file or a link. Pure, no React: the tree's rows, the docs home's
// lists, the folder view and their tests read these one answers.

import { isSafeHref } from "@/lib/utils/safeHref"
import type { DocNodeKind } from "@/types/docGraph"

/** A page is the node with no kind; the server never writes "" or "page". */
export const isPageKind = (kind: DocNodeKind | undefined | null): boolean => !kind

/** Only a page or a folder holds other nodes (D-30): a file and a link are leaves. */
export const holdsChildren = (kind: DocNodeKind | undefined | null): boolean => !kind || kind === "folder"

/**
 * What opening a node does: a page opens in the editor; a folder opens in
 * place, at its own address (the doc route draws it as a folder); a file opens
 * its preview; a link opens the document it points to, in a new tab.
 */
export type NodeOpening = "editor" | "folder" | "preview" | "external"

export function openingOf(kind: DocNodeKind | undefined | null): NodeOpening {
  switch (kind) {
    case "folder":
      return "folder"
    case "file":
      return "preview"
    case "link":
      return "external"
    default:
      return "editor"
  }
}

/** A node's name in a sentence: "folder", "file", "link", "page". */
export const kindWord = (kind: DocNodeKind | undefined | null): string => kind ?? "page"

/** What a link field holds once it's checked: the address, or what's wrong with it. */
export type LinkCheck = { ok: true; url: string } | { ok: false; problem: string }

/**
 * A link as someone typed or pasted it, checked as the server checks it:
 * https only, a real host, and nothing the shared URL check refuses
 * (lib/utils/safeHref). An address typed without a scheme is taken as https;
 * one written with http is refused, never quietly changed. Pure.
 */
export function checkLinkUrl(raw: string): LinkCheck {
  const text = raw.trim()
  if (!text) return { ok: false, problem: "Paste a link." }
  if (/\s/.test(text)) return { ok: false, problem: "A link has no spaces in it." }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)?.[1]?.toLowerCase()
  if (scheme && scheme !== "https") {
    return { ok: false, problem: scheme === "http" ? "Only https:// links can be added." : "That isn't a web link." }
  }
  const candidate = scheme ? text : `https://${text.replace(/^\/+/, "")}`
  if (!isSafeHref(candidate)) return { ok: false, problem: "That isn't a web link." }
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, problem: "That isn't a web link." }
  }
  if (url.protocol !== "https:") return { ok: false, problem: "Only https:// links can be added." }
  if (url.username || url.password) return { ok: false, problem: "Take the name and password out of the link." }
  const host = url.hostname
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return { ok: false, problem: "That link has no site in it." }
  return { ok: true, url: url.toString() }
}

/** A link's site as people say it: its host without "www.". "" for an address that isn't one. Pure. */
export function linkSite(url: string | undefined | null): string {
  if (!url) return ""
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/**
 * What a link's provider's document is, for its mark: a doc, a sheet, slides,
 * a drive's file, a design, code, a video, or any other site.
 */
const LINK_FAMILIES = ["doc", "sheet", "slides", "drive", "design", "code", "video", "site"] as const
export type LinkFamily = (typeof LINK_FAMILIES)[number]

/** The family a work graph chip names for a link (it never names the address), if it is one. Pure. */
export const linkFamilyOf = (value: unknown): LinkFamily | undefined => LINK_FAMILIES.find((f) => f === value)

export interface LinkProvider {
  /** google-docs, onedrive, figma, … or site. */
  id: string
  /** As people say it: "Google Docs", "OneDrive"; the site itself for any other. */
  name: string
  family: LinkFamily
}

const BY_HOST: Array<[RegExp, (path: string) => LinkProvider | null]> = [
  [
    /^docs\.google\.com$/,
    (path) => {
      if (path.startsWith("/document/")) return { id: "google-docs", name: "Google Docs", family: "doc" }
      if (path.startsWith("/spreadsheets/")) return { id: "google-sheets", name: "Google Sheets", family: "sheet" }
      if (path.startsWith("/presentation/")) return { id: "google-slides", name: "Google Slides", family: "slides" }
      if (path.startsWith("/forms/")) return { id: "google-forms", name: "Google Forms", family: "doc" }
      return { id: "google-drive", name: "Google Drive", family: "drive" }
    },
  ],
  [/^drive\.google\.com$/, () => ({ id: "google-drive", name: "Google Drive", family: "drive" })],
  [/^(onedrive\.live\.com|1drv\.ms)$/, () => ({ id: "onedrive", name: "OneDrive", family: "drive" })],
  [
    /(^|\.)sharepoint\.com$/,
    (path) => {
      if (/\/:w:\//.test(path)) return { id: "word", name: "Word", family: "doc" }
      if (/\/:x:\//.test(path)) return { id: "excel", name: "Excel", family: "sheet" }
      if (/\/:p:\//.test(path)) return { id: "powerpoint", name: "PowerPoint", family: "slides" }
      return { id: "sharepoint", name: "SharePoint", family: "drive" }
    },
  ],
  [/(^|\.)dropbox\.com$/, () => ({ id: "dropbox", name: "Dropbox", family: "drive" })],
  [/(^|\.)box\.com$/, () => ({ id: "box", name: "Box", family: "drive" })],
  [/(^|\.)figma\.com$/, () => ({ id: "figma", name: "Figma", family: "design" })],
  [/(^|\.)miro\.com$/, () => ({ id: "miro", name: "Miro", family: "design" })],
  [/(^|\.)canva\.com$/, () => ({ id: "canva", name: "Canva", family: "design" })],
  [/^(github\.com|gist\.github\.com)$/, () => ({ id: "github", name: "GitHub", family: "code" })],
  [/(^|\.)gitlab\.com$/, () => ({ id: "gitlab", name: "GitLab", family: "code" })],
  [/(^|\.)notion\.(so|site)$/, () => ({ id: "notion", name: "Notion", family: "doc" })],
  [/^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)$/, () => ({ id: "youtube", name: "YouTube", family: "video" })],
  [/(^|\.)loom\.com$/, () => ({ id: "loom", name: "Loom", family: "video" })],
  [/(^|\.)vimeo\.com$/, () => ({ id: "vimeo", name: "Vimeo", family: "video" })],
]

/** Whose document a link is, from its address. Pure. */
export function linkProvider(url: string | undefined | null): LinkProvider {
  let u: URL | null = null
  try {
    u = url ? new URL(url) : null
  } catch {
    u = null
  }
  const host = u?.hostname.toLowerCase() ?? ""
  for (const [re, provider] of BY_HOST) {
    if (re.test(host)) {
      const p = provider(u?.pathname ?? "/")
      if (p) return p
    }
  }
  return { id: "site", name: host.replace(/^www\./, ""), family: "site" }
}
