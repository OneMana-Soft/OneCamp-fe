"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { fieldKeyDown, isComposingKey } from "@/lib/keys/ime"
import { Plus, Loader2, Search, MoreHorizontal, Pencil, Trash2, ArrowUpRight, RotateCcw } from "@/lib/icons"
import { DataTable, createTable, deleteTable, generateTable, updateTable } from "@/services/tableService"
import { useConfirm } from "@/hooks/useConfirm"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { TableGlyph } from "@/components/table/TableGlyph"
import { Spark, SpotImported, SpotSearch } from "@/components/ui/graphics"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { relativeTime } from "@/lib/utils/relativeTime"
import { cn } from "@/lib/utils/helpers/cn"
import { tablePath } from "@/lib/tables/route"
import { restoreTable } from "@/lib/tables/ledger"
import { useUndoToast } from "@/components/table/ledger/useUndoToast"
import { TablesTrash } from "@/components/table/trash/TablesTrash"
import { areaHue } from "@/lib/areas"

/** What the AI bar suggests: a click fills the input. */
const SUGGESTIONS = [
  { label: "Content calendar", prompt: "A content calendar with publish dates, channels, owners and a status" },
  { label: "Vendor list", prompt: "A vendor list with contacts, what each supplies, contract value and renewal date" },
  { label: "Bug triage", prompt: "A bug triage table with severity, area, owner, status and the day it was reported" },
]

/** A key on the page that isn't typed into a field. */
function pageKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (e.metaKey || e.ctrlKey || e.altKey) return false
  return !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
}

/**
 * The tables page (content.md T01): a title row with the count, a search pill
 * and the one primary, "New table"; an AI bar as a floating composer card;
 * then the tables as rows on the sheet, with no box around them and their
 * actions in a "More" menu that shows on hover (a trash can on every row read
 * as the page's main action).
 */
export default function TablesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  // The page shows a failed load itself, with Try again: no second, toast-borne copy.
  const { data, isLoading, isError, mutate } = useFetch<{ data: DataTable[] }>(GetEndpointUrl.GetTables, undefined, undefined, OWN_ERRORS)
  const [creating, setCreating] = React.useState(false)
  const ai = useAIAvailable()
  const [prompt, setPrompt] = React.useState("")
  const [generating, setGenerating] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const [trashOpen, setTrashOpen] = React.useState(false)
  const offerUndo = useUndoToast(React.useCallback(() => void mutate(), [mutate]))
  const renameNext = React.useRef<string | null>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const promptRef = React.useRef<HTMLInputElement>(null)

  const tables = React.useMemo(() => data?.data || [], [data])
  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tables
    return tables.filter((t) => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q))
  }, [tables, query])

  const handleCreate = React.useCallback(async () => {
    setCreating(true)
    try {
      const t = await createTable({ name: "Untitled table", visibility: "workspace" })
      router.push(tablePath(t.id))
    } catch {
      // surfaced by interceptor
    } finally {
      setCreating(false)
    }
  }, [router])

  // T makes a table, / searches.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pageKey(e)) return
      if (e.key === "t" || e.key === "T") {
        e.preventDefault()
        if (!creating) void handleCreate()
      } else if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [creating, handleCreate])

  const handleGenerate = async () => {
    const p = prompt.trim()
    if (!p) return
    setGenerating(p)
    try {
      const t = await generateTable(p)
      toast({ title: `Created "${t.name}"` })
      // Marked as made by AI: the table is private, and its page says why.
      router.push(tablePath(t.id, { made: "ai" }))
    } catch {
      // surfaced by interceptor
    } finally {
      setGenerating(null)
    }
  }

  const handleDelete = (t: DataTable) => {
    confirm({
      title: `Delete the table "${t.name}"?`,
      description: "It's removed for everyone, and kept in the trash with its rows and columns.",
      confirmText: "Delete table",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteTable(t.id)
          offerUndo("Table deleted", () => restoreTable(t.id))
          mutate()
        } catch {
          // surfaced
        }
      },
    })
  }

  const handleRename = async (t: DataTable, name: string) => {
    setRenaming(null)
    const next = name.trim()
    if (!next || next === t.name) return
    try {
      // The name alone: the rest of this list's copy may be out of date.
      await updateTable(t.id, { name: next })
      mutate()
    } catch {
      // surfaced
    }
  }

  const count = tables.length
  return (
    <div className="mx-auto w-full max-w-[944px] px-4 pb-16 pt-6 sm:px-8 sm:pt-8" data-tables-page="">
      <div className="flex flex-wrap items-center gap-3 pb-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-title-1 text-ink">Tables</h1>
          {count > 0 ? (
            <p className="mt-0.5 text-ui text-ink-2">
              {count} {count === 1 ? "table" : "tables"}
            </p>
          ) : null}
        </div>
        <label className="hidden h-8 w-60 items-center gap-2 rounded-lg bg-raised px-2.5 text-ui text-ink-3 shadow-e1 focus-within:focus-halo sm:flex">
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-escape-own=""
            onKeyDown={fieldKeyDown((e) => {
              if (e.key === "Escape") {
                setQuery("")
                e.currentTarget.blur()
              }
            })}
            aria-label="Search tables"
            placeholder="Search tables"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="kbd">/</kbd>
        </label>
        <Button variant="ghost" size="icon-sm" aria-label="Trash" title="Deleted tables" onClick={() => setTrashOpen(true)}>
          <RotateCcw className="size-4" />
        </Button>
        <Button onClick={handleCreate} disabled={creating} size="sm" className="gap-1.5">
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          New table
          <kbd className="kbd ml-0.5 hidden sm:inline-flex">T</kbd>
        </Button>
      </div>
      {trashOpen ? <TablesTrash onClose={() => setTrashOpen(false)} onRestored={() => void mutate()} /> : null}

      {/* The AI bar, where AI is on: with it off (or on the edition without
          it) Generate could only fail. */}
      {ai ? (
        <>
          {/* A floating composer card, not a search field. */}
          <div
            data-ai-bar=""
            className="mb-2 flex h-11 items-center gap-2.5 rounded-xl bg-raised pl-3.5 pr-1.5 shadow-e2 outline-0 outline-brand/15 transition-[outline-width] focus-within:outline-[3px] focus-within:focus-halo"
          >
            <Spark size={16} className="shrink-0 text-agent" />
            <input
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isComposingKey(e.nativeEvent) && !generating && handleGenerate()}
              aria-label="Describe a table for AI to build"
              placeholder="Describe a table and AI builds it: a hiring pipeline with stages and owners"
              className="min-w-0 flex-1 truncate bg-transparent text-ui text-ink outline-none placeholder:text-ink-3"
              maxLength={2000}
              disabled={!!generating}
            />
            <Button size="sm" variant="secondary" onClick={handleGenerate} disabled={!!generating || !prompt.trim()} className="gap-1.5">
              {generating && <Loader2 className="size-3.5 animate-spin" />}
              Generate
            </Button>
          </div>
          <div className="mb-6 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setPrompt(s.prompt)
                  promptRef.current?.focus()
                }}
                data-touch-target=""
                className="chip h-6 cursor-pointer gap-1.5 text-ink-2 transition-colors hover:bg-press hover:text-ink"
              >
                <span aria-hidden="true" className="size-1.5 rounded-[3px] bg-ink-3" />
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {isLoading ? (
        <div role="status" aria-label="Loading tables">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex h-14 items-center gap-3 border-b border-line" aria-hidden="true">
              <Skeleton className="size-8 rounded-[9px]" />
              <div className="space-y-1.5">
                <Skeleton className={cn("h-3 rounded", i % 2 ? "w-40" : "w-28")} />
                <Skeleton className="h-2.5 w-56 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        // Before the empty check: a failed request also leaves the list empty.
        <ErrorState subject="your tables" onRetry={() => void mutate()} className="rounded-xl bg-sunken px-6 py-16" />
      ) : tables.length === 0 && !generating ? (
        <EmptyState
          tone="accent"
          illustration={<SpotImported hue={areaHue("tables")} />}
          title="Make your first table"
          description="Track anything: vendors, budgets, content, hiring."
          className="px-6 py-16"
          action={
            // Secondary: New table is already the page's one primary, above.
            <Button size="sm" variant="secondary" onClick={handleCreate} disabled={creating} className="gap-1.5">
              <Plus className="size-3.5" /> New table
            </Button>
          }
        />
      ) : shown.length === 0 && !generating ? (
        <EmptyState
          illustration={<SpotSearch />}
          title={`No tables match “${query.trim()}”`}
          className="px-6 py-14"
          action={
            <Button size="sm" variant="secondary" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <ul className="-mx-3" data-tables-list="">
          {generating ? (
            <li className="hue-dusk content-row-in flex h-14 items-center gap-3 rounded-lg px-3" aria-live="polite">
              <span className="size-8 shrink-0 animate-shimmer rounded-[9px] bg-agent-muted" aria-hidden="true" />
              <span className="truncate text-ui text-ink-2">Building “{generating.slice(0, 60)}”…</span>
            </li>
          ) : null}
          {shown.map((t, i) => (
            <li
              key={t.id}
              style={{ "--i": i } as React.CSSProperties}
              className="content-event-in group relative flex min-h-14 items-center gap-3 rounded-lg px-3 transition-colors duration-[140ms] after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-line after:content-[''] last:after:hidden hover:bg-hover hover:after:opacity-0 [@media(hover:none)]:min-h-[60px]"
            >
              {renaming === t.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-2">
                  <TableGlyph icon={t.icon} id={t.id} />
                  <input
                    autoFocus
                    defaultValue={t.name}
                    aria-label="Table name"
                    maxLength={120}
                    onBlur={(e) => void handleRename(t, e.target.value)}
                    data-escape-own=""
                    onKeyDown={fieldKeyDown((e) => {
                      if (e.key === "Enter") e.currentTarget.blur()
                      if (e.key === "Escape") setRenaming(null)
                    })}
                    className="h-8 min-w-0 flex-1 rounded-lg bg-raised px-2 text-ui font-medium shadow-e1 outline-none focus:focus-halo"
                  />
                </div>
              ) : (
                <Link
                  href={tablePath(t.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <TableGlyph icon={t.icon} id={t.id} />
                  <span className="min-w-0">
                    <span className="block truncate text-ui font-medium text-ink">{t.name}</span>
                    <span className="block truncate text-meta text-ink-3">
                      {[t.description, t.visibility === "private" ? "Private" : null, t.updated_at ? `edited ${relativeTime(t.updated_at)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Link>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`More for ${t.name}`}
                    className="pointer-events-none size-7 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:size-11 [@media(hover:none)]:opacity-100"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="content-float w-52 rounded-xl p-1 shadow-e3"
                  // Rename opens its input once the menu has gone: while open, the
                  // menu holds the focus, and took it back from the new input,
                  // which ended the rename before a key was typed.
                  onCloseAutoFocus={(e) => {
                    if (renameNext.current !== t.id) return
                    renameNext.current = null
                    e.preventDefault()
                    setRenaming(t.id)
                  }}
                >
                  <DropdownMenuItem asChild>
                    <Link href={tablePath(t.id)}>
                      <ArrowUpRight /> Open
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => (renameNext.current = t.id)}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onSelect={() => handleDelete(t)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
