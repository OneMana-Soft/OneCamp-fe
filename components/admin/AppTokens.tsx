"use client"

import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field } from "@/components/ui/field"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { RowMenu } from "@/components/admin/connectParts"
import { RevealCard } from "@/components/admin/revealCard"
import { ScopeChecklist, tokenDates, useOneTimeSecret } from "@/components/tokens/tokenParts"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { Key, Loader2, Plus, RefreshCw, Trash2 } from "@/lib/icons"
import { scopeLabel } from "@/services/apiTokenService"
import {
  APP_TOKEN_LIFE,
  MAX_APP_TOKENS,
  mintAppToken,
  revokeAppToken,
  rotateAppToken,
  type AppIdentity,
  type AppToken,
} from "@/components/admin/appAccess"

/** How many scope chips a token's row shows before "+n". */
const SCOPES_SHOWN = 3

/**
 * An app's tokens, in its access sheet (Admin › Apps): each acts as the app's
 * own user with some of its scopes, is shown once when made or rotated, and is
 * revoked alone. An app holds up to MAX_APP_TOKENS.
 */
export function AppTokens({ appId, identity, tokens, onChanged }: { appId: string; identity: AppIdentity; tokens: AppToken[]; onChanged: () => void }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [making, setMaking] = useState(false)
  const [rotated, setRotated] = useState<{ name: string; secret: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const full = tokens.length >= MAX_APP_TOKENS
  const why = !identity.enabled
    ? `Turn ${identity.name} on to make it a token.`
    : identity.scopes.length === 0
      ? "Choose what it may do first: a token carries some of its scopes."
      : full
        ? `It has ${MAX_APP_TOKENS} tokens, the most an app holds. Revoke one it no longer uses.`
        : ""

  const rotate = (t: AppToken) =>
    confirm({
      title: `Rotate the token "${t.name}"?`,
      description: "It gets a new secret now and the old one stops working at once. To swap without a gap, make a second token, move to it, then revoke this one.",
      confirmText: "Rotate token",
      onConfirm: async () => {
        setBusy(t.id)
        try {
          const secret = await rotateAppToken(appId, t.id)
          setRotated({ name: t.name, secret })
          onChanged()
        } catch (e) {
          toast({ title: `Couldn't rotate "${t.name}"`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
          setBusy(null)
        }
      },
    })

  const revoke = (t: AppToken) =>
    confirm({
      title: `Revoke the token "${t.name}"?`,
      description: `Whatever uses it stops working now. This can't be undone, but you can make ${identity.name} a new token.`,
      confirmText: "Revoke token",
      destructive: true,
      onConfirm: async () => {
        setBusy(t.id)
        try {
          await revokeAppToken(appId, t.id)
          toast({ title: "Token revoked", tone: "success" })
          onChanged()
        } catch (e) {
          toast({ title: `Couldn't revoke "${t.name}"`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
          setBusy(null)
        }
      },
    })

  return (
    <SettingsSection
      level={3}
      title="Tokens"
      description={`Each acts as the app's own user with some of its scopes. An app holds up to ${MAX_APP_TOKENS}: one in use, one being rotated in, and one more.`}
      action={
        <Button type="button" size="sm" variant="secondary" className={sectionActionClass} disabled={!!why} title={why || undefined} onClick={() => setMaking(true)}>
          <Plus aria-hidden="true" />
          New token
        </Button>
      }
    >
      {why && (
        <p data-token-why="" className="mb-2 text-xs text-muted-foreground text-pretty">
          {why}
        </p>
      )}
      {tokens.length === 0 ? (
        <p data-tokens-empty="" className="rounded-lg bg-muted/60 px-3 py-3 text-sm text-muted-foreground text-pretty">
          No tokens yet. Make one for each place {identity.name} runs, so each can be revoked alone.
        </p>
      ) : (
        <ul aria-label={`Tokens for ${identity.name}`} className="set-card">
          {tokens.map((t) => (
            <li key={t.id} data-app-token="" className="you-token-row">
              <span aria-hidden="true" className="you-key-tile">
                <Key className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <code className="shrink-0 font-mono text-2xs text-ink-3" translate="no">
                    {t.token_prefix}…
                  </code>
                </div>
                <p className="you-token-dates">{tokenDates(t)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.scopes.slice(0, SCOPES_SHOWN).map((s) => (
                    <span key={s} className="you-scope" title={scopeLabel(s)}>
                      {s}
                    </span>
                  ))}
                  {t.scopes.length > SCOPES_SHOWN && (
                    <span className="you-scope" title={t.scopes.slice(SCOPES_SHOWN).map(scopeLabel).join(", ")}>
                      +{t.scopes.length - SCOPES_SHOWN}
                    </span>
                  )}
                </div>
              </div>
              {busy === t.id ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Working…" />
              ) : (
                <RowMenu
                  label={`Actions for ${t.name}`}
                  items={[
                    { label: "Rotate…", icon: RefreshCw, onSelect: () => rotate(t) },
                    { label: "Revoke…", icon: Trash2, destructive: true, separated: true, onSelect: () => revoke(t) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {making && <AppTokenForm appId={appId} identity={identity} onCreated={onChanged} onDone={() => setMaking(false)} />}
      {rotated && <RotatedSecret name={rotated.name} secret={rotated.secret} onDone={() => setRotated(null)} />}
    </SettingsSection>
  )
}

/**
 * A new token for the app: a name, a life and some of its scopes; then the
 * token, once. A dialog on a computer and the shared sheet on a phone, its
 * actions pinned under what scrolls.
 */
function AppTokenForm({ appId, identity, onCreated, onDone }: { appId: string; identity: AppIdentity; onCreated: () => void; onDone: () => void }) {
  const [name, setName] = useState("")
  const [life, setLife] = useState<string>("90")
  const [scopes, setScopes] = useState<Set<string>>(() => new Set(identity.scopes))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; scopes?: string }>({})
  const [problem, setProblem] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const scopesRef = useRef<HTMLDivElement>(null)
  const lifeId = useId()
  const scopesId = useId()
  const formId = useId()
  const once = useOneTimeSecret("You'd have to make a new one.")
  const close = () => once.mayClose(onDone) && onDone()

  const toggle = (s: string, on: boolean) => {
    setErrors((e) => ({ ...e, scopes: undefined }))
    setScopes((prev) => {
      const next = new Set(prev)
      if (on) next.add(s)
      else next.delete(s)
      return next
    })
  }

  const create = async () => {
    const missing = { name: name.trim() ? undefined : "Give the token a name.", scopes: scopes.size ? undefined : "Choose at least one scope." }
    setErrors(missing)
    setProblem("")
    if (missing.name) return nameRef.current?.focus()
    if (missing.scopes) return scopesRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
    setSaving(true)
    try {
      const made = await mintAppToken(appId, { name: name.trim(), scopes: [...scopes].sort(), expires_in_days: Number(life) })
      once.setSecret(made.plaintext)
      onCreated()
    } catch (e) {
      setProblem(`Couldn't make the token. ${apiErrorMessage(e, "Try again in a moment.")}`)
    } finally {
      setSaving(false)
    }
  }

  if (once.secret) {
    return (
      <ResponsiveDialog title="Token made" description={`Put it wherever ${identity.name} runs.`} onClose={close} wide footer={<Button onClick={close}>Done</Button>}>
        <RevealCard secret={once.secret} what="token" copied={once.copied} copyFailed={once.copyFailed} onCopy={() => void once.copySecret()} />
      </ResponsiveDialog>
    )
  }
  return (
    <ResponsiveDialog
      title={`New token for ${identity.name}`}
      description="Name it for where it runs, choose how long it lasts and what it carries."
      onClose={close}
      wide
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" form={formId} busy={saving}>
            Make token
          </Button>
        </>
      }
    >
        <form
          id={formId}
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void create()
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
              placeholder="Production server…"
              maxLength={120}
              autoComplete="off"
              name="app-token-name"
            />
          </Field>
          <div className="grid gap-2">
            <Label id={lifeId}>Lasts</Label>
            <SegmentedControl value={life} onValueChange={setLife} aria-labelledby={lifeId} className="w-fit" options={APP_TOKEN_LIFE} />
          </div>
          <div className="grid gap-2">
            <Label id={scopesId}>Scopes</Label>
            <ScopeChecklist
              available={identity.scopes}
              selected={scopes}
              onToggle={toggle}
              labelledBy={scopesId}
              describedBy={errors.scopes ? `${scopesId}-error` : undefined}
              idPrefix={`app-token-scope-${appId}`}
              groupRef={scopesRef}
            />
            <p id={`${scopesId}-error`} aria-live="polite" className={cn("text-xs font-medium text-danger-ink", !errors.scopes && "hidden")}>
              {errors.scopes}
            </p>
          </div>
          {problem && (
            <p role="alert" className="text-sm text-danger-ink text-pretty">
              {problem}
            </p>
          )}
        </form>
    </ResponsiveDialog>
  )
}

/** A rotated token's new secret, shown once. */
function RotatedSecret({ name, secret, onDone }: { name: string; secret: string; onDone: () => void }) {
  const once = useOneTimeSecret("You'd have to rotate it again.", secret)
  const close = () => once.mayClose(onDone) && onDone()
  return (
    <ResponsiveDialog
      title={`New secret for ${name}`}
      description="The old one stopped working just now. Put this one wherever it runs."
      onClose={close}
      wide
      footer={<Button onClick={close}>Done</Button>}
    >
      <RevealCard secret={secret} what="token" copied={once.copied} copyFailed={once.copyFailed} onCopy={() => void once.copySecret()} />
    </ResponsiveDialog>
  )
}

