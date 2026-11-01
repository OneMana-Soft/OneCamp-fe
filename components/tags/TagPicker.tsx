"use client"

import * as React from "react"
import type { ScopedMutator } from "swr"
import { Plus } from "@/lib/icons"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { ErrorState } from "@/components/ui/error-state"
import { cn } from "@/lib/utils/helpers/cn"
import { projectTagsKey, useProjectTags, type ProjectTag } from "@/hooks/useProjectTags"
import { readInto } from "@/lib/http/readInto"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { MAX_TAGS, MAX_TAG_LENGTH, joinTags, splitTags } from "@/lib/tags"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { TagPills } from "@/components/tags/TagPills"

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The picker's list: the task's tags the project's list doesn't know yet first, then the project's, most used first. */
function tagOptions(current: string[], known: ProjectTag[]): ProjectTag[] {
  return [...current.filter((c) => !known.some((k) => same(k.name, c))).map((name) => ({ name, count: 0 })), ...known]
}

/** The label with the tag put on, or taken off: the picker's toggle and the palette's. A full set takes no more. */
export function toggledLabel(label: string, tag: string): string {
  const current = splitTags(label)
  if (current.some((c) => same(c, tag))) return joinTags(current.filter((c) => !same(c, tag)))
  return current.length >= MAX_TAGS ? label : joinTags([...current, tag])
}

/**
 * The palette's Add or remove tag… (linear-28 H1b): the picker's list, the
 * project's tags read now through the picker's own key, those on the task
 * marked. A full set lists only its own, to take off.
 */
export async function tagChoices(mutate: ScopedMutator, projectId: string, label: string): Promise<{ name: string; current: boolean }[]> {
  const known = (await readInto<{ data?: ProjectTag[] | null }>(mutate, projectTagsKey(projectId))).data ?? []
  const current = splitTags(label)
  const listed = tagOptions(current, known).map((t) => ({ name: t.name, current: current.some((c) => same(c, t.name)) }))
  return current.length >= MAX_TAGS ? listed.filter((t) => t.current) : listed
}

/**
 * Tags on a task: the pills, and for someone who may edit, a picker of the
 * project's tags with a search that makes a new one (Linear's and Asana's
 * label pickers). `onChange` gets the label to save.
 */
export function TagPicker({
  projectId,
  label,
  canEdit,
  onChange,
}: {
  projectId: string | undefined
  label: string
  canEdit: boolean
  onChange: (label: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const { tags: known, failed, refresh } = useProjectTags(canEdit && open ? projectId : undefined, OWN_ERRORS)
  const current = splitTags(label)
  const has = (t: string) => current.some((c) => same(c, t))
  const typed = query.trim().slice(0, MAX_TAG_LENGTH)
  const exists = typed !== "" && (known.some((k) => k.name.toLowerCase() === typed.toLowerCase()) || has(typed))
  const full = current.length >= MAX_TAGS

  const toggle = (t: string) => {
    onChange(toggledLabel(label, t))
    setQuery("")
  }
  // Tags this task has that the project list doesn't know yet come first, then the project's.
  const options = tagOptions(current, known)

  if (!canEdit) return <TagPills label={label} />

  return (
    <Combobox
      multiple
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery("")
        else void refresh()
      }}
    >
      <ComboboxTrigger asChild>
        <button
          type="button"
          aria-label={current.length ? `Labels: ${current.join(", ")}. Change labels` : "Add labels"}
          data-touch-target=""
          className="-ml-2 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-ink-3 transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
        >
          {current.length ? <TagPills label={label} /> : "Add labels"}
        </button>
      </ComboboxTrigger>
      <ComboboxContent label="Labels">
        {failed ? (
          // Not knowing the project's labels, it can't tell a new one from one
          // that exists: a read that failed offers Try again, never Create.
          <ErrorState compact subject="this project's labels" onRetry={() => void refresh()} />
        ) : (
          <>
            <ComboboxInput placeholder="Find or create a label…" value={query} onValueChange={setQuery} maxLength={MAX_TAG_LENGTH} />
            <ComboboxList>
              <ComboboxEmpty>{typed ? null : "No tags in this project yet."}</ComboboxEmpty>
              {typed && !exists && !full && (
                <ComboboxGroup>
                  <ComboboxItem value={`__new__${typed}`} onSelect={() => toggle(typed)}>
                    <Plus className="h-3.5 w-3.5 text-ink-3" />
                    <span className="truncate">Create &ldquo;{typed}&rdquo;</span>
                  </ComboboxItem>
                </ComboboxGroup>
              )}
              {options.length > 0 && (
                <ComboboxGroup heading="Labels in this project">
                  {options.map((t) => {
                    const on = has(t.name)
                    return (
                      <ComboboxItem key={t.name} checked={on} value={t.name} onSelect={() => toggle(t.name)} disabled={!on && full}>
                        {/* The label's own hue as a dot (W06), never a tinted pill. */}
                        <span aria-hidden className={cn(HUE_CLASS[hueFor(t.name)], "size-1.5 shrink-0 rounded-full bg-hue")} />
                        <span className="truncate">{t.name}</span>
                        {t.count > 0 && <span className="ml-auto text-xs tabular-nums text-ink-3">{t.count}</span>}
                      </ComboboxItem>
                    )
                  })}
                </ComboboxGroup>
              )}
            </ComboboxList>
            {full && <p className="border-t border-line px-2 pt-1.5 text-xs text-ink-3">A task can have up to {MAX_TAGS} tags.</p>}
          </>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
