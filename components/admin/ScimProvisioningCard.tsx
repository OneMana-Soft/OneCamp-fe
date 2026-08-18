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
import { Plus, Trash2, Loader2, Check, Network, AlertTriangle } from "@/lib/icons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { CopyableCode } from "@/components/ui/copyable-code"
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
  { value: 0, label: "No expiry" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
]

const ScimProvisioningCard = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { data, isLoading, isError, mutate } = useFetch<{ data: { tokens: ScimToken[] } }>(
    GetEndpointUrl.GetScimTokens,
  )
  const tokens = data?.data?.tokens || []

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [expiry, setExpiry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<CreatedScimToken | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Empty when this build has no backend URL configured, in which case the setup block is omitted
  // rather than shown with a broken URL an operator would paste into their IdP.
  const baseUrl = scimBaseUrl()

  const openCreate = () => {
    setName("")
    setExpiry(0)
    setCreated(null)
    setCreating(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Give the credential a name", variant: "destructive" })
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
      title: `Revoke "${t.name}"?`,
      // Names the consequence in the operator's terms. "The credential stops working" is true and
      // useless; what they need to weigh is that joiners and leavers stop being synced, which is a
      // silence rather than an error — nobody gets paged because a new hire has no account.
      description:
        "Your identity provider will stop being able to create or deactivate accounts immediately. " +
        "Joiners and leavers will need handling by hand until you connect a new credential.",
      confirmText: "Revoke",
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

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Network className="h-5 w-5 text-primary" />
            Directory provisioning (SCIM)
          </CardTitle>
          <CardDescription className="max-w-xl">
            Let Okta, Azure AD, or another identity provider create accounts for joiners and deactivate
            leavers automatically. The credential belongs to this workspace, not to you — so it keeps
            working after the person who set it up has gone.
          </CardDescription>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          New credential
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div role="status" aria-label="Loading SCIM credentials">
            <SkeletonRows rows={2} />
          </div>
        ) : isError ? (
          <ErrorState subject="SCIM credentials" onRetry={() => void mutate()} />
        ) : tokens.length === 0 ? (
          <EmptyState
            tone="accent"
            icon={Network}
            title="No directory connected"
            description="Create a credential, then paste it into your identity provider's SCIM settings."
          />
        ) : (
          <div className="space-y-3">
            {tokens.map((t) => {
              const live = isScimTokenLive(t)
              const expired = !t.revoked_at && !live
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-start justify-between gap-4 rounded-xl border border-border/60 p-4",
                    !live && "opacity-60",
                  )}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-2xs">{t.token_prefix}…</code>
                      {t.revoked_at && <Badge variant="secondary" className="text-3xs">Revoked</Badge>}
                      {/* Expired is called out separately from revoked. Both are dead, but only one of
                          them was intended, and an operator whose directory stopped syncing needs to
                          see which. */}
                      {expired && <Badge variant="secondary" className="text-3xs">Expired</Badge>}
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      {/* last_used_at is the only signal that a connected directory is alive. A SCIM
                          integration with nothing to sync looks exactly like one that has silently
                          stopped, and the difference matters. */}
                      {t.last_used_at
                        ? `Last used ${new Date(t.last_used_at).toLocaleString()}`
                        : "Never used — your identity provider has not connected yet"}
                      {t.expires_at ? ` · expires ${new Date(t.expires_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  {live && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      disabled={busyId === t.id}
                      onClick={() => handleRevoke(t)}
                      title="Revoke"
                      aria-label={`Revoke ${t.name}`}
                    >
                      {busyId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/*
          The endpoint, shown whenever a live credential exists.
          
          Separate from the creation dialog on purpose: the secret can only be offered once, but the URL
          is needed every time somebody reconfigures the IdP, and making them dig it out of documentation
          or reconstruct it from the API base is how a connection test fails for a reason that has
          nothing to do with the credential.
        */}
        {baseUrl !== "" && liveCount > 0 && (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4">
            <p className="text-xs font-medium">Point your identity provider here</p>
            <CopyableCode value={baseUrl} label="SCIM base URL" />
            <p className="text-2xs text-muted-foreground">
              Authentication is <span className="font-medium">OAuth Bearer Token</span> — paste the
              credential as the token. Map your users&apos; email address to{" "}
              <code className="rounded bg-muted px-1">userName</code>; OneCamp treats it as the account&apos;s
              identity and refuses a value that is not an email address.
            </p>
          </div>
        )}
      </CardContent>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
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
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-muted-foreground">
                  Paste this into your identity provider before closing. It cannot be retrieved
                  afterwards — you would have to create another and reconfigure the connection.
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
                  id="scim-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Okta production"
                  maxLength={120}
                />
              </div>

              <div className="grid gap-2">
                <Label id="scim-expiry-label">Expiry</Label>
                {/* Defaults to no expiry, unlike an API token. A directory connection is meant to run
                    unattended for years, and an expiry nobody is watching turns into provisioning that
                    stopped weeks ago — which surfaces as a new hire with no account rather than as an
                    alert. Offered for operators whose policy requires rotation. */}
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="scim-expiry-label">
                  {EXPIRY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setExpiry(o.value)}
                      aria-pressed={expiry === o.value}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        expiry === o.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
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
    </Card>
  )
}

export default ScimProvisioningCard
