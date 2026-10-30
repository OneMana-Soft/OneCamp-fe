"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { SettingRow, SettingsCard, SettingsCardError, SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { CodeRow } from "@/components/ui/settingsControls"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusWord } from "@/components/ui/statusWord"
import { useFetch } from "@/hooks/useFetch"
import { usePlan } from "@/hooks/usePlan"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"
import { NEUTRAL_TILE } from "@/components/admin/neutralTile"
import { AdminGet } from "@/services/endpoints/admin"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { cn } from "@/lib/utils/helpers/cn"
import { Plus, Trash2, Loader2, Network } from "@/lib/icons"
import { shortDate, shortDateTime } from "@/lib/utils/date/shortDate"
import {
  ScimToken,
  CreatedScimToken,
  createScimToken,
  revokeScimToken,
  scimBaseUrl,
  isScimTokenLive,
} from "@/services/scimTokenService"

/**
 * Directory provisioning (SCIM 2.0).
 *
 * Deliberately shaped like ApiTokensCard, because to an operator it IS the same job — mint a bearer
 * credential, paste it somewhere, revoke it later — and inventing a second visual language for that
 * would make two similar tasks feel unrelated.
 *
 * What differs is stated on the card rather than left implicit: this credential belongs to the
 * workspace, not to whoever created it. That is not trivia. An api_token stops working when its owner
 * is deactivated, and if a SCIM credential behaved that way, the day the directory offboarded the
 * administrator who connected it every later provisioning call would fail — new joiners would silently
 * stop getting accounts, with the integration still showing as configured.
 *
 * Design v3 (admin A8): one card. The endpoint is a code row with copy; each credential is a row with
 * a neutral glyph tile; a new token is shown once in a reveal card with a sun ring ("Copy it now, it
 * won't be shown again"). On the free plan PlanLockedNotice takes the controls' place inside the card;
 * credentials already made stay listed and revocable, so none is stranded.
 */

const EXPIRY_OPTIONS = [
  { value: "0", label: "No expiry" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const

const ScimProvisioningCard = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: { tokens: ScimToken[] } }>(
    AdminGet.GetScimTokens,
  )
  const tokens = data?.data?.tokens || []

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  // Said under the field it is about, not in a toast that leaves with it.
  const [nameError, setNameError] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const [expiry, setExpiry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CreatedScimToken | null>(null)
  const plan = usePlan()
  const scimLocked = plan.isLocked("scim")
  const [busyId, setBusyId] = useState<string | null>(null)

  // Empty when this build has no backend URL configured, in which case the endpoint is omitted
  // rather than shown with a broken URL an operator would paste into their IdP.
  const baseUrl = scimBaseUrl()

  const openCreate = () => {
    setName("")
    setNameError("")
    setExpiry(0)
    setCreated(null)
    setCreating(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameError("Give the credential a name, so you can tell which identity provider it belongs to.")
      nameRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const res = await createScimToken({ name: name.trim(), expires_in_days: expiry })
      setCreated(res)
      mutate()
    } catch {
      // surfaced by the axios interceptor
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = (t: ScimToken) => {
    confirm({
      title: `Revoke the SCIM token "${t.name}"?`,
      // Names the consequence in the operator's terms: joiners and leavers stop being synced, which
      // is a silence rather than an error.
      description:
        "Your identity provider will stop being able to create or deactivate accounts immediately. " +
        "Joiners and leavers will need handling by hand until you connect a new credential.",
      confirmText: "Revoke token",
      destructive: true,
      onConfirm: async () => {
        setBusyId(t.id)
        try {
          await revokeScimToken(t.id)
          toast({ title: "SCIM credential revoked" })
          mutate()
        } catch {
          // surfaced
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  const liveCount = tokens.filter(isScimTokenLive).length

  let rows: React.ReactNode
  if (isLoading) {
    // The list's own rows stand in, so nothing moves when it arrives.
    rows = (
      <ul role="status" aria-label="Loading SCIM credentials" className="set-rows">
        {[0, 1].map((i) => (
          <li key={i} aria-hidden="true" className="set-row flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn("h-3.5", i ? "w-28" : "w-40")} />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
          </li>
        ))}
      </ul>
    )
  } else if (isError) {
    rows = <SettingsCardError what="the SCIM credentials" onRetry={() => void mutate()} />
  } else if (tokens.length === 0) {
    rows = scimLocked ? null : (
      <div data-scim-empty="" className="set-row flex items-center gap-3">
        <span aria-hidden="true" className={NEUTRAL_TILE}>
          <Network className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">No directory connected</p>
          <p className="text-xs text-muted-foreground text-pretty">Create a credential, then paste it into your identity provider&apos;s SCIM settings.</p>
        </div>
      </div>
    )
  } else {
    rows = (
      <ul aria-label="SCIM credentials" className="set-rows">
        {tokens.map((t) => {
          const live = isScimTokenLive(t)
          const expired = !t.revoked_at && !live
          return (
            <li key={t.id} className={cn("set-row flex items-center justify-between gap-3", !live && "opacity-60")}>
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className={NEUTRAL_TILE}>
                  <Network className="size-4" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                    <code className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">{t.token_prefix}…</code>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {/* Expired is said apart from revoked: only one of them was intended. */}
                    {t.revoked_at ? (
                      <>
                        <StatusWord>Revoked</StatusWord>
                        <span aria-hidden="true">·</span>
                      </>
                    ) : expired ? (
                      <>
                        <StatusWord tone="warning">Expired</StatusWord>
                        <span aria-hidden="true">·</span>
                      </>
                    ) : null}
                    {/* last_used_at is the only signal that a connected directory is alive. */}
                    <span>
                      {t.last_used_at
                        ? `Last used ${shortDateTime(new Date(t.last_used_at))}`
                        : "Never used: your identity provider has not connected yet"}
                    </span>
                    {t.expires_at && <span>· Expires {shortDate(new Date(t.expires_at))}</span>}
                  </p>
                </div>
              </div>
              {live && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-danger-ink"
                  disabled={busyId === t.id}
                  onClick={() => handleRevoke(t)}
                  title="Revoke"
                  aria-label={`Revoke ${t.name}`}
                >
                  {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <SettingsSection
      id="security-scim"
      title="Directory provisioning (SCIM)"
      description="Okta, Azure AD or another identity provider creates accounts for joiners and deactivates leavers. The credential belongs to the workspace, so it outlives whoever set it up."
      action={
        !scimLocked ? (
          <Button size="sm" onClick={openCreate} className={cn(sectionActionClass, "gap-1.5")}>
            <Plus />
            New credential
          </Button>
        ) : undefined
      }
    >
      <SettingsCard>
        {scimLocked && (
          <div className="p-3">
            <PlanLockedNotice what="SCIM provisioning" upgradeUrl={plan.upgradeUrl} />
          </div>
        )}
        {/*
          The endpoint, shown whenever a live credential exists. Separate from the creation dialog on
          purpose: the secret can only be offered once, but the URL is needed every time somebody
          reconfigures the IdP.
        */}
        {!scimLocked && baseUrl !== "" && liveCount > 0 && (
          <SettingRow
            layout="stacked"
            label="Point your identity provider here"
            description="Authentication is OAuth Bearer Token: paste the credential as the token, and map email to userName."
            controlId="scim-endpoint"
          >
            <CodeRow value={baseUrl} label="SCIM base URL" />
          </SettingRow>
        )}
        {rows}
      </SettingsCard>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{created ? "Credential created" : "New SCIM credential"}</DialogTitle>
            <DialogDescription>
              {created
                ? "Paste it into your identity provider before closing."
                : "Name it so you can tell which identity provider it belongs to."}
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-3">
              {/* Shown once: only a hash is stored. Losing it means minting another and
                  reconfiguring the IdP, so it says so where the decision is made. */}
              <div data-token-reveal="" className="cfg-reveal-card space-y-2">
                <p className="text-xs font-medium text-camp-sun-ink">Copy it now, it won&apos;t be shown again</p>
                <CodeRow value={created.plaintext} label="SCIM credential" ellipsis="wrap" />
              </div>
              {baseUrl !== "" && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">SCIM base URL</p>
                  <CodeRow value={baseUrl} label="SCIM base URL" />
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setCreating(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="scim-name">Name</Label>
                <Input
                  ref={nameRef}
                  id="scim-name"
                  name="scim-name"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setNameError("")
                  }}
                  placeholder="Okta production…"
                  maxLength={120}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? "scim-name-error" : undefined}
                />
                {nameError && (
                  <p id="scim-name-error" role="alert" className="text-xs text-danger-ink">
                    {nameError}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label id="scim-expiry-label">Expiry</Label>
                {/* Defaults to no expiry: a directory connection runs unattended for years, and an expiry
                    nobody watches turns into provisioning that stopped weeks ago. */}
                <SegmentedControl
                  aria-labelledby="scim-expiry-label"
                  value={String(expiry) as (typeof EXPIRY_OPTIONS)[number]["value"]}
                  onValueChange={(v) => setExpiry(Number(v))}
                  options={EXPIRY_OPTIONS}
                  className="w-fit"
                />
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} busy={saving}>
                  Create credential
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}

export default ScimProvisioningCard
