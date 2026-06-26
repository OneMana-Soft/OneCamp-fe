"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Sparkles, Workflow, Table as TableIcon, Loader2, Download, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import {
  MarketplaceTemplate,
  TemplateKind,
  installTemplate,
  deleteTemplate,
  installedPath,
} from "@/services/marketplaceService"
import { useConfirm } from "@/hooks/useConfirm"

const KIND_META: Record<TemplateKind, { label: string; icon: typeof Sparkles }> = {
  agent: { label: "Agent", icon: Sparkles },
  workflow: { label: "Automation", icon: Workflow },
  table: { label: "Table", icon: TableIcon },
}

const FILTERS: { value: "" | TemplateKind; label: string }[] = [
  { value: "", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "workflow", label: "Automations" },
  { value: "table", label: "Tables" },
]

export default function TemplatesPage() {
  const { toast } = useToast()
  const router = useRouter()
  const confirm = useConfirm()
  const [kind, setKind] = React.useState<"" | TemplateKind>("")
  const [selected, setSelected] = React.useState<MarketplaceTemplate | null>(null)

  const query = kind ? `${GetEndpointUrl.GetMarketplaceTemplates}?kind=${kind}` : GetEndpointUrl.GetMarketplaceTemplates
  const { data, isLoading, mutate } = useFetch<{ data: MarketplaceTemplate[] }>(query)
  const templates = data?.data || []

  const [busyId, setBusyId] = React.useState<string | null>(null)

  const handleInstall = async (t: MarketplaceTemplate) => {
    setBusyId(t.id)
    try {
      const res = await installTemplate(t.id)
      toast({ title: `Installed "${res.name}"`, description: "Opening it now." })
      setSelected(null)
      router.push(installedPath(res))
    } catch {
      // surfaced by interceptor
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (t: MarketplaceTemplate) => {
    confirm({
      title: "Remove template",
      description: `Remove "${t.name}" from the templates gallery?`,
      confirmText: "Remove",
      onConfirm: async () => {
        setBusyId(t.id)
        try {
          await deleteTemplate(t.id)
          toast({ title: "Template removed" })
          setSelected(null)
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
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-semibold">Templates</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Reusable agents, automations, and tables your team has shared. Install a copy in one click.
      </p>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            onClick={() => setKind(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              kind === f.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">No templates yet</p>
            <p className="text-sm text-muted-foreground">
              Publish an agent, automation, or table you built so your team can install it in one click.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const meta = KIND_META[t.kind]
            const Icon = meta?.icon || Sparkles
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="flex flex-col gap-2 rounded-xl border border-border/60 p-4 text-left transition-colors hover:border-border"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{t.icon || <Icon className="h-5 w-5 text-primary" />}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {meta?.label || t.kind}
                  </span>
                </div>
                <p className="font-medium leading-tight">{t.name}</p>
                {t.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                )}
                {t.author_name && (
                  <p className="mt-auto pt-2 text-xs text-muted-foreground">by {t.author_name}</p>
                )}
              </button>
            )
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-xl">
                    {selected.icon || <Sparkles className="h-5 w-5 text-primary" />}
                  </span>
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  {KIND_META[selected.kind]?.label} · by {selected.author_name || "a teammate"}
                </DialogDescription>
              </DialogHeader>

              {selected.description && (
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={() => handleInstall(selected)} disabled={busyId === selected.id} className="gap-1.5">
                  {busyId === selected.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Install
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => handleDelete(selected)}
                  disabled={busyId === selected.id}
                  title="Remove (author or admin only)"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
