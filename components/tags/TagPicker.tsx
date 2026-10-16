"use client"

import * as React from "react"
import { Plus } from "@/lib/icons"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { MAX_TAGS, MAX_TAG_LENGTH, joinTags, splitTags } from "@/lib/tags"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { TagPills } from "@/components/tags/TagPills"

export interface ProjectTag {
  name: string
  count: number
}

/** The tags in use in a project, most used first (GET /project/{id}/tags). */
export function useProjectTags(projectId: string | undefined) {
  const { data, mutate } = useFetch<{ data: ProjectTag[] }>(projectId ? `${GetEndpointUrl.ProjectTime}/${projectId}/tags` : "")
  return { tags: data?.data ?? [], refresh: mutate }
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
  const { tags: known, refresh } = useProjectTags(canEdit && open ? projectId : undefined)
  const current = splitTags(label)
  const has = (t: string) => current.some((c) => c.toLowerCase() === t.toLowerCase())
  const typed = query.trim().slice(0, MAX_TAG_LENGTH)
  const exists = typed !== "" && (known.some((k) => k.name.toLowerCase() === typed.toLowerCase()) || has(typed))
  const full = current.length >= MAX_TAGS

  const toggle = (t: string) => {
    onChange(joinTags(has(t) ? current.filter((c) => c.toLowerCase() !== t.toLowerCase()) : [...current, t]))
    setQuery("")
  }
  // Tags this task has that the project list doesn't know yet come first, then the project's.
  const options = [...current.filter((c) => !known.some((k) => k.name.toLowerCase() === c.toLowerCase())).map((name) => ({ name, count: 0 })), ...known]

  if (!canEdit) return <TagPills label={label} />

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery("")
        else void refresh()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={current.length ? `Labels: ${current.join(", ")}. Change labels` : "Add labels"}
          data-touch-target=""
          className="-ml-2 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-ink-3 transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
        >
          {current.length ? <TagPills label={label} /> : "Add labels"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-lg p-1 shadow-e3" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Find or create a label…" value={query} onValueChange={setQuery} maxLength={MAX_TAG_LENGTH} className="h-8" />
          <CommandList>
            <CommandEmpty>{typed ? null : "No tags in this project yet."}</CommandEmpty>
            {typed && !exists && !full && (
              <CommandGroup>
                <CommandItem value={`__new__${typed}`} onSelect={() => toggle(typed)} className="h-[30px] gap-2 rounded-md">
                  <Plus className="h-3.5 w-3.5 text-ink-3" />
                  <span className="truncate">Create &ldquo;{typed}&rdquo;</span>
                </CommandItem>
              </CommandGroup>
            )}
            {options.length > 0 && (
              <CommandGroup heading="Labels in this project">
                {options.map((t) => {
                  const on = has(t.name)
                  return (
                    <CommandItem key={t.name} checked={on} value={t.name} onSelect={() => toggle(t.name)} disabled={!on && full} className="h-[30px] gap-2 rounded-md">
                      {/* The label's own hue as a dot (W06), never a tinted pill. */}
                      <span aria-hidden className={cn(HUE_CLASS[hueFor(t.name)], "size-1.5 shrink-0 rounded-full bg-hue")} />
                      <span className="truncate">{t.name}</span>
                      {t.count > 0 && <span className="ml-auto text-xs tabular-nums text-ink-3">{t.count}</span>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
          {full && <p className="border-t px-3 py-2 text-xs text-muted-foreground">A task can have up to {MAX_TAGS} tags.</p>}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
