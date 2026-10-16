"use client"

// What an empty doc offers under its first line (docs programme B5; the shell's
// 'emptyStarter' slot, drawn by DocBodyLayer while the doc is blank and the
// reader may edit it): a template, or a file to start from. Each is a row of
// one list, in the slot's order: the templates (10), the import (15), and
// Doc AI's draft in the AI edition (20, B9's, drawn with StarterRow below).
// The list is gone at the first keystroke.
//
// A template is written by the server into the live copy (POST
// /doc/applyTemplate), which refuses a doc that holds anything, so a second
// click or a second tab never doubles it (N37). A file is read here and put
// in as the person's own edit, once, while the doc is still blank.
//
// Keys: ↓ from the empty first line moves into the list, ↑ and ↓ move along
// it, Enter picks, and Esc (or ↑ from the first row) goes back to the text.

import * as React from "react"
import type { Editor } from "@tiptap/core"

import { isBlankDoc } from "@/components/docEditor/DocBodyLayer"
import { busFor } from "@/components/docEditor/registry/commandBus"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { Tile } from "@/components/ui/graphics"
import { toast } from "@/hooks/use-toast"
import { QUICK_DOC_TEMPLATES, templateGlyph } from "@/lib/docTemplates"
import { LayoutTemplate, Loader2, Upload } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { applyTemplate } from "@/services/docHomeService"

const TemplatePicker = React.lazy(() => import("@/components/docTemplates/TemplatePicker"))

/** The rows of an empty doc's starter, in the order they're drawn. */
function starterRows(from: HTMLElement): HTMLElement[] {
  const list = from.closest("[data-doc-empty-starter]")
  return list ? Array.from(list.querySelectorAll<HTMLElement>("[data-starter-row]")) : []
}

/** Back to the text, at its end. */
function backToText(editor: Editor | null | undefined) {
  editor?.commands.focus("end")
}

/**
 * One row of an empty doc's starter: a 20 px tile, the words, and what it
 * comes with ("· Draft from this project's open tasks"), 32 px, at the text's
 * left edge. Doc AI's row (B9) is drawn with it, so the list reads as one.
 */
export function StarterRow({
  icon,
  label,
  hint,
  onPick,
  busy,
  disabled,
  editor,
  className,
  ...rest
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  onPick: () => void
  busy?: boolean
  disabled?: boolean
  editor?: Editor | null
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      backToText(editor)
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const rows = starterRows(e.currentTarget)
    const at = rows.indexOf(e.currentTarget)
    if (e.key === "ArrowUp" && at <= 0) return backToText(editor)
    rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus()
  }
  return (
    <button
      type="button"
      data-starter-row=""
      onClick={onPick}
      onKeyDown={onKeyDown}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "group/starter inline-flex h-8 min-w-[220px] max-w-full items-center gap-2.5 rounded-lg pl-1.5 pr-2.5 text-left text-ui text-ink-2 outline-none",
        "transition-colors duration-[140ms] ease-[var(--ease-out)] hover:bg-hover hover:text-ink hover:duration-0 focus-visible:bg-hover focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-brand",
        "disabled:pointer-events-none disabled:opacity-60 max-sm:h-11",
        className,
      )}
      {...rest}
    >
      {busy ? (
        <span className="inline-flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      ) : (
        icon
      )}
      <span className="min-w-0 truncate">
        {label}
        {hint && <span className="text-ink-3"> · {hint}</span>}
      </span>
    </button>
  )
}

/** A neutral tile, for a row that isn't one template. */
const PlainTile = ({ children }: { children: React.ReactNode }) => (
  <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-press text-ink-3 [&>svg]:size-3">
    {children}
  </span>
)

/** ↓ from the empty first line moves into the starter's list. */
function useArrowIn(editor: Editor | null | undefined, root: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const host = editor?.view?.dom?.parentElement
    if (!editor || !host) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.isComposing) return
      if (!editor.isEditable || !isBlankDoc(editor.state.doc)) return
      const first = root.current ? starterRows(root.current)[0] : undefined
      if (!first) return
      e.preventDefault()
      e.stopPropagation()
      first.focus()
    }
    // Before the editor's own keys: a blank doc's ↓ has nowhere else to go.
    host.addEventListener("keydown", onKey, true)
    return () => host.removeEventListener("keydown", onKey, true)
  }, [editor, root])
}

/** The templates: three to start from, and the rest in the picker. */
export function StarterTemplates({ docId, editor }: SlotProps) {
  const root = React.useRef<HTMLDivElement>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [picker, setPicker] = React.useState(false)
  useArrowIn(editor, root)

  // The template is in: the person names the doc next.
  const done = () => busFor(editor)?.emit("focusTitle", {})

  const use = async (templateId: string) => {
    if (busy) return
    setBusy(templateId)
    try {
      await applyTemplate(docId, templateId)
      done()
    } catch (err) {
      toast({ variant: "destructive", title: "The template wasn't added", description: apiErrorMessage(err, "Try again in a moment.") })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={root} data-starter="templates" className="flex flex-col items-start gap-0.5">
      <p className="mb-1 flex items-center gap-2 pl-1.5 text-meta font-medium text-ink-3">
        Start with
        <span className="font-normal max-sm:hidden" aria-hidden="true">
          <kbd className="kbd">↓</kbd> to choose
        </span>
      </p>
      {QUICK_DOC_TEMPLATES.map((t) => {
        const Glyph = templateGlyph(t.glyph)
        return (
          <StarterRow
            key={t.id}
            data-template-row={t.id}
            editor={editor}
            busy={busy === t.id}
            disabled={!!busy}
            onPick={() => void use(t.id)}
            label={t.name}
            icon={
              <Tile hue={t.hue} size="sm" className="size-5 rounded-[6px] [&>svg]:size-3">
                <Glyph />
              </Tile>
            }
          />
        )
      })}
      <StarterRow
        editor={editor}
        disabled={!!busy}
        onPick={() => setPicker(true)}
        label="More templates…"
        icon={
          <PlainTile>
            <LayoutTemplate />
          </PlainTile>
        }
      />
      {picker && (
        <React.Suspense fallback={null}>
          <TemplatePicker mode={{ kind: "apply", docId, onApplied: done }} onClose={() => setPicker(false)} />
        </React.Suspense>
      )}
    </div>
  )
}

/** What a file becomes in the doc: Markdown and HTML through the content codec (A7), text as paragraphs. */
async function fileToContent(file: File): Promise<object> {
  const text = await file.text()
  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  if (ext === "txt") {
    const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).filter((p) => p.trim())
    return {
      type: "doc",
      content: paragraphs.map((p) => ({
        type: "paragraph",
        content: p.split("\n").flatMap((line, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])]),
      })),
    }
  }
  const { codec } = await import("@/lib/codec")
  return ext === "html" || ext === "htm" ? codec.fromHTML(text) : codec.fromMarkdown(text)
}

/** Files this row reads in the browser. Word documents and zips go through More → Import files (A7). */
export const STARTER_IMPORT_TYPES = ".md,.markdown,.txt,.html,.htm"

/** A file to start from: its contents become this doc's, as the person's own edit. */
export function StarterImport({ editor }: SlotProps) {
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  const read = async (file: File | undefined) => {
    if (!file || !editor) return
    setBusy(true)
    try {
      const content = await fileToContent(file)
      // Only into a doc still blank: someone may have typed while it was read.
      if (!editor.isEditable || !isBlankDoc(editor.state.doc)) {
        toast({ title: "The doc isn't empty any more", description: "Nothing was added from the file." })
        return
      }
      editor.chain().setContent(content, true).focus("start").run()
    } catch {
      toast({ variant: "destructive", title: "That file couldn't be read", description: "Try a Markdown, HTML or text file." })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div data-starter="import" className="flex flex-col items-start">
      <StarterRow
        editor={editor}
        busy={busy}
        onPick={() => input.current?.click()}
        label="Import a file…"
        hint="Markdown, HTML or text"
        icon={
          <PlainTile>
            <Upload />
          </PlainTile>
        }
      />
      <input ref={input} type="file" accept={STARTER_IMPORT_TYPES} hidden onChange={(e) => void read(e.target.files?.[0])} />
    </div>
  )
}
