/**
 * What someone may export and import (the API's Content IO capabilities),
 * heard once and kept five minutes. Its own small module: a doc's More menu
 * (lib/export/register) reads it on every doc, and the rest of the client,
 * the jobs and the export record (./contentIO), is for the dialogs.
 */

import axiosInstance, { OWN_ERRORS } from '@/lib/axiosInstance'

const CAPABILITIES = '/content-io/capabilities'

/** The browser's export formats: Markdown and HTML as the API writes them, PDF and Word made here. */
export type ExportFormat = 'md' | 'html' | 'pdf' | 'docx'

export interface ContentIOCapabilities {
  /** Whether this person may export docs (the docs.export.members policy; admins always may). */
  export: boolean
  export_formats: string[]
  /** The files a doc import reads (its importers). A spreadsheet is read by the table import's own readers (SHEET_EXTENSIONS). */
  import_extensions: string[]
  max_import_bytes: number
  /** A larger file goes to storage first, then the import starts. */
  max_direct_bytes: number
}

// What someone may do changes when an admin changes the policy: asked again
// after five minutes, and never more than once at a time.
const FRESH_MS = 5 * 60 * 1000
let known: { at: number; caps: ContentIOCapabilities } | null = null
let asking: Promise<ContentIOCapabilities | null> | null = null

/** The last capabilities heard, asking again when they are old; null until the first answer. */
export function knownCapabilities(): ContentIOCapabilities | null {
  if (!known || Date.now() - known.at > FRESH_MS) void loadCapabilities()
  return known?.caps ?? null
}

export function loadCapabilities(): Promise<ContentIOCapabilities | null> {
  if (asking) return asking
  asking = axiosInstance
    .get(CAPABILITIES, OWN_ERRORS)
    .then((res) => {
      const caps = res.data?.capabilities as ContentIOCapabilities | undefined
      if (caps) known = { at: Date.now(), caps }
      return caps ?? null
    })
    .catch(() => known?.caps ?? null)
    .finally(() => {
      asking = null
    })
  return asking
}

/** For tests: forget what was heard. */
export function forgetCapabilities(caps: ContentIOCapabilities | null = null) {
  known = caps ? { at: Date.now(), caps } : null
  asking = null
}

/** An export the API refused (403): exports are off for this person until they're heard again. */
export function exportRefused() {
  if (known) known = { at: Date.now(), caps: { ...known.caps, export: false } }
}
