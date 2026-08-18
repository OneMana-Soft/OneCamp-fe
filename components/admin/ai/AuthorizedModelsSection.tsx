"use client"

/**
 * AuthorizedModelsSection — admin allowlist of models members may pick from.
 *
 * The workspace has one default chat model (set above). This section lets an
 * admin authorize ADDITIONAL models, drawn from the already-configured
 * providers, that members can then choose for their personal AI assistant.
 * Revoking a model silently reverts affected members to the workspace default.
 *
 * Self-contained: it fetches and mutates /admin/ai/authorized-models directly
 * and only needs the provider list (from the parent AIConfig) to populate the
 * "add" form.
 */

import React, { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Plus, Trash2, SlidersHorizontal } from "@/lib/icons"
import {
  AIConfig,
  AuthorizedModel,
  MODEL_LIMIT_BOUNDS,
  getAuthorizedModels,
  authorizeModel,
  setAuthorizedModelEnabled,
  setAuthorizedModelLimits,
  discoverAuthorizedModelLimits,
  revokeAuthorizedModel,
} from "@/services/aiModelService"

/** 131072 → "128k". Windows are quoted in thousands everywhere else, so showing the raw
 *  integer in a list makes rows harder to compare at a glance. */
const formatTokens = (n: number): string =>
  n >= 1000 ? `${Math.round(n / 1000).toLocaleString()}k` : String(n)

/**
 * ModelLimitsEditor — the per-model token limits on one allowlist row.
 *
 * Collapsed by default and summarised in a word, because most models will never need
 * this: 0 means inherit the workspace window and that is the right answer until an
 * operator knows otherwise. Expanded, it says plainly what 0 does, so nobody has to guess
 * whether clearing a field disables the model or restores a default.
 */
const ModelLimitsEditor: React.FC<{
  model: AuthorizedModel
  /** The workspace window a blank field inherits, shown so the consequence of leaving it
   *  blank is visible rather than something the admin has to go and look up. */
  workspaceWindow: number
  onSaved: (limits: { context_window_tokens: number; max_output_tokens: number }) => void
  onClose: () => void
}> = ({ model, workspaceWindow, onSaved, onClose }) => {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [window_, setWindow] = useState(String(model.context_window_tokens || ""))
  const [output, setOutput] = useState(String(model.max_output_tokens || ""))

  // Ask the provider and FILL THE FORM — never save. Ollama, Anthropic and most
  // OpenAI-compatible gateways publish these; OpenAI publishes neither, and says so in
  // its note rather than leaving an empty field looking like a failure.
  const detect = async () => {
    setDetecting(true)
    try {
      const found = await discoverAuthorizedModelLimits(model.id)
      if (found.context_window_tokens > 0) setWindow(String(found.context_window_tokens))
      if (found.max_output_tokens > 0) setOutput(String(found.max_output_tokens))
      if (found.context_window_tokens > 0 || found.max_output_tokens > 0) {
        toast({
          title: "Detected from the provider",
          description: `${found.context_window_tokens > 0 ? `${formatTokens(found.context_window_tokens)} context` : "Output limit"}${found.source ? ` (from ${found.source})` : ""}. Review and save.`,
        })
      } else {
        // Not an error: several providers genuinely do not publish this.
        toast({ title: "Nothing to detect", description: found.note || "This provider did not report limits." })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not reach the provider"
      toast({ title: "Detection failed", description: msg, variant: "destructive" })
    } finally {
      setDetecting(false)
    }
  }

  // An empty field means 0 means inherit — the same thing, so the form does not need a
  // separate "clear" action.
  const parse = (s: string) => (s.trim() === "" ? 0 : Number(s.trim()))

  const save = async () => {
    const w = parse(window_)
    const o = parse(output)
    const bad =
      !Number.isInteger(w) ||
      !Number.isInteger(o) ||
      (w !== 0 && (w < MODEL_LIMIT_BOUNDS.contextWindow.min || w > MODEL_LIMIT_BOUNDS.contextWindow.max)) ||
      (o !== 0 && (o < MODEL_LIMIT_BOUNDS.maxOutput.min || o > MODEL_LIMIT_BOUNDS.maxOutput.max))
    if (bad) {
      toast({
        title: "Check those numbers",
        description: `Context window: 0 or ${MODEL_LIMIT_BOUNDS.contextWindow.min}–${MODEL_LIMIT_BOUNDS.contextWindow.max}. Max output: 0 or ${MODEL_LIMIT_BOUNDS.maxOutput.min}–${MODEL_LIMIT_BOUNDS.maxOutput.max}.`,
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    try {
      await setAuthorizedModelLimits(model.id, { context_window_tokens: w, max_output_tokens: o })
      onSaved({ context_window_tokens: w, max_output_tokens: o })
      onClose()
      toast({
        title: "Limits saved",
        description:
          w === 0
            ? `${model.label || model.model} now uses the workspace context window.`
            : `${model.label || model.model} now uses a ${formatTokens(w)} context window.`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save limits"
      toast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">
        Leave blank to inherit the workspace context window ({formatTokens(workspaceWindow)}). Set these when this
        model&apos;s
        window differs from that — otherwise long threads are trimmed to the wrong size, and on local models the
        model is also <em>run</em> at the wrong size.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs" htmlFor={`win-${model.id}`}>
            Context window (tokens)
          </Label>
          <Input
            id={`win-${model.id}`}
            inputMode="numeric"
            value={window_}
            onChange={(e) => setWindow(e.target.value)}
            placeholder="inherit"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs" htmlFor={`out-${model.id}`}>
            Max output (tokens)
          </Label>
          <Input
            id={`out-${model.id}`}
            inputMode="numeric"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="inherit"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={detect} disabled={saving || detecting}>
            {detecting ? "Detecting…" : "Detect"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || detecting}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || detecting}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

const AuthorizedModelsSection: React.FC<{ config: AIConfig }> = ({ config }) => {
  const { toast } = useToast()
  const [models, setModels] = useState<AuthorizedModel[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // Which row has its limits panel open. One at a time: these are rarely edited and two
  // open forms invite saving the wrong one.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add form state.
  const enabledProviders = (config.providers ?? []).filter((p) => p.enabled)
  const [providerId, setProviderId] = useState<string>(enabledProviders[0]?.id ?? "")
  const [modelName, setModelName] = useState("")
  const [label, setLabel] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setModels(await getAuthorizedModels())
    } catch {
      toast({ title: "Error", description: "Failed to load authorized models", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async () => {
    const model = modelName.trim()
    if (!providerId || !model) {
      toast({ title: "Pick a provider and enter a model", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      await authorizeModel(providerId, model, label.trim())
      setModelName("")
      setLabel("")
      await load()
      toast({ title: "Model authorized", description: `${model} is now available to members` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to authorize model"
      toast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async (m: AuthorizedModel, enabled: boolean) => {
    setBusy(true)
    try {
      await setAuthorizedModelEnabled(m.id, enabled)
      setModels((list) => list.map((x) => (x.id === m.id ? { ...x, enabled } : x)))
    } catch {
      toast({ title: "Error", description: "Failed to update model", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async (m: AuthorizedModel) => {
    setBusy(true)
    try {
      await revokeAuthorizedModel(m.id)
      setModels((list) => list.filter((x) => x.id !== m.id))
      toast({ title: "Model revoked", description: `${m.label || m.model} is no longer selectable` })
    } catch {
      toast({ title: "Error", description: "Failed to revoke model", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Member-selectable models</h3>
        <p className="text-xs text-muted-foreground">
          Authorize models members can choose for their own AI assistant. Everyone can always use the workspace
          default ({config.chat_model || "unset"}); these are extra options. Revoking one reverts members on it
          back to the default.
        </p>
      </div>

      {/* Add form */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Provider</Label>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {enabledProviders.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Model</Label>
          <Input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="e.g. gpt-4o-mini, llama3.2:3b"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Label (optional)</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Friendly name" />
        </div>
        <Button onClick={handleAdd} disabled={busy || !providerId} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" />
          Authorize
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : models.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No additional models authorized yet. Members will use the workspace default.
        </p>
      ) : (
        <ul className="space-y-2">
          {models.map((m) => (
            <li key={m.id} className="rounded-lg border border-border bg-card/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{m.label || m.model}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {m.provider_label}
                    </Badge>
                    {!m.provider_enabled && (
                      <Badge variant="destructive" className="text-[10px]">
                        provider disabled
                      </Badge>
                    )}
                  </div>
                  {m.label !== "" && <p className="truncate text-xs text-muted-foreground">{m.model}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Shows the effective window at a glance, so a misconfigured model is
                      visible in the list rather than only after opening it. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                    aria-expanded={expandedId === m.id}
                    aria-label={`Edit token limits for ${m.label || m.model}`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {m.context_window_tokens > 0 ? `${formatTokens(m.context_window_tokens)} context` : "Limits"}
                  </Button>
                  <Switch
                    checked={m.enabled}
                    disabled={busy}
                    onCheckedChange={(v) => handleToggle(m, v)}
                    aria-label="Enable model"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => handleRevoke(m)}
                    aria-label="Revoke model"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {expandedId === m.id && (
                <ModelLimitsEditor
                  model={m}
                  workspaceWindow={config.effective_context_window}
                  onSaved={(limits) =>
                    setModels((list) => list.map((x) => (x.id === m.id ? { ...x, ...limits } : x)))
                  }
                  onClose={() => setExpandedId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default AuthorizedModelsSection
