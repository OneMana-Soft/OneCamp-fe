"use client"

/**
 * ProviderEditor — one provider's row in the admin AI panel.
 *
 * Two modes:
 *  - Edit mode (default): shows a configured provider (built-in or
 *    custom). Lets the admin set/clear the API key, edit the base URL
 *    (custom only), enable/disable, test the connection, and — for local
 *    Ollama — install/delete models.
 *  - Create mode: a form to add a new OpenAI-compatible custom endpoint.
 *
 * API keys are write-only from the FE's perspective: we only ever show
 * whether one is set (has_api_key), never the value.
 */

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plug, Save, Trash2, X, KeyRound, CheckCircle2, XCircle, Loader2, Settings2, ChevronDown } from "lucide-react"
import {
  ModelView,
  ProviderView,
  SystemStats,
  createProvider,
  updateProvider,
  deleteProvider,
  testConnection,
  formatBytes,
} from "@/services/aiModelService"
import { ModelInstaller } from "@/components/admin/ai/ModelInstaller"
import { ModelCatalog } from "@/components/admin/ai/ModelCatalog"
import { useToast } from "@/hooks/use-toast"

interface CommonProps {
  onChanged: () => Promise<unknown> | void
}

interface EditProps extends CommonProps {
  createMode?: false
  provider: ProviderView
  models: ModelView[]
  modelsLoading: boolean
  stats: SystemStats | null
  onEnsureModels: (providerId: string, refresh?: boolean) => Promise<void>
  onDeleteModel: (model: string) => Promise<void>
  onClose?: never
}

interface CreateProps extends CommonProps {
  createMode: true
  onClose: () => void
  provider?: never
  models?: never
  modelsLoading?: never
  stats?: never
  onEnsureModels?: never
  onDeleteModel?: never
}

type Props = EditProps | CreateProps

const kindBadge = (kind: string) => {
  switch (kind) {
    case "ollama":
      return <Badge variant="secondary">local · Ollama</Badge>
    case "openai":
      return <Badge variant="secondary">OpenAI</Badge>
    case "anthropic":
      return <Badge variant="secondary">Anthropic</Badge>
    default:
      return <Badge variant="outline">custom · OpenAI-compatible</Badge>
  }
}

export const ProviderEditor: React.FC<Props> = (props) => {
  // Pure dispatcher — no hooks here, so the early branch can't violate
  // rules-of-hooks. Each branch renders a component that owns its hooks.
  if (props.createMode) {
    return <CreateProviderForm onClose={props.onClose} onChanged={props.onChanged} />
  }
  return <EditProviderRow {...props} />
}

const EditProviderRow: React.FC<EditProps> = (props) => {
  const { toast } = useToast()
  const { provider, models, modelsLoading, onEnsureModels, onDeleteModel, onChanged } = props
  const isOllama = provider.kind === "ollama"
  const isCustom = provider.kind === "openai_compatible"
  // Only the hosted built-ins always need a key; custom OpenAI-compatible
  // endpoints (vLLM, LM Studio, ...) and local Ollama can run keyless.
  const requiresKey = provider.kind === "openai" || provider.kind === "anthropic"
  const needsKey = requiresKey && !provider.has_api_key

  const [baseURL, setBaseURL] = useState(provider.base_url)
  const [apiKey, setApiKey] = useState("") // empty = unchanged
  const [enabled, setEnabled] = useState(provider.enabled)
  const [insecureTLS, setInsecureTLS] = useState(provider.insecure_tls)
  const [busy, setBusy] = useState(false)
  const [testState, setTestState] = useState<null | { ok: boolean; msg: string }>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(isOllama)

  const dirty =
    baseURL !== provider.base_url || apiKey !== "" || insecureTLS !== provider.insecure_tls

  // Enable/disable persists immediately (optimistic) — a toggle that only
  // saved via the form was the source of "the toggle does nothing". Enabling a
  // key-required provider with no key would just create a broken "on" state, so
  // in that one case we open configure and prompt for the key instead.
  const toggleEnabled = async (next: boolean) => {
    if (next && needsKey) {
      setExpanded(true)
      toast({
        title: "API key required",
        description: `Add an API key to enable ${provider.label}.`,
      })
      return
    }
    const prev = enabled
    setEnabled(next)
    setBusy(true)
    try {
      await updateProvider(provider.id, { enabled: next })
      toast({ title: next ? `${provider.label} enabled` : `${provider.label} disabled` })
      await onChanged()
    } catch (e: any) {
      setEnabled(prev) // roll back on failure
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      await updateProvider(provider.id, {
        base_url: isCustom ? baseURL : undefined,
        enabled,
        api_key: apiKey === "" ? undefined : apiKey,
        insecure_tls: insecureTLS,
      })
      toast({ title: "Provider updated", description: provider.label })
      setApiKey("")
      await onChanged()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setTestState(null)
    try {
      const res = await testConnection({ provider_id: provider.id })
      setTestState({ ok: res.ok, msg: res.message })
      if (res.ok) onEnsureModels(provider.id, true)
    } catch (e: any) {
      setTestState({ ok: false, msg: e?.response?.data?.msg || e?.message || "failed" })
    } finally {
      setBusy(false)
    }
  }

  const clearKey = async () => {
    setBusy(true)
    try {
      await updateProvider(provider.id, { api_key: "" })
      toast({ title: "API key cleared" })
      await onChanged()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const removeProvider = async () => {
    setBusy(true)
    try {
      await deleteProvider(provider.id)
      toast({ title: "Provider removed", description: provider.label })
      await onChanged()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{provider.label}</span>
          {kindBadge(provider.kind)}
          {provider.has_api_key && <Badge variant="outline" className="gap-1"><KeyRound className="h-3 w-3" /> key set</Badge>}
          {needsKey && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
              <KeyRound className="h-3 w-3" /> key required
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Switch
            checked={enabled}
            disabled={busy}
            onCheckedChange={toggleEnabled}
            aria-label={`Enable ${provider.label}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configure
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-1">
          {/* Base URL — editable only for custom endpoints; shown read-only otherwise. */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Base URL</Label>
            <Input
              value={baseURL}
              disabled={!isCustom || busy}
              placeholder={isOllama ? "http://ollama:11434" : "https://api.example.com/v1"}
              onChange={(e) => setBaseURL(e.target.value)}
              className="h-9 font-mono text-xs"
            />
            {!isCustom && (
              <p className="text-[11px] text-muted-foreground">
                {isOllama ? "Set via OLLAMA_HOST env." : "Built-in provider endpoint."}
              </p>
            )}
          </div>

          {/* API key — write-only. Ollama usually needs none. */}
          {!isOllama && (
            <div className="grid gap-1.5">
              <Label className="text-xs">API key</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  disabled={busy}
                  placeholder={provider.has_api_key ? "•••••••• (unchanged)" : "paste key to set"}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-9 font-mono text-xs"
                />
                {provider.has_api_key && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={clearKey}>
                    clear
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Self-signed TLS opt-in — custom HTTPS endpoints only. */}
          {isCustom && baseURL.startsWith("https://") && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={insecureTLS} disabled={busy} onCheckedChange={setInsecureTLS} />
              Skip TLS verification (self-signed cert on a trusted network)
            </label>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || busy}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button size="sm" variant="secondary" onClick={test} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />}
              Test connection
            </Button>
            {!provider.is_builtin && (
              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={removeProvider}>
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            )}
            {testState && (
              <span className={`text-xs flex items-center gap-1 ${testState.ok ? "text-emerald-600" : "text-destructive"}`}>
                {testState.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {testState.msg}
              </span>
            )}
          </div>

          {/* Local model management (Ollama only). */}
          {isOllama && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Installed models</Label>
                <button
                  type="button"
                  onClick={() => onEnsureModels(provider.id, true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  refresh
                </button>
              </div>
              {modelsLoading ? (
                <p className="text-xs text-muted-foreground">loading…</p>
              ) : models.length === 0 ? (
                <p className="text-xs text-muted-foreground">No models installed yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {models.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    >
                      {m.id}
                      {m.size_bytes ? <span className="text-muted-foreground">{formatBytes(m.size_bytes)}</span> : null}
                      <button
                        type="button"
                        aria-label={`Delete ${m.id}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(m.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <ModelInstaller providerId={provider.id} onInstalled={() => onEnsureModels(provider.id, true)} />

              {/* Browse & install from the curated, server-driven catalog. */}
              <div className="pt-1">
                <Label className="text-xs font-medium">Browse models</Label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Popular models, kept current. Anything not listed can still be installed by tag above.
                </p>
                <ModelCatalog providerId={provider.id} onInstalled={() => onEnsureModels(provider.id, true)} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete-model confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete model?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-mono">{deleteTarget}</span> from the Ollama server and frees its
              disk space. If it&apos;s the active model, switch to another first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = deleteTarget
                setDeleteTarget(null)
                if (target) await onDeleteModel(target)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Create custom OpenAI-compatible endpoint ─────────────────────────

const CreateProviderForm: React.FC<{ onClose: () => void; onChanged: () => Promise<unknown> | void }> = ({
  onClose,
  onChanged,
}) => {
  const { toast } = useToast()
  const [label, setLabel] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [insecureTLS, setInsecureTLS] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testState, setTestState] = useState<null | { ok: boolean; msg: string }>(null)

  const test = async () => {
    if (!baseURL) return
    setBusy(true)
    setTestState(null)
    try {
      const res = await testConnection({
        kind: "openai_compatible",
        base_url: baseURL,
        api_key: apiKey || undefined,
        insecure_tls: insecureTLS,
      })
      setTestState({ ok: res.ok, msg: res.message })
    } catch (e: any) {
      setTestState({ ok: false, msg: e?.response?.data?.msg || e?.message || "failed" })
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!label || !baseURL) {
      toast({ title: "Label and base URL are required", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      await createProvider({ label, base_url: baseURL, api_key: apiKey || undefined, insecure_tls: insecureTLS })
      toast({ title: "Endpoint added", description: label })
      await onChanged()
      onClose()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Add OpenAI-compatible endpoint</h4>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Works with vLLM, LM Studio, OpenRouter, llama.cpp server, Together, Groq, or any gateway that speaks the
        OpenAI /v1 API.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Our vLLM" className="h-9" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Base URL</Label>
          <Input
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="http://vllm:8000/v1"
            className="h-9 font-mono text-xs"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">API key (optional)</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="leave blank if not required"
          className="h-9 font-mono text-xs"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={insecureTLS} onCheckedChange={setInsecureTLS} />
        Skip TLS verification (only for self-signed certs on a trusted internal network)
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={create} disabled={busy || !label || !baseURL}>
          <Save className="h-4 w-4 mr-1" /> Add endpoint
        </Button>
        <Button size="sm" variant="secondary" onClick={test} disabled={busy || !baseURL}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />}
          Test
        </Button>
        {testState && (
          <span className={`text-xs flex items-center gap-1 ${testState.ok ? "text-emerald-600" : "text-destructive"}`}>
            {testState.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {testState.msg}
          </span>
        )}
      </div>
    </div>
  )
}
