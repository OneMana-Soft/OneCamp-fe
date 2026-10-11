"use client"

import { useRef, useState, type MutableRefObject } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Field } from "@/components/ui/field"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tile } from "@/components/ui/graphics/Tile"
import { SettingsList, SettingsRowsSkeleton } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { useCopy } from "@/components/ui/settingsControls"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { cn } from "@/lib/utils/helpers/cn"
import { Loader2, Check, Copy, Key, MoreHorizontal, Plus, Sparkles } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate } from "@/lib/utils/date/shortDate"
import type { CampHue } from "@/lib/campHue"
import { SpotKey } from "@/components/admin/apiTokenSpot"
import {
  ApiToken,
  CreatedToken,
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

const when = (iso: string) => shortDate(new Date(iso))

/** What a scope is about, for grouping the checkboxes: "tasks:read" is Tasks. */
const GROUP_NAMES: Record<string, string> = {
  tasks: "Tasks",
  projects: "Projects",
  docs: "Documents",
  messages: "Messages",
  calendar: "Calendar",
  tables: "Tables",
  data_sources: "Data sources",
  attention: "Attention",
  search: "Search",
}

function groupScopes(scopes: string[]): Array<{ name: string; scopes: string[] }> {
  const groups = new Map<string, string[]>()
  for (const s of scopes) {
    const key = s.split(":")[0]
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return [...groups].map(([key, list]) => ({ name: GROUP_NAMES[key] ?? key, scopes: list }))
}

/** "Created 3 Oct · last used 9 Oct · expires 3 Jan" */
function tokenDates(t: ApiToken) {
  return [
    `Created ${when(t.created_at)}`,
    t.last_used_at ? `last used ${when(t.last_used_at)}` : "never used",
    t.expires_at ? `expires ${when(t.expires_at)}` : "no expiry",
  ].join(" · ")
}

/**
 * The person's API tokens (design v3, admin S7): rows of 52px in one card, a
 * key in a sunken tile, the name, its dates, up to three scope chips and a ⋯
 * menu whose Revoke asks first. The page (app/app/settings/api-tokens) opens
 * the new-token dialog from its header's "New token"; an empty list offers
 * it in the body too, under the key spot.
 */
const ApiTokensCard = ({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (open: boolean) => void }) => {
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: ApiToken[] }>(GetEndpointUrl.GetApiTokens)
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
            description: apiErrorMessage(e, "Check your connection and try again."),
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
                Tokens let scripts act as you, limited to the scopes you pick.
              </p>
            </div>
            <Button size="sm" onClick={() => onCreatingChange(true)}>
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

/**
 * The token, shown once: mono on --sunken inside a 1px sun ring, a 32px copy
 * button that morphs to a moss check, and the warning in sun ink. Enters at
 * scale .98 and fades in over 220ms.
 */
function RevealCard({ secret, copied, onCopy }: { secret: string; copied: boolean; onCopy: () => void }) {
  return (
    <div data-token-reveal="" className="you-reveal-card space-y-2">
      <div className="you-reveal-token">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground" translate="no">
          {secret}
        </code>
        <button
          type="button"
          onClick={onCopy}
          data-copy-state={copied ? "copied" : "idle"}
          aria-label={copied ? "Token copied" : "Copy token"}
          className="you-reveal-copy"
        >
          <Copy className={cn("col-start-1 row-start-1 size-4 transition-opacity duration-150", copied ? "opacity-0" : "opacity-100")} aria-hidden="true" />
          <Check
            className={cn(
              "col-start-1 row-start-1 size-4 text-success-ink transition-[opacity,transform] duration-[220ms] ease-[var(--ease-spring)]",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className="text-xs font-medium text-warning-ink">Copy it now. It won&apos;t be shown again.</p>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Token copied" : ""}
      </span>
    </div>
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
  const { data: scopesData } = useFetch<{ data: string[] }>(GetEndpointUrl.GetApiTokenScopes)
  const availableScopes = scopesData?.data || []
  // Only ACTIVE agents are passed in: binding to a deactivated one is refused by the
  // server, since the credential would be rejected on every call.
  const agentsById = new Map(agents.map((a) => [a.id, a]))

  const [name, setName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [expiry, setExpiry] = useState("90")
  const [agentId, setAgentId] = useState<string>(NO_AGENT)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CreatedToken | null>(null)
  const { state: copyState, copy } = useCopy()
  const [everCopied, setEverCopied] = useState(false)
  // What is missing, said under the field it is about; and a refusal from the
  // server, said in the dialog.
  const [errors, setErrors] = useState<{ name?: string; scopes?: string }>({})
  const [problem, setProblem] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const scopesRef = useRef<HTMLDivElement>(null)

  // Closing while the token is on screen and not yet copied asks first: it
  // can't be shown again.
  const askBeforeClosing = () => {
    if (!created || everCopied) return true
    confirm({
      title: "Close without copying?",
      description: "The token can't be shown again. You'd have to make a new one.",
      confirmText: "Close without copying",
      cancelText: "Go back",
      destructive: true,
      onConfirm: onDone,
    })
    return false
  }
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
    await copy(created.plaintext)
    setEverCopied(true)
  }

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
          <RevealCard secret={created.plaintext} copied={copyState === "copied" || (everCopied && copyState !== "failed")} onCopy={() => void copySecret()} />
          {copyState === "failed" && <p role="alert" className="text-xs text-danger-ink">Couldn&apos;t copy. Select the token and copy it yourself.</p>}


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
            <div
              ref={scopesRef}
              role="group"
              aria-labelledby="token-scopes-label"
              aria-describedby={errors.scopes ? "token-scopes-error" : undefined}
              data-scope-groups=""
              className="you-scope-groups"
            >
              {groupScopes(availableScopes).map((g) => (
                <fieldset key={g.name} className="space-y-1.5">
                  <legend className="mb-1 text-2xs font-medium text-ink-3">{g.name}</legend>
                  {g.scopes.map((s) => {
                    const id = `scope-${s.replace(/[^\w-]/g, "-")}`
                    return (
                      <div key={s} className="flex items-center gap-2">
                        <Checkbox id={id} checked={selectedScopes.has(s)} onCheckedChange={(v) => toggleScope(s, v === true)} />
                        <label htmlFor={id} className="text-sm">
                          {scopeLabel(s)}
                        </label>
                      </div>
                    )
                  })}
                </fieldset>
              ))}
            </div>
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
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Create token
            </Button>
          </div>
        </form>
      )}
    </>
  )
}

export default ApiTokensCard
