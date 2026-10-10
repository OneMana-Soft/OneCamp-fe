"use client"

// Saved views for a task list: Linear's and Asana's saved filters. Name what
// the list shows now (filters, sort, columns) and come back to it in one
// click. Private to the person, kept per project and for My Tasks. The panel
// is shared by the desktop toolbar (a popover) and the phone filter drawers
// (a tab), which own their own list state and pass it in.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Bookmark, Check, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { useTaskViews } from "@/hooks/useTaskViews"
import { sameView, type TaskViewState } from "@/lib/tasks/views"

interface PanelProps {
  scope: string
  current: TaskViewState
  apply: (state: TaskViewState) => void
  /** False where the list has no column choices (the phone drawers). */
  withColumns?: boolean
  enabled?: boolean
}

export function SavedTaskViewsPanel({ scope, current, apply, withColumns = true, enabled = true }: PanelProps) {
  const { views, isLoading, save, remove, busy } = useTaskViews(scope, enabled)
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const active = views.find((v) => sameView(v.state, current, withColumns))

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const replacing = views.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())
    const view = await save(trimmed, current)
    if (view) {
      setName("")
      toast({ title: replacing ? `Updated “${view.name}”` : `Saved “${view.name}”` })
    }
  }

  return (
    <div className="grid gap-2">
      {isLoading ? (
        <p className="px-1 text-xs text-muted-foreground">Loading views…</p>
      ) : views.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          No saved views yet. Set the filters and sort you want, then name them here.
        </p>
      ) : (
        <ul className="grid gap-0.5" aria-label="Saved views">
          {views.map((v) => (
            <li key={v.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => apply(v.state)}
                aria-current={active?.id === v.id ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", active?.id === v.id ? "opacity-100" : "opacity-0")} aria-hidden />
                <span className="truncate">{v.name}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                aria-label={`Delete view ${v.name}`}
                disabled={busy}
                onClick={() => void remove(v.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onSave} className="flex gap-1.5 border-t pt-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={active ? `Save as… (showing “${active.name}”)` : "Name this view"}
          aria-label="View name"
          className="h-8 min-w-0 flex-1 text-sm"
        />
        <Button type="submit" size="sm" className="h-8" disabled={!name.trim() || busy}>
          Save
        </Button>
      </form>
    </div>
  )
}

/** The desktop toolbar's "Views" button. */
export function SavedTaskViewsButton(props: Omit<PanelProps, "enabled">) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
          <Bookmark className="h-3.5 w-3.5" aria-hidden />
          Views
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <SavedTaskViewsPanel
          {...props}
          enabled={open}
          apply={(s) => {
            props.apply(s)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
