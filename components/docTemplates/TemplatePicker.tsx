"use client"

// Choosing a doc template (docs programme B5): OneCamp's ten and the team's
// own, found by name or by kind, each shown as its page will start, and used
// in one press. Two uses, one picker:
//
//   create  a new doc from it ("New doc → From a template…"): the server
//           writes its body as it makes the doc, so it opens whole, once (N37);
//   apply   into the empty doc on screen (its empty starter's "More
//           templates"): the server writes it into the live copy, which
//           refuses a doc that holds anything, so a second tab can't double it.
//
// ↑ and ↓ move through the list, Enter uses the one chosen, and typing finds
// one by name. On a phone it is a sheet of rows, and a tap uses the template.

import * as React from "react"

import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Tile } from "@/components/ui/graphics"
import { useMedia } from "@/context/MediaQueryContext"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { BUILTIN_DOC_TEMPLATES, templateGlyph, templateHue } from "@/lib/docTemplates"
import { Loader2, Search } from "@/lib/icons"
import { isComposingKey } from "@/lib/keys/ime"
import { sanitizeRichHtml } from "@/lib/sanitizeHtml"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { applyTemplate, docTemplatePayload, docTemplatesKey } from "@/services/docHomeService"
import type { MarketplaceTemplate } from "@/services/marketplaceService"
import type { DocSpace } from "@/types/docGraph"

/** What choosing a template does. */
export type PickerMode = { kind: "create"; parentId?: string; space?: DocSpace } | { kind: "apply"; docId: string; onApplied?: () => void }

/** One template as the picker shows it. */
export interface PickerTemplate {
  id: string
  name: string
  description: string
  title: string
  category: string
  hue: string | undefined
  glyph: string | undefined
  preview?: string
  builtin: boolean
  author?: string
}

/** The gallery's answer as the picker's rows; OneCamp's own when there's no answer yet. Pure. */
export function pickerTemplates(list: MarketplaceTemplate[] | undefined): PickerTemplate[] {
  if (!list) {
    return BUILTIN_DOC_TEMPLATES.map((b) => ({ id: b.id, name: b.name, description: b.description, title: b.name, category: b.category, hue: b.hue, glyph: b.glyph, builtin: true }))
  }
  return list
    .filter((t) => t.kind === "doc")
    .map((t) => {
      const p = docTemplatePayload(t)
      return {
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        title: p.title,
        category: p.builtin ? p.category || "OneCamp" : "Your team's",
        hue: p.hue,
        glyph: p.glyph,
        preview: p.preview,
        builtin: p.builtin,
        author: p.builtin ? undefined : t.author_name,
      }
    })
}

/** The kinds to filter by, in the order the templates first use them. Pure. */
export function categoriesOf(ts: PickerTemplate[]): string[] {
  return ts.reduce<string[]>((out, t) => (out.includes(t.category) ? out : [...out, t.category]), [])
}

/** The templates a search and a kind keep. Pure. */
export function filterTemplates(ts: PickerTemplate[], text: string, category: string | null): PickerTemplate[] {
  const q = text.trim().toLowerCase()
  return ts.filter((t) => (!category || t.category === category) && (!q || `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(q)))
}

function TemplateTile({ t, size = "sm" }: { t: PickerTemplate; size?: "sm" | "md" }) {
  const Glyph = templateGlyph(t.glyph)
  return (
    <Tile hue={templateHue(t.hue)} size={size}>
      <Glyph />
    </Tile>
  )
}

/** A template's opening as its page will start: the server's preview, cleaned again here. */
function Preview({ t }: { t: PickerTemplate }) {
  return (
    <div className="relative h-full overflow-hidden rounded-lg bg-sunken px-5 pt-5" data-template-preview={t.id}>
      <div className="h-full overflow-hidden rounded-t-md bg-sheet px-6 pt-6 shadow-e1">
        <p className="mb-3 text-title-3 text-ink">{t.title}</p>
        {t.preview ? (
          <SafeHtml
            as="div"
            html={t.preview}
            sanitizer={sanitizeRichHtml}
            className={cn(
              "pointer-events-none select-none text-ui-sm leading-5 text-ink-2",
              "[&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-ui [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-ink",
              "[&_p]:mb-1 [&_strong]:font-semibold [&_strong]:text-ink [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3",
              "[&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5",
              "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-1 [&_li[data-type=taskItem]]:before:mr-2 [&_li[data-type=taskItem]]:before:inline-block [&_li[data-type=taskItem]]:before:size-3 [&_li[data-type=taskItem]]:before:rounded-[3px] [&_li[data-type=taskItem]]:before:align-[-1px] [&_li[data-type=taskItem]]:before:shadow-[inset_0_0_0_1.5px_var(--line-3)] [&_li[data-type=taskItem]]:before:content-[''] [&_li[data-type=taskItem]>p]:inline",
            )}
          />
        ) : (
          <p className="text-ui-sm text-ink-3">{t.description}</p>
        )}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-sunken" />
    </div>
  )
}

export default function TemplatePicker({ mode, onClose }: { mode: PickerMode; onClose: () => void }) {
  const { isMobile } = useMedia()
  const { data, isError, mutate } = useFetch<{ data: MarketplaceTemplate[] }>(docTemplatesKey, undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const all = React.useMemo(() => pickerTemplates(data?.data), [data])
  const [text, setText] = React.useState("")
  const [category, setCategory] = React.useState<string | null>(null)
  const shown = React.useMemo(() => filterTemplates(all, text, category), [all, text, category])
  const [chosenId, setChosenId] = React.useState<string | null>(null)
  const chosen = shown.find((t) => t.id === chosenId) ?? shown[0]
  const { create } = useCreateDoc()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState("")
  const listRef = React.useRef<HTMLDivElement>(null)

  const choose = async (t: PickerTemplate) => {
    if (busy) return
    setBusy(t.id)
    setError("")
    try {
      if (mode.kind === "create") {
        const id = await create({ templateId: t.id, title: t.title, parentId: mode.parentId, space: mode.space, busyKey: t.id })
        if (id) onClose()
      } else {
        await applyTemplate(mode.docId, t.id)
        mode.onApplied?.()
        onClose()
      }
    } catch (err) {
      // Said here, by the list, where the person is looking.
      setError(apiErrorMessage(err, "The template couldn't be added just now. Try again in a moment."))
    } finally {
      setBusy(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // An input method's Enter picks its word: it never uses a template.
    if (isComposingKey(e.nativeEvent)) return
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return
    if (!chosen) return
    e.preventDefault()
    if (e.key === "Enter") return void choose(chosen)
    const i = shown.indexOf(chosen)
    const next = shown[(i + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length]
    setChosenId(next.id)
    listRef.current?.querySelector(`[data-template-option="${next.id}"]`)?.scrollIntoView({ block: "nearest" })
  }

  const title = mode.kind === "create" ? "Start from a template" : "Use a template"
  const description = mode.kind === "create" ? "The doc opens with the template in it, ready to fill in." : "It goes into this doc, which is empty."
  const categories = categoriesOf(all)

  const finder = (
    <label className="flex h-9 items-center gap-2 rounded-lg bg-raised px-2.5 text-ink-3 shadow-e1 focus-within:focus-halo">
      <Search className="size-3.5 shrink-0" aria-hidden="true" />
      <input
        autoFocus={!isMobile}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find a template"
        aria-label="Find a template"
        role="combobox"
        aria-expanded="true"
        aria-autocomplete="list"
        aria-controls="template-options"
        aria-activedescendant={chosen ? `template-option-${chosen.id}` : undefined}
        className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-3 max-sm:text-base"
      />
    </label>
  )

  const kinds = (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Kinds of template">
      {[null, ...categories].map((c) => (
        <button
          key={c ?? "all"}
          type="button"
          aria-pressed={category === c}
          onClick={() => setCategory(c)}
          className={cn(
            "h-7 rounded-md px-2 text-ui-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
            category === c ? "bg-press font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
          )}
        >
          {c ?? "All"}
        </button>
      ))}
    </div>
  )

  const list = (
    <div ref={listRef} id="template-options" role="listbox" aria-label="Templates" className="flex flex-col gap-px">
      {shown.map((t) => (
        <div
          key={t.id}
          id={`template-option-${t.id}`}
          role="option"
          aria-selected={chosen?.id === t.id}
          data-template-option={t.id}
          onMouseEnter={() => setChosenId(t.id)}
          onClick={() => void choose(t)}
          className={cn(
            "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 max-sm:min-h-14",
            chosen?.id === t.id ? "bg-press" : "hover:bg-hover",
          )}
        >
          {busy === t.id ? (
            <Tile hue={templateHue(t.hue)} size="sm">
              <Loader2 className="animate-spin" />
            </Tile>
          ) : (
            <TemplateTile t={t} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ui font-[450] text-ink">{t.name}</span>
            <span className="block truncate text-ui-sm text-ink-3">{t.author ? `By ${t.author}` : t.description}</span>
          </span>
        </div>
      ))}
      {shown.length === 0 && <p className="px-2 py-6 text-center text-ui-sm text-ink-3">No templates match “{text.trim()}”.</p>}
    </div>
  )

  const failure = (isError || error) && (
    <p role="alert" className="px-1 text-ui-sm text-danger-ink">
      {error || (
        <>
          Your team&apos;s templates couldn&apos;t be loaded.{" "}
          <button type="button" onClick={() => void mutate()} className="font-medium underline-offset-2 hover:underline">
            Try again
          </button>
        </>
      )}
    </p>
  )

  if (isMobile) {
    return (
      <Drawer detent="large" open onOpenChange={(o) => !o && onClose()}>
        <DrawerContent data-template-picker="" className="flex flex-col">
          <DrawerTitle className="px-4 pb-1 pt-2 text-title-3 text-ink">{title}</DrawerTitle>
          <div className="flex flex-col gap-3 px-4 pb-2">
            {finder}
            {kinds}
            {failure}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">{list}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" data-template-picker="" className="gap-0 p-0">
        <div className="flex h-[min(560px,80vh)]">
          <div className="flex w-[300px] shrink-0 flex-col gap-3 border-r border-line p-4">
            <div>
              <DialogTitle className="text-title-3">{title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-ui-sm text-ink-2">{description}</DialogDescription>
            </div>
            {finder}
            {kinds}
            <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">{list}</div>
            {failure}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            {chosen ? (
              <>
                <div className="min-h-0 flex-1">
                  <Preview t={chosen} />
                </div>
                <div className="flex items-center gap-3">
                  <TemplateTile t={chosen} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-heading text-ink">{chosen.name}</span>
                    <span className="block truncate text-ui-sm text-ink-3">{chosen.description}</span>
                  </span>
                  <Button onClick={() => void choose(chosen)} disabled={!!busy} className="shrink-0 gap-1.5">
                    {busy === chosen.id && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    Use this template
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-ui-sm text-ink-3">Choose a template to see how it starts.</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
