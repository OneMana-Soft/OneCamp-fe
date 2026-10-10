"use client"

// Passkeys, in profile settings beside the password and two-step cards: add
// one on this device, see where you have them, rename or remove them. A
// passkey signs you in with your fingerprint, face or device PIN.

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoaderCircle, Pencil, Trash2 } from "@/lib/icons"
import { useConfirm } from "@/hooks/useConfirm"
import { serverMessage } from "@/lib/http/serverMessage"
import { passkeyErrorMessage, passkeysSupported } from "@/lib/auth/webauthn"
import { addPasskey, listPasskeys, removePasskey, renamePasskey, type Passkey } from "@/services/passkeyService"

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

/** A name for a passkey made here, from what the browser says it runs on. */
function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "This device"
  return `Passkey on ${os}`
}

export function PasskeySection() {
  const [keys, setKeys] = useState<Passkey[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const supported = passkeysSupported()
  const confirm = useConfirm()

  const refresh = useCallback(async () => {
    try {
      setKeys(await listPasskeys())
    } catch (e) {
      setKeys([])
      setError(serverMessage(e, "Couldn't load your passkeys."))
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
      const msg = (e as { response?: unknown })?.response ? serverMessage(e) : passkeyErrorMessage(e)
      if (msg) setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Passkeys</h3>
          <p className="text-xs text-muted-foreground text-pretty">
            {supported ? "Sign in with your fingerprint, face or device PIN instead of a password." : "This browser can't use passkeys."}
          </p>
        </div>
        {supported && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => addPasskey(deviceName()))}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Add a passkey
          </Button>
        )}
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {keys && keys.length > 0 && (
        <ul className="grid gap-1">
          {keys.map((k) => (
            <li key={k.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
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
                  <Button type="submit" size="sm" className="h-8" disabled={busy}>Save</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setRenaming(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{k.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {when(k.created_at)}
                      {k.last_used_at ? ` · last used ${when(k.last_used_at)}` : " · not used yet"}
                    </p>
                  </div>
                  <span className="flex shrink-0 gap-0.5 sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Rename this passkey" onClick={() => setRenaming({ id: k.id, name: k.name })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remove this passkey" disabled={busy} onClick={() =>
                        confirm({
                          title: "Remove this passkey?",
                          description: `"${k.name}" will stop signing you in. To use it again you'd add it again.`,
                          confirmText: "Remove passkey",
                          destructive: true,
                          onConfirm: () => run(() => removePasskey(k.id)),
                        })
                      }>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {keys && keys.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Removing one here stops it signing you in. It stays in your password manager until you delete it there too.
        </p>
      )}
    </div>
  )
}
