"use client"

/**
 * Public unsubscribe / resubscribe confirmation page.
 *
 * Flow shapes this page handles:
 *
 *   1. Email's unsubscribe link → BE /public/notifications/unsubscribe →
 *      flips email_enabled=false → redirects here with
 *      `?status=unsubscribed&token=<token>`. Token is forwarded so the user
 *      can immediately reverse the action with one click — recovers from
 *      a misclick without needing a fresh email.
 *
 *   2. The resubscribe button on this page → BE
 *      /public/notifications/resubscribe (POST) → flips email_enabled=true →
 *      redirects here with `?status=resubscribed`. No token forwarded; the
 *      user is back to default and can manage further changes from settings.
 *
 *   3. Direct visit / missing token → friendly empty state with a link to
 *      the in-app settings page.
 *
 * Design choices:
 *
 *   - Resubscribe is a POST-only endpoint and we submit a real <form> to
 *     it. That keeps link previewers (Slack/iMessage/AV scanners) from
 *     accidentally re-opting-in a user from a leaked URL: those tools issue
 *     GETs and don't follow forms.
 *   - The token arrives in the URL but we move it into React state on
 *     mount and clear it from the address bar so the user can't share
 *     the URL accidentally and history doesn't preserve the credential.
 *   - useSearchParams is wrapped in a Suspense boundary to satisfy the
 *     Next.js app-router build-time contract (mirrors /reset-password).
 */

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || ""

type Status = "unsubscribed" | "resubscribed" | "missing" | "unknown"

function readStatus(params: URLSearchParams): Status {
  if (params.get("missing") === "1") return "missing"
  const s = params.get("status")
  if (s === "unsubscribed" || s === "resubscribed") return s
  return "unknown"
}

function UnsubscribeContent() {
  const params = useSearchParams()
  const router = useRouter()
  const status = readStatus(params)
  const [token, setToken] = useState<string>("")
  const isSuppressed = params.get("warn") === "suppressed"

  // Capture the token into local state on mount and strip it from the URL.
  // The token is a permanent per-user credential; not leaving it in the
  // address bar / browser history limits the blast radius of accidental
  // sharing. Replace (not push) keeps Back from restoring the URL with
  // the token visible.
  useEffect(() => {
    const t = params.get("token")
    if (t) {
      setToken(t)
      const stripped = new URLSearchParams(params.toString())
      stripped.delete("token")
      const next = "/unsubscribe" + (stripped.toString() ? `?${stripped.toString()}` : "")
      router.replace(next)
    }
  }, [params, router])

  return (
    <div className="max-w-md w-full bg-background border rounded-lg shadow-sm p-8 text-center space-y-4">
      {status === "missing" && (
        <>
          <h1 className="text-xl font-semibold">Missing token</h1>
          <p className="text-sm text-muted-foreground">
            The unsubscribe link looks incomplete. Please use the original
            link from the email, or open your notification settings inside
            OneCamp.
          </p>
          <SettingsLink />
        </>
      )}

      {status === "unsubscribed" && (
        <>
          <h1 className="text-xl font-semibold">You're unsubscribed</h1>
          <p className="text-sm text-muted-foreground">
            You won't receive notification emails from OneCamp anymore.
            In-app and push notifications keep working as usual.
          </p>

          {token && BACKEND && (
            <form
              action={`${BACKEND}/public/notifications/resubscribe?token=${encodeURIComponent(token)}`}
              method="post"
              className="pt-2 space-y-3"
            >
              <p className="text-xs text-muted-foreground">
                Did you change your mind?
              </p>
              <Button type="submit" size="sm" className="gap-2">
                Resubscribe
              </Button>
            </form>
          )}

          <div className="pt-4 border-t mt-4">
            <SettingsLink label="Manage notification settings" />
          </div>
        </>
      )}

      {status === "resubscribed" && (
        <>
          <h1 className="text-xl font-semibold">You're resubscribed</h1>
          <p className="text-sm text-muted-foreground">
            You'll start receiving OneCamp notification emails again. Open
            the settings page to fine-tune which events reach your inbox.
          </p>
          {isSuppressed && (
            <div className="text-left text-xs rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 p-3 text-amber-900 dark:text-amber-100">
              <p className="font-medium mb-1">Heads-up</p>
              <p>
                Your address is currently flagged at the provider level
                (likely from a previous bounce or spam-folder action). You
                may not see emails arrive until your workspace admin clears
                the suppression for your address.
              </p>
            </div>
          )}
          <SettingsLink />
        </>
      )}

      {status === "unknown" && (
        <>
          <h1 className="text-xl font-semibold">Unsubscribe</h1>
          <p className="text-sm text-muted-foreground">
            Use the unsubscribe link inside any email from OneCamp, or open
            your notification settings to manage your preferences.
          </p>
          <SettingsLink />
        </>
      )}
    </div>
  )
}

function SettingsLink({ label = "Open notification settings" }: { label?: string }) {
  return (
    <div className="pt-2">
      <Link
        href="/app/settings/notifications"
        className="inline-flex items-center text-sm font-medium underline underline-offset-4 hover:no-underline"
      >
        {label}
      </Link>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Suspense
        fallback={
          <div className="max-w-md w-full bg-background border rounded-lg shadow-sm p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        }
      >
        <UnsubscribeContent />
      </Suspense>
    </div>
  )
}
