"use client"

/**
 * A choice field's options, edited in place: the one editor for a table's
 * select columns and a project's task fields. Each option keeps its id
 * through a rename, so what holds it moves with it. A removal is handed on
 * by id (onChange's `removed`), never left for a save to infer from an
 * option missing: a list read before someone else's change cleared every
 * cell holding their options (the tables W0 audit's B1). Where the caller
 * says what a removal takes away, it asks first.
 *
 * Controlled: the caller holds the options and saves each change. Labels
 * are unique ignoring case, as the servers read them.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/paletteColorPicker"
import { GripVertical, Plus, X } from "@/lib/icons"
import { isComposingKey } from "@/lib/keys/ime"

/** An option as the editor shows it: its id once it has one, its label and colour. */
export interface ChoiceOption {
  id?: string
  label: string
  color?: string
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function OptionsEditor<O extends ChoiceOption>({
  options,
  onChange,
  make,
  keyOf = (o) => o.id ?? o.label,
  removal,
  renames,
  reorder = false,
  max,
  maxLength,
  busy = false,
}: {
  options: O[]
  /** The options after a change, and the ids of saved ones it takes out. */
  onChange: (next: O[], removed: string[]) => void
  /** A new option for a label typed: its id (or a draft's key) and colour. */
  make: (label: string, options: O[]) => O
  /** An option's key in the list: its id, or a draft's own. */
  keyOf?: (option: O) => string
  /** What taking an option out does to what holds it, said before it goes; null takes it out at once. */
  removal?: (option: O) => string | null
  /** What a rename does, said while it's typed ("Renames it in 12 rows"); null says nothing. */
  renames?: (option: O) => string | null
  /** Options can be dragged by their grip into another order. */
  reorder?: boolean
  /** The most options there can be. */
  max?: number
  maxLength?: number
  busy?: boolean
}) {
  const [draft, setDraft] = React.useState("")
  const [renaming, setRenaming] = React.useState<{ key: string; text: string } | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const dragged = React.useRef<number | null>(null)
  const taken = (label: string, except?: O) => options.some((o) => o !== except && sameLabel(o.label, label))

  const add = () => {
    const label = draft.trim()
    if (!label || taken(label)) return
    onChange([...options, make(label, options)], [])
    setDraft("")
  }
  const take = (o: O) => onChange(options.filter((x) => x !== o), o.id ? [o.id] : [])
  const remove = (o: O) => {
    if ((removal?.(o) ?? null) === null) take(o)
    else setRemoving(keyOf(o))
  }
  const rename = (o: O, input: HTMLInputElement) => {
    setRenaming(null)
    const label = input.value.trim()
    if (!label || label === o.label || taken(label, o)) {
      input.value = o.label
      return
    }
    onChange(options.map((x) => (x === o ? { ...x, label } : x)), [])
  }
  const move = (to: number) => {
    const from = dragged.current
    dragged.current = null
    if (from === null || from === to) return
    const next = [...options]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next, [])
  }

  return (
    <div className="space-y-1">
      <ul className="max-h-56 space-y-px overflow-y-auto" aria-label="Options">
        {options.map((o, i) => {
          const key = keyOf(o)
          const typed = renaming?.key === key && renaming.text.trim() !== o.label ? renames?.(o) : null
          const note = removing === key ? removal?.(o) : null
          return (
            <li key={key} className="group/opt" onDragOver={reorder ? (e) => e.preventDefault() : undefined} onDrop={reorder ? () => move(i) : undefined}>
              <div className="flex h-8 items-center gap-1 rounded-lg px-1 hover:bg-hover">
                {reorder ? (
                  <span
                    draggable={!busy}
                    onDragStart={(e) => {
                      dragged.current = i
                      // Firefox drags only what carries data; the row is what's seen moving.
                      e.dataTransfer?.setData("text/plain", o.label)
                      const row = e.currentTarget.closest("li")
                      if (row) e.dataTransfer?.setDragImage(row, 0, 0)
                    }}
                    className="inline-flex shrink-0 cursor-grab"
                    aria-hidden="true"
                  >
                    <GripVertical className="size-3.5 text-ink-4" />
                  </span>
                ) : null}
                <ColorPicker value={o.color ?? ""} label={o.label} disabled={busy} onChange={(color) => onChange(options.map((x) => (x === o ? { ...x, color } : x)), [])} />
                <input
                  // A rename made elsewhere shows: the box is drawn again.
                  key={o.label}
                  defaultValue={o.label}
                  maxLength={maxLength}
                  aria-label="Option name"
                  aria-describedby={typed ? `${key}-renames` : undefined}
                  disabled={busy}
                  onChange={(e) => setRenaming({ key, text: e.target.value })}
                  onBlur={(e) => rename(o, e.currentTarget)}
                  onKeyDown={(e) => {
                    if (isComposingKey(e.nativeEvent)) return
                    if (e.key === "Enter") {
                      e.preventDefault()
                      e.currentTarget.blur()
                    } else if (e.key === "Escape") {
                      // Its name back (a menu or dialog it sits in closes as well).
                      e.currentTarget.value = o.label
                      setRenaming(null)
                    }
                  }}
                  className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-ui text-ink outline-none focus:bg-raised focus:shadow-e1"
                />
                <button
                  type="button"
                  aria-label={`Remove ${o.label}`}
                  disabled={busy}
                  onClick={() => remove(o)}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 hover:bg-press hover:text-ink focus-visible:opacity-100 group-hover/opt:opacity-100 disabled:pointer-events-none [@media(hover:none)]:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {typed ? (
                <p id={`${key}-renames`} className="pb-1 pl-9 text-meta text-ink-3" data-option-renames="">
                  {typed}
                </p>
              ) : null}
              {note ? (
                <div className="mx-1 mb-1 space-y-1.5 rounded-lg bg-camp-sun-tint px-2.5 py-2 text-meta text-camp-sun-ink" role="alert">
                  <p>{note}</p>
                  <div className="flex gap-1.5">
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setRemoving(null)
                        take(o)
                      }}
                    >
                      Remove option
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setRemoving(null)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {max === undefined || options.length < max ? (
        <div className="flex h-8 items-center gap-1 px-1">
          <Plus className="mx-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            value={draft}
            maxLength={maxLength}
            placeholder="Add an option"
            aria-label="New option"
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Never the form's submit: Enter adds the option.
              if (e.key !== "Enter" || isComposingKey(e.nativeEvent)) return
              e.preventDefault()
              add()
            }}
            className="h-7 min-w-0 flex-1 bg-transparent px-1 text-ui text-ink outline-none placeholder:text-ink-3"
          />
          <Button type="button" size="xs" variant="ghost" aria-label="Add option" disabled={busy || !draft.trim()} onClick={add}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  )
}
