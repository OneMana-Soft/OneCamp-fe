"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Plus, Loader2, Table as TableIcon, Trash2, Sparkles } from "@/lib/icons"
import { DataTable, createTable, deleteTable, generateTable } from "@/services/tableService"
import { useConfirm } from "@/hooks/useConfirm"

export default function TablesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, mutate } = useFetch<{ data: DataTable[] }>(GetEndpointUrl.GetTables)
  const [creating, setCreating] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [prompt, setPrompt] = React.useState("")
  const [generating, setGenerating] = React.useState(false)

  const tables = data?.data || []

  const handleGenerate = async () => {
    const p = prompt.trim()
    if (!p) return
    setGenerating(true)
    try {
      const t = await generateTable(p)
      toast({ title: `Created "${t.name}"` })
      router.push(`/app/tables/${t.id}`)
    } catch {
      // surfaced by interceptor
    } finally {
      setGenerating(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const t = await createTable({ name: "Untitled table", visibility: "workspace" })
      router.push(`/app/tables/${t.id}`)
    } catch {
      // surfaced by interceptor
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (t: DataTable) => {
    confirm({
      title: "Delete table",
      description: `Delete table "${t.name}"? This can't be undone.`,
      confirmText: "Delete",
      onConfirm: async () => {
        setBusyId(t.id)
        try {
          await deleteTable(t.id)
          toast({ title: "Table deleted" })
          mutate()
        } catch {
          // surfaced
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TableIcon className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Tables</h1>
        </div>
        <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New table
        </Button>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-2">
        <Sparkles className="ml-1 h-4 w-4 shrink-0 text-primary" />
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !generating && handleGenerate()}
          placeholder="Describe a table and let AI build it, e.g. a CRM to track sales leads"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          maxLength={2000}
          disabled={generating}
        />
        <Button size="sm" onClick={handleGenerate} disabled={generating || !prompt.trim()} className="gap-1.5">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <TableIcon className="h-6 w-6 text-primary" />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">No tables yet</p>
            <p className="text-sm text-muted-foreground">
              Create a table to track anything: tasks, CRM, inventory, roadmaps.
            </p>
          </div>
          <Button variant="outline" onClick={handleCreate} disabled={creating}>
            <Plus className="h-4 w-4 mr-1.5" /> Create your first table
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tables.map((t) => (
            <div
              key={t.id}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 p-4 transition-colors hover:border-border"
            >
              <button
                onClick={() => router.push(`/app/tables/${t.id}`)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="text-lg">{t.icon || "📊"}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  {t.description && <p className="truncate text-xs text-muted-foreground">{t.description}</p>}
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                disabled={busyId === t.id}
                onClick={() => handleDelete(t)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
