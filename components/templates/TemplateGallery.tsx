"use client"

// Choosing a template, for any kind of thing a template starts: a doc
// (components/docTemplates/TemplatePicker) or a board (components/board/
// templatePicker). One shell: found by name or by kind, the chosen one shown
// as it will start, and used in one press.
//
// ↑ and ↓ move through the list, Enter uses the one chosen, and typing finds
// one. On a phone it is a sheet of rows, and a tap uses the template.

import * as React from "react"

import { Button } from "@/components/ui/button"
import { busyWith } from "@/lib/ui/busyWith"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Search } from "@/lib/icons"
import { isComposingKey } from "@/lib/keys/ime"
import { cn } from "@/lib/utils/helpers/cn"

/** What the gallery needs of a template. */
export interface GalleryItem {
  id: string
  name: string
  description: string
  category: string
}

/** The kinds to filter by, in the order the templates first use them. Pure. */
export function categoriesOf<T extends Pick<GalleryItem, "category">>(ts: T[]): string[] {
  return ts.reduce<string[]>((out, t) => (out.includes(t.category) ? out : [...out, t.category]), [])
}

/** The templates a search and a kind keep; `words` adds what else a template is found by. Pure. */
export function filterTemplates<T extends GalleryItem>(ts: T[], text: string, category: string | null, words?: (t: T) => string): T[] {
  const q = text.trim().toLowerCase()
  return ts.filter((t) => (!category || t.category === category) && (!q || `${t.name} ${t.description} ${t.category} ${words?.(t) ?? ""}`.toLowerCase().includes(q)))
}

export function TemplateGallery<T extends GalleryItem>({
  items,
  title,
  description,
  tile,
  preview,
  subtitle,
  words,
  busy,
  failure,
  onChoose,
  onClose,
}: {
  items: T[]
  title: string
  description: string
  /** A template's small picture, in the list and beside the chosen one. */
  tile: (t: T, o: { busy: boolean; size: "sm" | "md" }) => React.ReactNode
  /** How the chosen one will start. */
  preview: (t: T) => React.ReactNode
  /** A row's second line (its description by default). */
  subtitle?: (t: T) => string
  /** What else a template is found by. */
  words?: (t: T) => string
  /** The template being used, while it is. */
  busy: string | null
  /** Said under the list, as an alert, when something failed. */
  failure?: React.ReactNode
  onChoose: (t: T) => void
  onClose: () => void
}) {
  // A sheet on a phone, held either way (components/ui/overlayMode).
  const sheet = useSheetMode()
  const [text, setText] = React.useState("")
  const [category, setCategory] = React.useState<string | null>(null)
  const shown = React.useMemo(() => filterTemplates(items, text, category, words), [items, text, category, words])
  const [chosenId, setChosenId] = React.useState<string | null>(null)
  const chosen = shown.find((t) => t.id === chosenId) ?? shown[0]
  const listRef = React.useRef<HTMLDivElement>(null)
  const categories = categoriesOf(items)

  const onKeyDown = (e: React.KeyboardEvent) => {
    // An input method's Enter picks its word: it never uses a template.
    if (isComposingKey(e.nativeEvent)) return
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return
    if (!chosen) return
    e.preventDefault()
    if (e.key === "Enter") return void onChoose(chosen)
    const i = shown.indexOf(chosen)
    const next = shown[(i + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length]
    setChosenId(next.id)
    listRef.current?.querySelector(`[data-template-option="${next.id}"]`)?.scrollIntoView({ block: "nearest" })
  }

  const finder = (
    <label className="flex h-9 items-center gap-2 rounded-lg bg-raised px-2.5 text-ink-3 shadow-e1 focus-within:focus-halo">
      <Search className="size-3.5 shrink-0" aria-hidden="true" />
      <input
        autoFocus={!sheet}
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
            "h-7 rounded-md px-2 text-ui-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand max-sm:h-9",
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
          onClick={() => void onChoose(t)}
          className={cn(
            "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 max-sm:min-h-14",
            // A tap on a phone uses the template at once, so nothing there looks chosen before it.
            sheet ? "active:bg-press" : chosen?.id === t.id ? "bg-press" : "hover:bg-hover",
          )}
        >
          {tile(t, { busy: busy === t.id, size: "sm" })}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ui font-[450] text-ink">{t.name}</span>
            <span className="block truncate text-ui-sm text-ink-3">{subtitle ? subtitle(t) : t.description}</span>
          </span>
        </div>
      ))}
      {shown.length === 0 && <p className="px-2 py-6 text-center text-ui-sm text-ink-3">No templates match “{text.trim()}”.</p>}
    </div>
  )

  if (sheet) {
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
      {/* No padding of its own, so the footer runs edge to edge without bleeding past it (app/dialogEdges.test.ts). */}
      <DialogContent size="xl" data-template-picker="" className="gap-0 p-0 [--dlg-pad:0px]">
        <div className="flex h-[min(500px,72vh)] min-h-0">
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
          <div className="flex min-w-0 flex-1 flex-col p-4">
            {chosen ? (
              <div className="min-h-0 flex-1">{preview(chosen)}</div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-ui-sm text-ink-3">Choose a template to see how it starts.</div>
            )}
          </div>
        </div>
        {/* The chosen one and its action, pinned in view whatever the list's length. */}
        <DialogFooter className="flex-row items-center gap-3 px-4 py-3 sm:justify-start sm:space-x-0">
          {chosen ? (
            <>
              {tile(chosen, { busy: false, size: "md" })}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-heading text-ink">{chosen.name}</span>
                <span className="block truncate text-ui-sm text-ink-3">{chosen.description}</span>
              </span>
              <Button onClick={() => void onChoose(chosen)} {...busyWith(busy, chosen.id)} className="shrink-0 gap-1.5">
                Use this template
              </Button>
            </>
          ) : (
            <span className="flex-1 text-ui-sm text-ink-3">No template chosen.</span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
