/**
 * The link a bookmark, an embed, a file block or a link mention stands for:
 * one rule for the codec (lib/codec/media.ts, and the API's media.go) and the
 * editor's own HTML (the blocks' renderHTML), so both write the same bytes.
 */

import { isSafeHref } from "@/lib/utils/safeHref"

/** What a file block draws: a player, a viewer, or a file chip. */
export const FILE_KINDS = ["file", "video", "audio", "pdf"]

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "")

/** An absolute web address that is safe to follow (as written: no space around it). */
export function webHref(s: string): boolean {
  return /^https?:\/\/\S/i.test(s) && !/\s$/.test(s) && isSafeHref(s)
}

/** A file's address: a web address, or one of the app's own paths. */
export function fileHref(s: string): boolean {
  return webHref(s) || (/^\/[^/\\\s]/.test(s) && !/\s$/.test(s) && isSafeHref(s))
}

/** The address and the words of the link a node stands for, or null when it has no safe one. */
export function mediaLinkOf(type: string, attrs: Record<string, unknown> | null | undefined): { href: string; text: string } | null {
  const a = attrs || {}
  const file = type === "fileBlock"
  const href = str(file || type === "webEmbed" ? a.src : a.href)
  if (!href || !(file ? fileHref(href) : webHref(href))) return null
  const text = file ? str(a.name) || href : type === "webEmbed" ? href : str(a.title) || href
  return { href, text }
}
