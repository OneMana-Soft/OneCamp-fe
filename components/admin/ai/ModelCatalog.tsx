"use client"

/**
 * ModelCatalog — a Notion-grade "browse & install" gallery for local Ollama
 * models.
 *
 * The catalog is server-driven: an embedded baseline merged with an optional
 * hosted manifest (AI_OLLAMA_CATALOG_URL), so newly-published models appear
 * WITHOUT a OneCamp redeploy. Each card shows capability tags, size, an
 * "installed" state, and a feasibility hint vs the server's actual RAM/disk.
 *
 * Installing reuses the same SSE pull as the manual installer, with live
 * progress inline on the card. Anything not in the list can still be pulled
 * via the manual tag input (kept alongside this for power users).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Download,
  Check,
  RefreshCw,
  X,
  AlertTriangle,
  Sparkles,
  Brain,
  Code,
  Eye,
  Wrench,
  MemoryStick,
} from "@/lib/icons"
import {
  CatalogCapability,
  CatalogModelView,
  PullProgress,
  getOllamaCatalog,
  pullModel,
  formatBytes,
} from "@/services/aiModelService"
import { useToast } from "@/hooks/use-toast"

// errMessage safely extracts a human-readable message from an unknown error
// (axios error shape or a plain Error) without resorting to `any`.
function errMessage(e: unknown): string {
  const ax = e as { response?: { data?: { msg?: string } }; message?: string }
  return ax?.response?.data?.msg || ax?.message || ""
}

// Capability → label + icon, for compact, scannable tags.
const CAP_META: Record<CatalogCapability, { label: string; Icon: React.FC<{ className?: string }> }> = {
  chat: { label: "Chat", Icon: Sparkles },
  embedding: { label: "Embeddings", Icon: MemoryStick },
  vision: { label: "Vision", Icon: Eye },
  code: { label: "Code", Icon: Code },
  tools: { label: "Tools", Icon: Wrench },
  reasoning: { label: "Reasoning", Icon: Brain },
}

type Filter = "all" | "recommended" | CatalogCapability | "installed"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "recommended", label: "Recommended" },
  { key: "chat", label: "Chat" },
  { key: "embedding", label: "Embeddings" },
  { key: "code", label: "Code" },
  { key: "vision", label: "Vision" },
  { key: "reasoning", label: "Reasoning" },
  { key: "installed", label: "Installed" },
]

export const ModelCatalog: React.FC<{
  providerId: string
  /** Called after a successful install so the parent can refresh its lists. */
  onInstalled: () => void
}> = ({ providerId, onInstalled }) => {
  const { toast } = useToast()
  const [models, setModels] = useState<CatalogModelView[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true)
      else setLoading(true)
      try {
        const cat = await getOllamaCatalog(providerId, refresh)
        setModels(cat.models ?? [])
      } catch (e) {
        toast({
          title: "Could not load model catalog",
          description: errMessage(e) || "Provider unreachable",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [providerId, toast],
  )

  useEffect(() => {
    load(false)
  }, [load])

  const filtered = useMemo(() => {
    if (!models) return []
    const q = query.trim().toLowerCase()
    return models.filter((m) => {
      if (filter === "recommended" && !m.recommended) return false
      if (filter === "installed" && !m.installed) return false
      if (
        filter !== "all" &&
        filter !== "recommended" &&
        filter !== "installed" &&
        !m.capabilities?.includes(filter)
      )
        return false
      if (!q) return true
      return (
        m.display_name.toLowerCase().includes(q) ||
        m.tag.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      )
    })
  }, [models, query, filter])

  const installedCount = useMemo(() => (models ?? []).filter((m) => m.installed).length, [models])

  const onCardInstalled = useCallback(
    (tag: string) => {
      setModels((prev) => (prev ? prev.map((m) => (m.tag === tag ? { ...m, installed: true } : m)) : prev))
      onInstalled()
    },
    [onInstalled],
  )

  return (
    <div className="space-y-3">
      {/* Toolbar: search + refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models (e.g. llama, embeddings, code)…"
            className="h-9 pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          title="Re-fetch the latest catalog"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count = f.key === "installed" ? installedCount : undefined
          if (f.key === "installed" && installedCount === 0) return null
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {count != null ? ` · ${count}` : ""}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg border border-border bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No models match your search.</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            You can still install any tag from{" "}
            <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="underline">
              ollama.com/library
            </a>{" "}
            using the manual installer below.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((m) => (
            <CatalogCard key={m.tag} model={m} providerId={providerId} onInstalled={() => onCardInstalled(m.tag)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── A single model card ──────────────────────────────────────────────

const CatalogCard: React.FC<{
  model: CatalogModelView
  providerId: string
  onInstalled: () => void
}> = ({ model, providerId, onInstalled }) => {
  const { toast } = useToast()
  const [pulling, setPulling] = useState(false)
  const [progress, setProgress] = useState<PullProgress | null>(null)
  const [updateRequired, setUpdateRequired] = useState(false)
  const abortRef = useRef<null | (() => void)>(null)

  const pct = useMemo(() => {
    if (!progress?.total || !progress.completed) return null
    return Math.round((progress.completed / progress.total) * 100)
  }, [progress])

  const start = () => {
    setPulling(true)
    setProgress({ status: "starting" })
    setUpdateRequired(false)

    const { promise, abort } = pullModel(providerId, model.tag, (p) => {
      setProgress(p)
      if (p.update_required) setUpdateRequired(true)
    })
    abortRef.current = abort

    promise
      .then((result) => {
        if (result.updateRequired) {
          setUpdateRequired(true)
          return
        }
        if (result.ok) {
          toast({ title: "Model installed", description: model.tag })
          onInstalled()
        } else {
          toast({
            title: "Install failed",
            description: result.error || "pull error",
            variant: "destructive",
          })
        }
      })
      .catch((e) => {
        if ((e as { name?: string })?.name !== "AbortError") {
          toast({ title: "Install failed", description: errMessage(e) || "pull error", variant: "destructive" })
        }
      })
      .finally(() => {
        setPulling(false)
        abortRef.current = null
      })
  }

  const cancel = () => {
    abortRef.current?.()
    setPulling(false)
    setProgress(null)
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h5 className="text-sm font-medium truncate">{model.display_name}</h5>
            {model.recommended && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                Recommended
              </Badge>
            )}
          </div>
          <p className="text-[11px] font-mono text-muted-foreground truncate">{model.tag}</p>
        </div>
        {model.installed ? (
          <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-500">
            <Check className="h-3 w-3" /> Installed
          </Badge>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground line-clamp-2">{model.description}</p>

      {/* Capability tags + size */}
      <div className="flex flex-wrap items-center gap-1">
        {(model.capabilities ?? []).map((c) => {
          const meta = CAP_META[c]
          if (!meta) return null
          const { label, Icon } = meta
          return (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Icon className="h-2.5 w-2.5" />
              {label}
            </span>
          )
        })}
        {model.parameters ? (
          <span className="text-[10px] text-muted-foreground">· {model.parameters}</span>
        ) : null}
        {model.size_bytes ? (
          <span className="text-[10px] text-muted-foreground">· {formatBytes(model.size_bytes)}</span>
        ) : null}
      </div>

      {/* Feasibility hint */}
      {!model.installed && model.fit && model.fit !== "ok" && (
        <p
          className={`flex items-start gap-1 text-[10px] ${
            model.fit === "risky" ? "text-destructive" : "text-amber-600 dark:text-amber-500"
          }`}
        >
          <AlertTriangle className="h-3 w-3 mt-px shrink-0" />
          {model.fit_reason || (model.fit === "risky" ? "May not run on this server." : "Close to your server's limits.")}
        </p>
      )}

      {/* Install / progress row */}
      {pulling ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="truncate">{progress?.status || "working…"}</span>
            <button type="button" onClick={cancel} className="hover:text-destructive flex items-center gap-0.5">
              <X className="h-3 w-3" /> cancel
            </button>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: pct != null ? `${pct}%` : "33%" }} />
          </div>
        </div>
      ) : model.installed ? (
        <Button variant="ghost" size="sm" disabled className="h-7 justify-start px-0 text-emerald-600 dark:text-emerald-500">
          <Check className="h-3.5 w-3.5 mr-1" /> Ready to use
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="h-7 w-full" onClick={start}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Install
        </Button>
      )}

      {updateRequired && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2">
          <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Ollama update required
          </p>
          <code className="mt-1 block rounded bg-muted px-1.5 py-1 text-[10px]">
            docker compose pull ollama &amp;&amp; docker compose up -d ollama
          </code>
        </div>
      )}
    </div>
  )
}
