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
import { Plus, Trash2 } from "@/lib/icons"
import {
  AIConfig,
  AuthorizedModel,
  getAuthorizedModels,
  authorizeModel,
  setAuthorizedModelEnabled,
  revokeAuthorizedModel,
} from "@/services/aiModelService"

const AuthorizedModelsSection: React.FC<{ config: AIConfig }> = ({ config }) => {
  const { toast } = useToast()
  const [models, setModels] = useState<AuthorizedModel[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

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
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
            >
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
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default AuthorizedModelsSection
