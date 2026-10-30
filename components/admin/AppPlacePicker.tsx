"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorState } from "@/components/ui/error-state"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { FileText, Table } from "@/lib/icons"
import { useSearchPicks } from "@/hooks/useSearchPicks"
import type { SearchResult } from "@/services/searchService"
import type { DataTable } from "@/services/tableService"
import { ADDABLE_KINDS, type AddableKind, type AppPlace } from "@/components/admin/appAccess"

const KIND_OPTIONS = [
  { value: "doc", label: "Docs" },
  { value: "table", label: "Tables" },
] as const satisfies ReadonlyArray<{ value: AddableKind; label: string }>

/** A doc the search found, as the picker offers it. */
const pickDoc = (r: SearchResult) => (r.type === "doc" && r.doc?.doc_uuid ? { id: String(r.doc.doc_uuid), title: r.doc.doc_title || "Untitled doc" } : null)

/**
 * Finding a doc or a table to add: docs through the workspace search (what the
 * admin may open), tables from their own list. ↑ ↓ and Enter pick; a sheet on
 * a phone.
 */
export function AppPlacePicker({
  appName,
  tables,
  isAdded,
  saving,
  onPick,
  onClose,
}: {
  appName: string
  tables: DataTable[]
  isAdded: (kind: string, id: string) => boolean
  saving: boolean
  onPick: (p: AppPlace) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<AddableKind>(ADDABLE_KINDS[0])
  const [query, setQuery] = useState("")
  const { items: docs, searching, failed, retry } = useSearchPicks(query, pickDoc, { enabled: kind === "doc" })
  const list = useRef<CommandListHandle>(null)
  const [input, setInput] = useState<HTMLInputElement | null>(null)

  const q = query.trim().toLowerCase()
  const shown =
    kind === "doc" ? docs : tables.filter((t) => !q || t.name.toLowerCase().includes(q)).slice(0, 50).map((t) => ({ id: t.id, title: t.name }))
  const Icon = kind === "doc" ? FileText : Table
  // What can still be added first, so the first row Enter picks is one.
  const items: CommandListItem[] = [...shown]
    .sort((a, b) => Number(isAdded(kind, a.id)) - Number(isAdded(kind, b.id)))
    .map((s) => ({
      id: s.id,
      label: s.title,
      tile: (
        <CommandTile>
          <Icon />
        </CommandTile>
      ),
      disabled: saving || isAdded(kind, s.id),
      disabledReason: isAdded(kind, s.id) ? "Already added" : "Wait for the change under way",
      trailing: isAdded(kind, s.id) ? <span className="text-2xs text-muted-foreground">Added</span> : undefined,
    }))
  const empty =
    kind === "doc"
      ? q
        ? searching
          ? "Searching…"
          : "No doc you can open matches that."
        : "Type a doc's title to find it."
      : tables.length === 0
        ? "You can't open any table yet."
        : "No table you can open matches that."
  const searchFailed = kind === "doc" && !!q && !searching && failed

  return (
    <ResponsiveDialog
      title={`Add a doc or table to ${appName}`}
      description="Only what you may open is offered. Its tokens open it only where its user may too."
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div data-place-picker={kind} className="flex flex-col gap-2 pb-2">
        <SegmentedControl
          aria-label="What to add"
          value={kind}
          onValueChange={(v) => {
            setKind(v)
            setQuery("")
          }}
          options={KIND_OPTIONS}
          className="w-fit"
        />
        <Input
          ref={setInput}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (list.current?.onKeyDown(e)) e.preventDefault()
          }}
          placeholder={kind === "doc" ? "Find a doc" : "Find a table"}
          aria-label={kind === "doc" ? "Find a doc" : "Find a table"}
          disabled={saving}
        />
        <CommandList
          ref={list}
          comboboxFor={input}
          items={items}
          label={kind === "doc" ? "Docs" : "Tables"}
          query={query}
          empty={searchFailed ? <ErrorState compact subject="the docs" onRetry={retry} /> : <span className="px-2 py-3 text-sm text-muted-foreground">{empty}</span>}
          onSelect={(item) => {
            const s = shown.find((x) => x.id === item.id)
            if (s && !isAdded(kind, s.id)) onPick({ kind, id: s.id, title: s.title })
          }}
          maxHeight={280}
        />
      </div>
    </ResponsiveDialog>
  )
}

