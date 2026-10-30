"use client"

import { useRef, useState, type MutableRefObject } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Field } from "@/components/ui/field"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tile } from "@/components/ui/graphics/Tile"
import { SettingsList, SettingsRowsSkeleton } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { AdminGet } from "@/services/endpoints/admin"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { cn } from "@/lib/utils/helpers/cn"
import { Key, MoreHorizontal, Plus, Sparkles } from "@/lib/icons"
import { CopyableCode } from "@/components/ui/copyable-code"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { mcpClientConfig, mcpEndpointUrl } from "@/lib/utils/mcpEndpoint"
import type { CampHue } from "@/lib/campHue"
import { SpotKey } from "@/components/admin/apiTokenSpot"
import { RevealCard } from "@/components/admin/revealCard"
import { ScopeChecklist, tokenDates, useOneTimeSecret } from "@/components/tokens/tokenParts"
import {
  ApiToken,
  parseScopes,
  scopeLabel,
  createApiToken,
  revokeApiToken,
} from "@/services/apiTokenService"
import { Agent, parseEnabledTools, toolLabel } from "@/services/agentService"

// A token's lifetime (design v3, admin S7): 30 d · 90 d · 1 y · Never.
const EXPIRY_OPTIONS = [
  { value: "30", label: "30 d", title: "30 days" },
  { value: "90", label: "90 d", title: "90 days" },
  { value: "365", label: "1 y", title: "1 year" },
  { value: "0", label: "Never", title: "No expiry" },
] as const

/** The picker value meaning "a plain integration credential, bound to no agent". */
const NO_AGENT = ""

/** The section's hue (lib/settingsSections), for its dialog's tile and its spot. */
const HUE: CampHue = "berry"

/** How many scope chips a row shows before "+n". */
const SCOPES_SHOWN = 3

/**
 * The person's API tokens (design v3, admin S7): rows of 52px in one card, a
 * key in a sunken tile, the name, its dates, up to three scope chips and a ⋯
 * menu whose Revoke asks first. The page (app/app/settings/api-tokens) opens
 * the new-token dialog from its header's "New token"; an empty list offers
 * it in the body too, under the key spot.
 */
const ApiTokensCard = ({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (open: boolean) => void }) => {
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: ApiToken[] }>(AdminGet.GetApiTokens)
  // The agents endpoint already returns only agents the caller may manage, so
  // every option offered here is one the server will accept.
  const { data: agentsData } = useFetch<{ data: Agent[] }>(GetEndpointUrl.GetAgents)
  const tokens = data?.data || []
  const agentsById = new Map((agentsData?.data || []).map((a) => [a.id, a]))
  const [busyId, setBusyId] = useState<string | null>(null)
  // The reveal step's guard: closing before the token was copied asks first.
  const closeGuard = useRef<() => boolean>(() => true)

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
          toast({ title: "Token revoked", tone: "success" })
          mutate()
        } catch (e) {
          toast({
            title: `Couldn't revoke "${t.name}"`,
            description: apiErrorMessage(e, "Try again in a moment."),
            variant: "destructive",
          })
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const requestClose = (open: boolean) => {
    if (open) return onCreatingChange(true)
    if (closeGuard.current()) onCreatingChange(false)
  }

  return (
    <>
      {isLoading ? (
        <div role="status" aria-label="Loading your API tokens">
          <SettingsList>
            <SettingsRowsSkeleton rows={3} control="button" />
          </SettingsList>
        </div>
      ) : isError ? (
        // The list is the whole page, so its failure is the page's: ErrorState.
        <ErrorState subject="your API tokens" onRetry={() => void mutate()} />
      ) : tokens.length === 0 ? (
        <SettingsList>
          <div data-tokens-empty="" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <SpotKey hue={HUE} />
            <div className="space-y-1">
              <h3 className="text-heading text-foreground">No tokens yet</h3>
              <p className="max-w-[45ch] text-sm text-muted-foreground text-pretty">
                Tokens let scripts act as you with a member&apos;s powers, never an admin&apos;s, limited to the scopes you pick.
              </p>
            </div>
            {/* The header's New token is the page's one primary (QA SH-12). */}
            <Button variant="secondary" size="sm" onClick={() => onCreatingChange(true)}>
              <Plus aria-hidden="true" />
              New token
            </Button>
          </div>
        </SettingsList>
      ) : (
        <SettingsList>
          <ul aria-label="Your API tokens" className="you-token-rows">
            {tokens.map((t) => {
              const revoked = !!t.revoked_at
              const scopes = parseScopes(t)
              return (
                <li key={t.id} data-token-row="" data-revoked={revoked ? "true" : undefined} className="you-token-row">
                  <span aria-hidden="true" className="you-key-tile">
                    <Key className="size-3.5" />
                  </span>
                  <div className={cn("min-w-0 flex-1", revoked && "opacity-60")}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <code className="shrink-0 font-mono text-2xs text-ink-3" translate="no">
                        {t.token_prefix}…
                      </code>
                      {revoked && <span className="shrink-0 text-2xs font-medium text-ink-3">Revoked</span>}
                    </div>
                    <p className="you-token-dates">{tokenDates(t)}</p>
                  </div>
                  <div className="hidden min-w-0 shrink items-center gap-1 sm:flex">
                    {/* Which identity this credential acts as: it changes who the audit
                        log names and whether deactivating an agent stops it. */}
                    {t.agent_id && (
                      <span className="you-scope">
                        <Sparkles className="size-3 text-ink-3" aria-hidden="true" />
                        {agentsById.get(t.agent_id)?.name || "Agent"}
                      </span>
                    )}
                    {scopes.slice(0, SCOPES_SHOWN).map((s) => (
                      <span key={s} className="you-scope" title={scopeLabel(s)}>
                        {s}
                      </span>
                    ))}
                    {scopes.length > SCOPES_SHOWN && (
                      <span className="you-scope" title={scopes.slice(SCOPES_SHOWN).map(scopeLabel).join(", ")}>
                        +{scopes.length - SCOPES_SHOWN}
                      </span>
                    )}
                  </div>
                  {!revoked ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Actions for ${t.name}`} disabled={busyId === t.id}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onSelect={() => handleRevoke(t)}>
                          Revoke…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="size-8 shrink-0" aria-hidden="true" />
                  )}
                </li>
              )
            })}
          </ul>
        </SettingsList>
      )}

      <Dialog open={creating} onOpenChange={requestClose}>
        <DialogContent className="max-w-lg">
          {/* Mounted only while open, so every new token starts from a clean form. */}
          {creating && (
            <NewTokenForm
              agents={(agentsData?.data || []).filter((a) => a.is_active)}
              onCreated={() => void mutate()}
              onDone={() => onCreatingChange(false)}
              closeGuard={closeGuard}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The new-token dialog's body: the form, then the token itself, shown once. */
function NewTokenForm({
  agents,
  onCreated,
  onDone,
  closeGuard,
}: {
  agents: Agent[]
  onCreated: () => void
  onDone: () => void
  closeGuard: MutableRefObject<() => boolean>
}) {
  const confirm = useConfirm()
  const { data: scopesData } = useFetch<{ data: string[] }>(AdminGet.GetApiTokenScopes)
  const availableScopes = scopesData?.data || []
  // Only ACTIVE agents are passed in: binding to a deactivated one is refused by the
  // server, since the credential would be rejected on every call.
  const agentsById = new Map(agents.map((a) => [a.id, a]))

  const [name, setName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [expiry, setExpiry] = useState("90")
  const [agentId, setAgentId] = useState<string>(NO_AGENT)
  const [saving, setSaving] = useState(false)
  // The token once it's made: shown once, and closing before it was copied asks.
  const once = useOneTimeSecret("You'd have to make a new one.")
  const created = once.secret
  // What is missing, said under the field it is about; and a refusal from the
  // server, said in the dialog.
  const [errors, setErrors] = useState<{ name?: string; scopes?: string }>({})
  const [problem, setProblem] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const scopesRef = useRef<HTMLDivElement>(null)

  // Closing while the token is on screen and not yet copied asks first: it
  // can't be shown again.
  const askBeforeClosing = () => once.mayClose(onDone)
  closeGuard.current = askBeforeClosing

  const boundAgent = agentId ? agentsById.get(agentId) : undefined
  const boundAgentTools = boundAgent ? parseEnabledTools(boundAgent) : []

  const toggleScope = (s: string, on: boolean) => {
    setErrors((e) => ({ ...e, scopes: undefined }))
    setSelectedScopes((prev) => {
      const next = new Set(prev)
      if (on) next.add(s)
      else next.delete(s)
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
        expires_in_days: Number(expiry),
        ...(agentId ? { agent_id: agentId } : {}),
      })
      once.setSecret(res.plaintext)
      onCreated()
    } catch (e) {
      setProblem(`Couldn't create the token. ${apiErrorMessage(e, "Try again in a moment.")}`)
    } finally {
      setSaving(false)
    }
  }

  // Empty when this build has no backend URL configured: the MCP block is then omitted.
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
        <DialogDescription>{created ? "Your token is ready." : "Name it, choose how long it lasts and what it can do."}</DialogDescription>
      </DialogHeader>

      {created ? (
        <div className="space-y-4">
          <RevealCard secret={created} what="token" copied={once.copied} copyFailed={once.copyFailed} onCopy={() => void once.copySecret()} />

          {/*
            THE MCP CONFIG, WITH THE REAL TOKEN ALREADY IN IT. This is the only moment it
            can be offered: only a hash is stored, so after this dialog closes nothing can
            produce the credential again. It does NOT claim the surface is on: that is an
            admin setting this user may not see, so the note states the dependency.
          */}
          {mcpEndpoint && (
            <details className="you-details">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                Use this token with any MCP client (Open WebUI, goose, Cursor, Claude, …)
              </summary>
              <div className="space-y-2 px-3 pb-3">
                <CopyableCode value={mcpClientConfig(created)} label="MCP client config" />
                <p className="text-xs text-muted-foreground">
                  The token above is already filled in. External agent access also has to be turned on by an admin, under{" "}
                  <span className="font-medium">Admin, AI &amp; agents, External agent access</span>. Until it is, the
                  endpoint refuses every call, whatever this token&apos;s scopes.
                </p>
              </div>
            </details>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (askBeforeClosing()) onDone()
              }}
            >
              Done
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
            <Label id="token-expiry-label">Expiry</Label>
            <SegmentedControl
              value={expiry}
              onValueChange={setExpiry}
              aria-labelledby="token-expiry-label"
              className="w-fit"
              options={EXPIRY_OPTIONS}
            />
          </div>

          <div className="grid gap-2">
            <Label id="token-scopes-label">Scopes</Label>
            <ScopeChecklist
              available={availableScopes}
              selected={selectedScopes}
              onToggle={toggleScope}
              labelledBy="token-scopes-label"
              describedBy={errors.scopes ? "token-scopes-error" : undefined}
              idPrefix="scope"
              groupRef={scopesRef}
            />
            <p id="token-scopes-error" aria-live="polite" className={cn("text-xs font-medium text-danger-ink", !errors.scopes && "hidden")}>
              {errors.scopes}
            </p>
          </div>

          {agents.length > 0 && (
            <div className="grid gap-2">
              <Label id="token-agent-label">Act as an agent</Label>
              <p id="token-agent-help" className="text-xs text-muted-foreground text-pretty">
                Optional. A token bound to an agent is recorded as that agent in the audit log, stops the moment you
                deactivate it, spends from its daily budget, and can only use the tools it has enabled. Leave this off
                for a script.
              </p>
              <SegmentedControl
                value={agentId}
                onValueChange={setAgentId}
                aria-labelledby="token-agent-label"
                aria-describedby="token-agent-help"
                className="w-fit"
                options={[{ value: NO_AGENT, label: "No agent" }, ...agents.map((a) => ({ value: a.id, label: a.name }))]}
              />

              {/* What the binding will permit, BEFORE the token is minted: a bound
                  token can do LESS than the scopes above. */}
              {boundAgent && (
                <div className="you-note text-xs">
                  {boundAgentTools.length === 0 ? (
                    <p className="text-danger-ink">
                      {boundAgent.name} has no tools enabled, so this token will not be able to do anything. Enable tools
                      on the agent first.
                    </p>
                  ) : (
                    <div>
                      <p className="mb-1.5 text-muted-foreground">
                        Limited to {boundAgent.name}&apos;s {boundAgentTools.length} enabled{" "}
                        {boundAgentTools.length === 1 ? "tool" : "tools"}, whatever you grant above:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {boundAgentTools.map((tool) => (
                          <span key={tool} className="you-scope">
                            {toolLabel(tool)}
                          </span>
                        ))}
                      </div>
                    </div>
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
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" busy={saving}>
              Create token
            </Button>
          </div>
        </form>
      )}
    </>
  )
}

export default ApiTokensCard
