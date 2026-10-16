"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Plus, Loader2, Search, MoreHorizontal, Pencil, Trash2, ArrowUpRight } from "@/lib/icons"
import { DataTable, createTable, deleteTable, updateTable } from "@/services/tableService"
import { useConfirm } from "@/hooks/useConfirm"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { TableGlyph } from "@/components/table/TableGlyph"
import { SpotImported, SpotSearch } from "@/components/ui/graphics"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { relativeTime } from "@/lib/utils/relativeTime"
import { cn } from "@/lib/utils/helpers/cn"

/** A key on the page that isn't typed into a field. */
function pageKey(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (e.metaKey || e.ctrlKey || e.altKey) return false
  return !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
}

/**
 * The tables page (content.md T01): a title row with the count, a search pill
 * and the one primary, "New table"; then the tables as rows on the sheet, with
 * no box around them and their actions in a "More" menu that shows on hover (a
 * trash can on every row read as the page's main action).
 */
export default function TablesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: DataTable[] }>(GetEndpointUrl.GetTables)
  const [creating, setCreating] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

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
      router.push(`/app/tables/${t.id}`)
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

  const handleDelete = (t: DataTable) => {
    confirm({
      title: `Delete the table "${t.name}"?`,
      description: "Its rows and columns are removed for everyone. This can't be undone.",
      confirmText: "Delete table",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteTable(t.id)
          toast({ title: "Table deleted" })
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
      await updateTable(t.id, { name: next, description: t.description || undefined, icon: t.icon || undefined, visibility: t.visibility })
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
        <label className="hidden h-8 w-60 items-center gap-2 rounded-lg bg-raised px-2.5 text-ui text-ink-3 shadow-e1 focus-within:ring-1 focus-within:ring-brand/50 sm:flex">
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("")
                e.currentTarget.blur()
              }
            }}
            aria-label="Search tables"
            placeholder="Search tables"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="kbd">/</kbd>
        </label>
        <Button onClick={handleCreate} disabled={creating} size="sm" className="gap-1.5">
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          New table
          <kbd className="kbd ml-0.5 hidden sm:inline-flex">T</kbd>
        </Button>
      </div>

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
      ) : tables.length === 0 ? (
        <EmptyState
          tone="accent"
          illustration={<SpotImported hue="moss" />}
          title="Make your first table"
          description="Track anything: vendors, budgets, content, hiring."
          className="px-6 py-16"
          action={
            <Button size="sm" onClick={handleCreate} disabled={creating} className="gap-1.5">
              <Plus className="size-3.5" /> New table
            </Button>
          }
        />
      ) : shown.length === 0 ? (
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur()
                      if (e.key === "Escape") setRenaming(null)
                    }}
                    className="h-8 min-w-0 flex-1 rounded-lg bg-raised px-2 text-ui font-medium shadow-e1 outline-none focus:ring-1 focus:ring-brand/50"
                  />
                </div>
              ) : (
                <Link
                  href={`/app/tables/${t.id}`}
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
                <DropdownMenuContent align="end" className="content-float w-52 rounded-xl p-1 shadow-e3">
                  <DropdownMenuItem asChild>
                    <Link href={`/app/tables/${t.id}`}>
                      <ArrowUpRight /> Open
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRenaming(t.id)}>
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
