"use client"

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { blocksFor } from "@/components/docEditor/registry/registry"
import type { CodecRule } from "@/lib/codec/types"

/**
 * WHAT A COPY FROM A DOC PASTES AS TEXT: Markdown (L17).
 *
 * The plain text ProseMirror puts on the clipboard joined blocks with up to
 * six blank lines and dropped what made them blocks: a list lost its markers,
 * a to-do its box, a heading its level and a link its address. Pasted into
 * Slack, GitHub or an email it read as a wall of loose lines. Now the text is
 * the selection as the Content Codec writes it (clipboardMarkdownWriter.ts),
 * one blank line between blocks. The rich copy (text/html) is unchanged, so a
 * paste into another doc still keeps it all.
 *
 * The writer is the codec (46 KB), so it isn't loaded with the doc: it is
 * fetched on idle once a doc's editor is up, or at the first selection,
 * whichever comes first. A copy is always answered at once: until the writer
 * is there it is plain text, as Tiptap writes it.
 */

/** Codec rules for blocks the codec has none of its own for: the block registry's. */
export const registryRules = (): CodecRule[] => blocksFor("doc", { ai: true }).flatMap((b) => b.codec || [])

type Writer = typeof import("./clipboardMarkdownWriter")
let writer: Writer | null = null
let loading: Promise<Writer> | null = null

/** The Markdown writer, fetched once; a failed fetch is tried again next time. */
export function loadClipboardWriter(): Promise<Writer> {
  if (!loading) {
    loading = import("./clipboardMarkdownWriter").then(
      (m) => (writer = m),
      (e) => {
        loading = null
        throw e
      },
    )
  }
  return loading
}

/** Fetches the writer, unless offline: then it waits for the connection (and a copy stays plain text). */
const fetchWriter = () => {
  if (writer || (typeof navigator !== "undefined" && navigator.onLine === false)) return
  void loadClipboardWriter().catch(() => {})
}

interface ClipboardMarkdownOptions {
  /** Codec rules for blocks the codec has none of its own for; by default the block registry's. */
  rules: () => CodecRule[]
}

/**
 * The extension, as the doc editor and the guest viewer carry it (the block
 * registry's clipboard-markdown entry, register.ts).
 */
export const ClipboardMarkdown = Extension.create<ClipboardMarkdownOptions>({
  name: "clipboardMarkdown",

  // Ahead of Tiptap's own text serializer (the first one asked wins).
  priority: 1000,

  addOptions() {
    return { rules: registryRules }
  },

  addProseMirrorPlugins() {
    const rules = this.options.rules
    return [
      new Plugin({
        key: new PluginKey("clipboardMarkdown"),
        view() {
          if (writer || typeof window === "undefined") return {}
          const idle = typeof window.requestIdleCallback === "function"
          const handle = idle ? window.requestIdleCallback(fetchWriter, { timeout: 10_000 }) : window.setTimeout(fetchWriter, 2_000)
          window.addEventListener("online", fetchWriter)
          return {
            // Something selected is something about to be copied.
            update(view) {
              if (!writer && !view.state.selection.empty) fetchWriter()
            },
            destroy() {
              if (idle) window.cancelIdleCallback(handle)
              else window.clearTimeout(handle)
              window.removeEventListener("online", fetchWriter)
            },
          }
        },
        props: {
          // Until the writer is there, nothing: Tiptap's serializer answers
          // with the plain text (ProseMirror asks the next one for "").
          clipboardTextSerializer: (slice, view) => (writer ? writer.sliceToMarkdown(slice, view, rules()) : ""),
        },
      }),
    ]
  },
})
