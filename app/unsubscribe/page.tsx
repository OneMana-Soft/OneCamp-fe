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
import { AuthHeading, AuthShell, authControl } from "@/components/auth/AuthShell"
import { apiUrl } from "@/lib/utils/apiUrl"

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

  // apiUrl joins with exactly one slash: the configured address ends in one,
  // and `${base}/public/...` posted to //public/..., which the API has no
  // route for.
  const resubscribe = token ? apiUrl(`public/notifications/resubscribe?token=${encodeURIComponent(token)}`) : ""

  if (status === "missing") {
    return (
      <>
        <AuthHeading title="This link is incomplete">
          Open the unsubscribe link from the email again, or choose which emails you get in your notification settings.
        </AuthHeading>
        <SettingsButton />
      </>
    )
  }

  if (status === "unsubscribed") {
    return (
      <>
        <AuthHeading title="You're unsubscribed">
          OneCamp won&apos;t email you notifications any more. You&apos;ll still see them in the app and on your devices.
        </AuthHeading>
        <div className="space-y-6">
          {resubscribe && (
            <form action={resubscribe} method="post" className="space-y-3">
              <p className="text-sm text-muted-foreground">Changed your mind?</p>
              <Button type="submit" variant="outline" className={authControl}>
                Turn emails back on
              </Button>
            </form>
          )}
          <SettingsLink label="Manage notification settings" />
        </div>
      </>
    )
  }

  if (status === "resubscribed") {
    return (
      <>
        <AuthHeading title="Emails are back on">
          OneCamp will email you notifications again. Choose which ones in your notification settings.
        </AuthHeading>
        {isSuppressed && (
          <div role="note" className="mb-6 space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
            <p className="font-medium">They may not arrive yet</p>
            <p className="text-muted-foreground">
              An earlier email to your address bounced or was marked as spam, so OneCamp&apos;s email service is holding
              new ones back. Ask your workspace admin to clear your address.
            </p>
          </div>
        )}
        <SettingsButton />
      </>
    )
  }

  return (
    <>
      <AuthHeading title="Choose which emails you get">
        Use the unsubscribe link in any email from OneCamp, or change which emails you get in your notification settings.
      </AuthHeading>
      <SettingsButton />
    </>
  )
}

const SETTINGS = "/app/settings/notifications"

/** The page's one way on, where there is nothing else to do. */
function SettingsButton() {
  return (
    <Button className={authControl} asChild>
      <Link href={SETTINGS}>Open notification settings</Link>
    </Button>
  )
}

/** The same place as a quiet link, under the page's own action. */
function SettingsLink({ label }: { label: string }) {
  return (
    <p className="text-sm">
      <Link href={SETTINGS} className="font-medium text-foreground underline-offset-4 hover:underline">
        {label}
      </Link>
    </p>
  )
}

export default function UnsubscribePage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <UnsubscribeContent />
      </Suspense>
    </AuthShell>
  )
}
