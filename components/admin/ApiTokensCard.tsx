"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { cn } from "@/lib/utils/helpers/cn"
import { Plus, Trash2, Loader2, Check, Copy, Key } from "@/lib/icons"
import {
  ApiToken,
  CreatedToken,
  parseScopes,
  scopeLabel,
  createApiToken,
  revokeApiToken,
} from "@/services/apiTokenService"

const EXPIRY_OPTIONS = [
  { value: 0, label: "No expiry" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
]

const ApiTokensCard = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, mutate } = useFetch<{ data: ApiToken[] }>(GetEndpointUrl.GetApiTokens)
  const { data: scopesData } = useFetch<{ data: string[] }>(GetEndpointUrl.GetApiTokenScopes)
  const tokens = data?.data || []
  const availableScopes = scopesData?.data || []

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [expiry, setExpiry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CreatedToken | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const openCreate = () => {
    setName("")
    setSelectedScopes(new Set())
    setExpiry(0)
    setCreated(null)
    setCreating(true)
  }

  const toggleScope = (s: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const handleCreate = async () => {
    if (!name.trim() || selectedScopes.size === 0) {
      toast({ title: "Add a name and at least one scope", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await createApiToken({
        name: name.trim(),
        scopes: Array.from(selectedScopes),
        expires_in_days: expiry,
      })
      setCreated(res)
      mutate()
    } catch {
      // surfaced by interceptor
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async (t: ApiToken) => {
    confirm({
      title: "Revoke token",
      description: `Revoke "${t.name}"? Apps using it will stop working immediately.`,
      confirmText: "Revoke",
      onConfirm: async () => {
        setBusyId(t.id)
        try {
          await revokeApiToken(t.id)
          toast({ title: "Token revoked" })
          mutate()
        } catch {
          // surfaced
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const copySecret = () => {
    if (created?.plaintext) {
      navigator.clipboard.writeText(created.plaintext)
      toast({ title: "Copied to clipboard" })
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="h-5 w-5 text-primary" />
            API tokens
          </CardTitle>
          <CardDescription className="max-w-xl">
            Create scoped tokens to use the OneCamp API. A token acts as you, limited to the scopes
            you grant. Send it as <code className="rounded bg-muted px-1">Authorization: Bearer …</code>.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          New token
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Key className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">No tokens yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((t) => {
              const revoked = !!t.revoked_at
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-start justify-between gap-4 rounded-xl border border-border/60 p-4",
                    revoked && "opacity-60",
                  )}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{t.token_prefix}…</code>
                      {revoked && <Badge variant="secondary" className="text-[10px]">Revoked</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parseScopes(t).map((s) => (
                        <Badge key={s} variant="outline" className="text-[11px] font-normal">{scopeLabel(s)}</Badge>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}` : "Never used"}
                      {t.expires_at ? ` · expires ${new Date(t.expires_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  {!revoked && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      disabled={busyId === t.id}
                      onClick={() => handleRevoke(t)}
                      title="Revoke"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" /> {created ? "Token created" : "New API token"}
            </DialogTitle>
            <DialogDescription>
              {created
                ? "Copy your token now. For security, you won't be able to see it again."
                : "Name it and choose what it can do."}
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
                <code className="flex-1 break-all text-xs">{created.plaintext}</code>
                <Button size="sm" variant="outline" onClick={copySecret} className="shrink-0 gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setCreating(false)} className="gap-1.5">
                  <Check className="h-4 w-4" /> Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="token-name">Name</Label>
                <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CI pipeline" maxLength={120} />
              </div>

              <div className="grid gap-2">
                <Label>Scopes</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableScopes.map((s) => {
                    const on = selectedScopes.has(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleScope(s)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {on ? <Check className="h-3 w-3" /> : null}
                        {scopeLabel(s)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Expiry</Label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPIRY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setExpiry(o.value)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        expiry === o.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Create token
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default ApiTokensCard
