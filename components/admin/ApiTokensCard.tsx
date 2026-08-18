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
import { Plus, Trash2, Loader2, Check, Copy, Key, Sparkles } from "@/lib/icons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { CopyableCode } from "@/components/ui/copyable-code"
import { mcpClientConfig, mcpEndpointUrl } from "@/lib/utils/mcpEndpoint"
import {
  ApiToken,
  CreatedToken,
  parseScopes,
  scopeLabel,
  createApiToken,
  revokeApiToken,
} from "@/services/apiTokenService"
import { Agent, parseEnabledTools, toolLabel } from "@/services/agentService"

const EXPIRY_OPTIONS = [
  { value: 0, label: "No expiry" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
]

/** The picker value meaning "a plain integration credential, bound to no agent". */
const NO_AGENT = ""

const ApiTokensCard = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: ApiToken[] }>(GetEndpointUrl.GetApiTokens)
  const { data: scopesData } = useFetch<{ data: string[] }>(GetEndpointUrl.GetApiTokenScopes)
  // The agents endpoint already returns only agents the caller may manage — their own,
  // or all of them for an admin — so every option offered here is one the server will
  // accept. No client-side ownership filter to keep in sync with the server's rule.
  const { data: agentsData } = useFetch<{ data: Agent[] }>(GetEndpointUrl.GetAgents)
  const tokens = data?.data || []
  const availableScopes = scopesData?.data || []
  // Only ACTIVE agents: binding to a deactivated one is refused by the server, since
  // the credential would be rejected on every call.
  const bindableAgents = (agentsData?.data || []).filter((a) => a.is_active)
  const agentsById = new Map(bindableAgents.map((a) => [a.id, a]))

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [expiry, setExpiry] = useState(0)
  const [agentId, setAgentId] = useState<string>(NO_AGENT)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CreatedToken | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const boundAgent = agentId ? agentsById.get(agentId) : undefined
  const boundAgentTools = boundAgent ? parseEnabledTools(boundAgent) : []

  const openCreate = () => {
    setName("")
    setSelectedScopes(new Set())
    setExpiry(0)
    setAgentId(NO_AGENT)
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
        ...(agentId ? { agent_id: agentId } : {}),
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

  // Resolved once. Empty when this build has no backend URL configured, in which case the MCP block
  // is omitted rather than shown with a broken URL in it.
  const mcpEndpoint = mcpEndpointUrl()

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
          <div role="status" aria-label="Loading API tokens">
            <SkeletonRows rows={3} />
          </div>
        ) : isError ? (
          <ErrorState subject="your API tokens" onRetry={() => void mutate()} />
        ) : tokens.length === 0 ? (
          <EmptyState
            tone="accent"
            icon={Key}
            title="No tokens yet"
            description="Create a token to call the OneCamp API from a script or another service."
          />
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
                      <code className="rounded bg-muted px-1.5 py-0.5 text-2xs">{t.token_prefix}…</code>
                      {/* Which identity this credential acts as. Worth a badge rather than
                          fine print: it changes who the audit log names, what budget the
                          spend lands on, and whether deactivating an agent stops it. */}
                      {t.agent_id && (
                        <Badge variant="outline" className="gap-1 text-3xs font-normal">
                          <Sparkles className="h-3 w-3" />
                          {agentsById.get(t.agent_id)?.name || "Agent"}
                        </Badge>
                      )}
                      {revoked && <Badge variant="secondary" className="text-3xs">Revoked</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parseScopes(t).map((s) => (
                        <Badge key={s} variant="outline" className="text-2xs font-normal">{scopeLabel(s)}</Badge>
                      ))}
                    </div>
                    <p className="text-2xs text-muted-foreground">
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

              {/*
                THE MCP CONFIG, WITH THE REAL TOKEN ALREADY IN IT.
                
                This is the only moment it can be offered. Only a SHA-256 hash is stored, so after
                this dialog closes nothing — not this screen, not an admin, not the database — can
                produce the credential again. A config block shown anywhere later could only carry a
                placeholder for the user to paste into by hand, which is the step most likely to go
                wrong and the one they have the least help with.
                
                Rendered for every token rather than only for MCP-shaped ones, because scopes do not
                tell you the client's intent: the same `docs:read` token serves a shell script and
                Claude Desktop equally. It costs a collapsed block and removes a trip to the docs.
                
                It does NOT claim the surface is on. That is an admin setting this user may not be
                able to see, so the note below states the dependency instead of asserting a state
                this screen cannot verify.
              */}
              {mcpEndpoint && (
                <details className="rounded-lg border border-border/60 bg-muted/20">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                    Use this token with an MCP client (Claude, Cursor, …)
                  </summary>
                  <div className="space-y-2 px-3 pb-3">
                    <CopyableCode
                      value={mcpClientConfig(created.plaintext)}
                      label="MCP client config"
                    />
                    <p className="text-2xs text-muted-foreground">
                      The token above is already filled in. External agent access also has to be
                      turned on by an admin in{" "}
                      <span className="font-medium">Admin → AI Models → External agent access</span>
                      ; until it is, the endpoint refuses every call regardless of this token&apos;s
                      scopes.
                    </p>
                  </div>
                </details>
              )}

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

              {bindableAgents.length > 0 && (
                <div className="grid gap-2">
                  <Label id="token-agent-label">Act as an agent</Label>
                  <p className="text-xs text-muted-foreground">
                    Optional. A token bound to an agent is recorded as that agent in the audit log,
                    stops the moment you deactivate it, spends from its daily budget, and can only
                    use the tools it has enabled. Leave this off for a script.
                  </p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="token-agent-label">
                    <button
                      type="button"
                      onClick={() => setAgentId(NO_AGENT)}
                      aria-pressed={agentId === NO_AGENT}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        agentId === NO_AGENT
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      No agent
                    </button>
                    {bindableAgents.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAgentId(a.id)}
                        aria-pressed={agentId === a.id}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          agentId === a.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>

                  {/* Say what the binding will actually permit, BEFORE the token is minted.
                      A bound token can do LESS than the scopes above, and finding that out
                      from a refused call in a client is the worst way to learn it. */}
                  {boundAgent && (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
                      {boundAgentTools.length === 0 ? (
                        <p className="text-destructive">
                          {boundAgent.name} has no tools enabled, so this token will not be able to
                          do anything. Enable tools on the agent first.
                        </p>
                      ) : (
                        <>
                          <p className="mb-1.5 text-muted-foreground">
                            Limited to {boundAgent.name}&apos;s {boundAgentTools.length} enabled{" "}
                            {boundAgentTools.length === 1 ? "tool" : "tools"}, whatever you grant above:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {boundAgentTools.map((tool) => (
                              <Badge key={tool} variant="outline" className="text-3xs font-normal">
                                {toolLabel(tool)}
                              </Badge>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

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
