"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusWord } from "@/components/ui/statusWord"
import { useFetch } from "@/hooks/useFetch"
import { usePlan } from "@/hooks/usePlan"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"
import { GetEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { cn } from "@/lib/utils/helpers/cn"
import { Plus, Trash2, Loader2, Check, Network, AlertTriangle } from "@/lib/icons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { CopyableCode } from "@/components/ui/copyable-code"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
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
 */

const EXPIRY_OPTIONS = [
  { value: "0", label: "No expiry" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const

/** The credentials' list: hairline rows, the admin page's one list. */
const LIST = "divide-y divide-border rounded-lg border border-border"

const ScimProvisioningCard = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: { tokens: ScimToken[] } }>(
    GetEndpointUrl.GetScimTokens,
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
  // On the free plan a new credential is refused; existing ones stay listed and
  // revocable, so a credential is never stranded.
  const plan = usePlan()
  const scimLocked = plan.isLocked("scim")
  const [busyId, setBusyId] = useState<string | null>(null)

  // Empty when this build has no backend URL configured, in which case the setup block is omitted
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
      // Names the consequence in the operator's terms. "The credential stops working" is true and
      // useless; what they need to weigh is that joiners and leavers stop being synced, which is a
      // silence rather than an error — nobody gets paged because a new hire has no account.
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

  // A flat section like every other tab's. It was a bordered card holding a
  // notice box, a card per credential and a setup box with a code box inside;
  // now the notice is the one box, the credentials are rows of one list and
  // the setup is a section of its own.
  return (
    <SettingsSection
      title="Directory provisioning (SCIM)"
      description="Let Okta, Azure AD, or another identity provider create accounts for joiners and deactivate leavers automatically. The credential belongs to this workspace, not to you, so it keeps working after the person who set it up has gone."
      action={
        !scimLocked ? (
          <Button size="sm" onClick={openCreate} className={cn(sectionActionClass, "gap-1.5")}>
            <Plus />
            New credential
          </Button>
        ) : undefined
      }
    >
      {scimLocked && <PlanLockedNotice what="SCIM provisioning" upgradeUrl={plan.upgradeUrl} />}
      {isLoading ? (
        // The list's own rows stand in, so nothing moves when it arrives.
        <ul role="status" aria-label="Loading SCIM credentials" className={LIST}>
          {[0, 1].map((i) => (
            <li key={i} aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={cn("h-3.5", i ? "w-28" : "w-40")} />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
            </li>
          ))}
        </ul>
      ) : isError ? (
        <ErrorState compact subject="SCIM credentials" onRetry={() => void mutate()} />
      ) : tokens.length === 0 ? (
        <EmptyState
          icon={Network}
          hue={ADMIN_GROUP_HUE.workspace}
          title="No directory connected"
          description="Create a credential, then paste it into your identity provider's SCIM settings."
        />
      ) : (
        // Rows in one list, as the app draws a list: they were a bordered card each.
        <ul className={LIST}>
          {tokens.map((t) => {
            const live = isScimTokenLive(t)
            const expired = !t.revoked_at && !live
            return (
              <li key={t.id} className={cn("flex items-center justify-between gap-3 px-4 py-3", !live && "opacity-60")}>
                <div className="flex min-w-0 items-center gap-3">
                  <Tile hue={ADMIN_GROUP_HUE.workspace} size="md">
                    <Network />
                  </Tile>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-2xs">{t.token_prefix}…</code>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      {/* Expired is said apart from revoked. Both are dead, but only one of
                          them was intended, and an operator whose directory stopped syncing
                          needs to see which. */}
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
                      {/* last_used_at is the only signal that a connected directory is alive. A SCIM
                          integration with nothing to sync looks exactly like one that has silently
                          stopped, and the difference matters. */}
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
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink"
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
      )}

      {/*
        The endpoint, shown whenever a live credential exists.

        Separate from the creation dialog on purpose: the secret can only be offered once, but the URL
        is needed every time somebody reconfigures the IdP, and making them dig it out of documentation
        or reconstruct it from the API base is how a connection test fails for a reason that has
        nothing to do with the credential.
      */}
      {baseUrl !== "" && liveCount > 0 && (
        <SettingsSection level={3} title="Point your identity provider here" className="pt-3">
          <CopyableCode value={baseUrl} label="SCIM base URL" />
          <p className="max-w-[65ch] text-xs text-muted-foreground text-pretty">
            Authentication is <span className="font-medium">OAuth Bearer Token</span>: paste the credential as the
            token. Map your users&apos; email address to <code className="rounded-sm bg-muted px-1">userName</code>;
            OneCamp treats it as the account&apos;s identity and refuses a value that is not an email address.
          </p>
        </SettingsSection>
      )}

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {/* The workspace group's hue, as the admin menu draws Security; the
                  accent is for the button that creates it. */}
              <Tile hue={ADMIN_GROUP_HUE.workspace} size="sm">
                <Network />
              </Tile>
              {created ? "Credential created" : "New SCIM credential"}
            </DialogTitle>
            <DialogDescription>
              {created
                ? "Copy it now. Only a hash is stored, so this is the only time it can be shown."
                : "Name it so you can tell which identity provider it belongs to."}
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="space-y-3">
              <CopyableCode value={created.plaintext} label="SCIM credential" />

              {baseUrl !== "" && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">SCIM base URL</p>
                  <CopyableCode value={baseUrl} label="SCIM base URL" />
                </div>
              )}

              {/* The irreversibility, stated where the decision is made rather than in a tooltip
                  somewhere. Losing this means minting another and reconfiguring the IdP — recoverable,
                  but only by doing the work again, and the person who would do it is reading this now. */}
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" />
                <p className="text-muted-foreground">
                  Paste this into your identity provider before closing. It cannot be retrieved
                  afterwards: you would have to create another and reconfigure the connection.
                </p>
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
                  <p id="scim-name-error" role="alert" className="text-sm text-danger-ink">
                    {nameError}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label id="scim-expiry-label">Expiry</Label>
                {/* Defaults to no expiry, unlike an API token. A directory connection is meant to run
                    unattended for years, and an expiry nobody is watching turns into provisioning that
                    stopped weeks ago — which surfaces as a new hire with no account rather than as an
                    alert. Offered for operators whose policy requires rotation. One choice of three,
                    in the app's one segmented picker. */}
                <SegmentedControl
                  aria-labelledby="scim-expiry-label"
                  value={String(expiry) as (typeof EXPIRY_OPTIONS)[number]["value"]}
                  onValueChange={(v) => setExpiry(Number(v))}
                  options={EXPIRY_OPTIONS}
                  className="w-fit"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Create credential
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}

export default ScimProvisioningCard
