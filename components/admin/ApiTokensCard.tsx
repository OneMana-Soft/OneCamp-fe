"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Field } from "@/components/ui/field"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tile } from "@/components/ui/graphics/Tile"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { cn } from "@/lib/utils/helpers/cn"
import { Trash2, Loader2, Check, Copy, Key, Sparkles } from "@/lib/icons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { CopyableCode } from "@/components/ui/copyable-code"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate } from "@/lib/utils/date/shortDate"
import { mcpClientConfig, mcpEndpointUrl } from "@/lib/utils/mcpEndpoint"
import type { CampHue } from "@/lib/campHue"
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

/** The section's hue (lib/settingsSections), for its tiles. */
const HUE: CampHue = "berry"

const when = (iso: string) => shortDate(new Date(iso))

/**
 * The person's API tokens: the list, and the dialog that makes one. The page
 * (app/app/settings/api-tokens) opens the dialog from its header's "New token",
 * the page's one primary action; it used to sit in this card's own header,
 * under a title that said the page's name again.
 */
const ApiTokensCard = ({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (open: boolean) => void }) => {
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: ApiToken[] }>(GetEndpointUrl.GetApiTokens)
  // The agents endpoint already returns only agents the caller may manage — their own,
  // or all of them for an admin — so every option offered here is one the server will
  // accept. No client-side ownership filter to keep in sync with the server's rule.
  const { data: agentsData } = useFetch<{ data: Agent[] }>(GetEndpointUrl.GetAgents)
  const tokens = data?.data || []
  const agentsById = new Map((agentsData?.data || []).map((a) => [a.id, a]))
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleRevoke = (t: ApiToken) => {
    confirm({
      title: `Revoke the token "${t.name}"?`,
      description: "Apps using it stop working immediately. This can't be undone, but you can create a new token.",
      confirmText: "Revoke token",
      destructive: true,
      onConfirm: async () => {
        setBusyId(t.id)
        try {
          await revokeApiToken(t.id)
          toast({ title: "Token revoked" })
          mutate()
        } catch (e) {
          toast({
            title: `Couldn't revoke "${t.name}"`,
            description: apiErrorMessage(e, "Check your connection and try again."),
            variant: "destructive",
          })
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  return (
    <>
      {isLoading ? (
        <div role="status" aria-label="Loading your API tokens" className="rounded-lg border border-border px-4 py-3">
          <SkeletonRows rows={3} />
        </div>
      ) : isError ? (
        <ErrorState subject="your API tokens" onRetry={() => void mutate()} />
      ) : tokens.length === 0 ? (
        <EmptyState
          tone="accent"
          icon={Key}
          hue={HUE}
          title="No tokens yet"
          description="Create a token to call the OneCamp API from a script or another service."
        />
      ) : (
        <ul aria-label="Your API tokens" className="divide-y divide-border rounded-lg border border-border">
          {tokens.map((t) => {
            const revoked = !!t.revoked_at
            return (
              <li key={t.id} className={cn("flex items-start justify-between gap-4 px-4 py-3", revoked && "opacity-60")}>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium leading-5">{t.name}</span>
                    <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-2xs" translate="no">{t.token_prefix}…</code>
                    {/* Which identity this credential acts as. Worth a badge rather than
                        fine print: it changes who the audit log names, what budget the
                        spend lands on, and whether deactivating an agent stops it. */}
                    {t.agent_id && (
                      <Badge variant="outline" className="gap-1 text-2xs font-normal">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        {agentsById.get(t.agent_id)?.name || "Agent"}
                      </Badge>
                    )}
                    {revoked && <span className="text-xs text-muted-foreground">Revoked</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parseScopes(t).map((s) => (
                      <Badge key={s} variant="outline" className="text-2xs font-normal">{scopeLabel(s)}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.last_used_at ? `Last used ${when(t.last_used_at)}` : "Never used"}
                    {t.expires_at ? ` · expires ${when(t.expires_at)}` : ""}
                  </p>
                </div>
                {!revoked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke ${t.name}`}
                    className="h-8 w-8 shrink-0 text-danger-ink hover:text-danger-ink"
                    disabled={busyId === t.id}
                    onClick={() => handleRevoke(t)}
                    title="Revoke"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={onCreatingChange}>
        <DialogContent className="max-w-lg">
          {/* Mounted only while open, so every new token starts from a clean form. */}
          <NewTokenForm agents={(agentsData?.data || []).filter((a) => a.is_active)} onCreated={() => void mutate()} onDone={() => onCreatingChange(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The new-token dialog's body: the form, then the token itself, shown once. */
function NewTokenForm({ agents, onCreated, onDone }: { agents: Agent[]; onCreated: () => void; onDone: () => void }) {
  const { data: scopesData } = useFetch<{ data: string[] }>(GetEndpointUrl.GetApiTokenScopes)
  const availableScopes = scopesData?.data || []
  // Only ACTIVE agents are passed in: binding to a deactivated one is refused by the
  // server, since the credential would be rejected on every call.
  const agentsById = new Map(agents.map((a) => [a.id, a]))

  const [name, setName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [expiry, setExpiry] = useState(0)
  const [agentId, setAgentId] = useState<string>(NO_AGENT)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CreatedToken | null>(null)
  // What is missing, said under the field it is about; and a refusal from the
  // server, said in the dialog. Both used to be red toasts.
  const [errors, setErrors] = useState<{ name?: string; scopes?: string }>({})
  const [problem, setProblem] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const scopesRef = useRef<HTMLDivElement>(null)

  const boundAgent = agentId ? agentsById.get(agentId) : undefined
  const boundAgentTools = boundAgent ? parseEnabledTools(boundAgent) : []

  const toggleScope = (s: string) => {
    setErrors((e) => ({ ...e, scopes: undefined }))
    setSelectedScopes((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const handleCreate = async () => {
    const missing = {
      name: name.trim() ? undefined : "Give the token a name.",
      scopes: selectedScopes.size > 0 ? undefined : "Choose at least one scope.",
    }
    setErrors(missing)
    setProblem("")
    if (missing.name || missing.scopes) {
      // Focus goes to the first thing to fix.
      if (missing.name) nameRef.current?.focus()
      else scopesRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
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
      onCreated()
    } catch (e) {
      setProblem(`Couldn't create the token. ${apiErrorMessage(e, "Check your connection and try again.")}`)
    } finally {
      setSaving(false)
    }
  }

  const copySecret = async () => {
    if (!created?.plaintext) return
    try {
      await navigator.clipboard.writeText(created.plaintext)
      toast({ title: "Copied to clipboard" })
    } catch {
      toast({ title: "Couldn't copy", description: "Select the token and copy it yourself.", variant: "destructive" })
    }
  }

  // Resolved once. Empty when this build has no backend URL configured, in which case the MCP block
  // is omitted rather than shown with a broken URL in it.
  const mcpEndpoint = mcpEndpointUrl()

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Tile hue={HUE} size="sm">
            <Key />
          </Tile>
          {created ? "Token created" : "New API token"}
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
            <code className="flex-1 break-all text-xs" translate="no">{created.plaintext}</code>
            <Button size="sm" variant="outline" onClick={() => void copySecret()} className="shrink-0 gap-1.5">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
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
                Use this token with any MCP client (Open WebUI, goose, Cursor, Claude, …)
              </summary>
              <div className="space-y-2 px-3 pb-3">
                <CopyableCode value={mcpClientConfig(created.plaintext)} label="MCP client config" />
                <p className="text-xs text-muted-foreground">
                  The token above is already filled in. External agent access also has to be turned on by an admin, under{" "}
                  <span className="font-medium">Admin, AI &amp; agents, External agent access</span>. Until it is, the
                  endpoint refuses every call, whatever this token&apos;s scopes.
                </p>
              </div>
            </details>
          )}

          <div className="flex justify-end">
            <Button onClick={onDone} className="gap-1.5">
              <Check className="h-4 w-4" aria-hidden="true" /> Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void handleCreate()
          }}
        >
          <Field label="Name" error={errors.name}>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setErrors((x) => ({ ...x, name: undefined }))
              }}
              placeholder="CI pipeline…"
              maxLength={120}
              autoComplete="off"
              name="token-name"
            />
          </Field>

          <div className="grid gap-2">
            <Label id="token-scopes-label">Scopes</Label>
            <div
              ref={scopesRef}
              role="group"
              aria-labelledby="token-scopes-label"
              aria-describedby={errors.scopes ? "token-scopes-error" : undefined}
              className="flex flex-wrap gap-1.5"
            >
              {availableScopes.map((s) => {
                const on = selectedScopes.has(s)
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleScope(s)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                      on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {on ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                    {scopeLabel(s)}
                  </button>
                )
              })}
            </div>
            <p id="token-scopes-error" aria-live="polite" className={cn("text-xs font-medium text-danger-ink", !errors.scopes && "hidden")}>
              {errors.scopes}
            </p>
          </div>

          <div className="grid gap-2">
            <Label id="token-expiry-label">Expiry</Label>
            <SegmentedControl
              value={String(expiry)}
              onValueChange={(v) => setExpiry(Number(v))}
              aria-labelledby="token-expiry-label"
              className="w-fit"
              options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            />
          </div>

          {agents.length > 0 && (
            <div className="grid gap-2">
              <Label id="token-agent-label">Act as an agent</Label>
              <p id="token-agent-help" className="text-xs text-muted-foreground text-pretty">
                Optional. A token bound to an agent is recorded as that agent in the audit log,
                stops the moment you deactivate it, spends from its daily budget, and can only
                use the tools it has enabled. Leave this off for a script.
              </p>
              <SegmentedControl
                value={agentId}
                onValueChange={setAgentId}
                aria-labelledby="token-agent-label"
                aria-describedby="token-agent-help"
                className="w-fit"
                options={[{ value: NO_AGENT, label: "No agent" }, ...agents.map((a) => ({ value: a.id, label: a.name }))]}
              />

              {/* Say what the binding will actually permit, BEFORE the token is minted.
                  A bound token can do LESS than the scopes above, and finding that out
                  from a refused call in a client is the worst way to learn it. */}
              {boundAgent && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
                  {boundAgentTools.length === 0 ? (
                    <p className="text-danger-ink">
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
                          <Badge key={tool} variant="outline" className="text-2xs font-normal">
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

          {problem && (
            <p role="alert" className="text-sm text-danger-ink text-pretty">
              {problem}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              Create token
            </Button>
          </div>
        </form>
      )}
    </>
  )
}

export default ApiTokensCard
