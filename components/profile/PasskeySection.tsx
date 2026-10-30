"use client"

// Passkeys, in profile settings beside the password and two-step cards: add
// one on this device, see where you have them, rename or remove them. A
// passkey signs you in with your fingerprint, face or device PIN.

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Fingerprint, Laptop, LoaderCircle, Pencil, Smartphone } from "@/lib/icons"
import { useConfirm } from "@/hooks/useConfirm"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { passkeyErrorMessage, passkeysSupported } from "@/lib/auth/webauthn"
import { addPasskey, listPasskeys, removePasskey, renamePasskey, type Passkey } from "@/services/passkeyService"
import { shortDate } from "@/lib/utils/date/shortDate"
import { SettingsCardError } from "@/components/ui/settingsSection"

const when = (iso: string) => shortDate(new Date(iso))

/** A name for a passkey made here, from what the browser says it runs on. */
function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "This device"
  return `Passkey on ${os}`
}

/** The glyph for where a passkey lives, read from its name. */
function deviceGlyph(name: string) {
  if (/iphone|ipad|android|phone/i.test(name)) return Smartphone
  if (/mac|windows|linux|laptop|pc/i.test(name)) return Laptop
  return Fingerprint
}

export function PasskeySection() {
  const [keys, setKeys] = useState<Passkey[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // The list couldn't be read: the server's reason ("" for none), said by the
  // row itself (SettingsCardError, which keeps the request's toast quiet),
  // apart from a failed action's message.
  const [loadProblem, setLoadProblem] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const supported = passkeysSupported()
  const confirm = useConfirm()

  const refresh = useCallback(async () => {
    try {
      setKeys(await listPasskeys())
      setLoadProblem(null)
    } catch (e) {
      setLoadProblem(apiErrorMessage(e))
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError("")
    try {
      await fn()
      await refresh()
    } catch (e) {
      // The server's refusals come with a response; the browser's don't.
      const msg = (e as { response?: unknown })?.response ? apiErrorMessage(e) : passkeyErrorMessage(e)
      if (msg) setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {loadProblem !== null ? (
        <SettingsCardError what="your passkeys" reason={loadProblem || undefined} onRetry={() => void refresh()} />
      ) : (
        <div data-setting-row="" className="set-row space-y-2">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <h3 className="text-sm font-medium leading-5">Passkeys</h3>
              <p className="text-xs text-muted-foreground text-pretty">
                {supported ? "Sign in with your fingerprint, face or device PIN instead of a password." : "This browser can't use passkeys."}
              </p>
            </div>
            {supported && (
              <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={() => run(() => addPasskey(deviceName()))}>
                {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Add a passkey
              </Button>
            )}
          </div>
          {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
        </div>
      )}

      {keys && keys.length > 0 && (
        <ul aria-label="Your passkeys" className="you-passkeys contents">
          {keys.map((k) => {
            const Glyph = deviceGlyph(k.name)
            return (
              <li key={k.id} data-passkey-row="" className="set-row flex items-center gap-3">
                <span aria-hidden="true" className="you-key-tile">
                  <Glyph className="size-3.5" />
                </span>
                {renaming?.id === k.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(async () => {
                        await renamePasskey(k.id, renaming.name)
                        setRenaming(null)
                      })
                    }}
                  >
                    <Input value={renaming.name} onChange={(e) => setRenaming({ id: k.id, name: e.target.value })} maxLength={60} aria-label="Passkey name" className="h-8" autoFocus />
                    <Button type="submit" size="sm" variant="secondary" disabled={busy}>Save</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{k.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Added {when(k.created_at)}
                        {k.last_used_at ? ` · last used ${when(k.last_used_at)}` : " · not used yet"}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Rename ${k.name}`} onClick={() => setRenaming({ id: k.id, name: k.name })}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-danger-ink hover:text-danger-ink"
                      aria-label={`Remove ${k.name}`}
                      disabled={busy}
                      onClick={() =>
                        confirm({
                          title: "Remove this passkey?",
                          description: `"${k.name}" will stop signing you in. It stays in your password manager until you delete it there too.`,
                          confirmText: "Remove passkey",
                          destructive: true,
                          onConfirm: () => run(() => removePasskey(k.id)),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
