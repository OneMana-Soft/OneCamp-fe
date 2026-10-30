"use client"

/**
 * The web's /p/<slug> (docs programme C6, D-25), the address people share for
 * a page published to the web. The page itself is the server's, a complete
 * page with no script; this route does the three things that page can't:
 *
 * - by default it sends the browser to the page (replacing this address, so
 *   Back doesn't come here again);
 * - ?unlock=1 asks for a password page's password: the server's unlock opens
 *   the page with a short-lived token in its address, never a cookie;
 * - ?copy=1 (with ?k= on a password page) copies the page into the signed-in
 *   member's own docs, and opens the copy; signed out, after sign-in.
 *
 * It is a visitor's page (lib/axiosInstance onVisitorPage): nothing here signs
 * anyone out or sends them to sign in by itself.
 */

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, UnlockPage, go } from "@/components/publish/publishCards"
import { CalendarOff, Clock, Compass, Copy, Globe, Loader2 } from "@/lib/icons"
import { refreshSession } from "@/lib/auth/sessionRefresh"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { copyPublishedPage, pageAddress, pageState } from "@/lib/publish/publish"

type Mode = { kind: "go" } | { kind: "unlock" } | { kind: "copy"; k: string | null }

/** What the address asks for. Pure. */
export function modeOf(search: string): Mode {
  const q = new URLSearchParams(search)
  if (q.get("unlock")) return { kind: "unlock" }
  if (q.get("copy")) return { kind: "copy", k: q.get("k") }
  return { kind: "go" }
}

/** Keeps the copy for after sign-in (lib/afterSignIn, loaded only now), then signs in. */
async function signInToCopy(slug: string, k: string | null) {
  try {
    const { rememberAfterSignIn } = await import("@/lib/afterSignIn")
    rememberAfterSignIn({ kind: "copyPage", slug, k })
  } catch {
    /* the copy is asked again after sign-in, from the page */
  }
  go.signIn()
}

type Copying = { state: "copying" } | { state: "signin" } | { state: "failed"; msg: string }

function CopyPage({ slug, k }: { slug: string; k: string | null }) {
  const [copying, setCopying] = React.useState<Copying>({ state: "copying" })
  const started = React.useRef(false)
  React.useEffect(() => {
    if (started.current) return
    started.current = true
    const copy = async () => {
      try {
        return await copyPublishedPage({ slug }, k)
      } catch (err) {
        if (apiErrorStatus(err) !== 401) throw err
        // A member whose session has run its course here: once more, renewed.
        await refreshSession()
        return copyPublishedPage({ slug }, k)
      }
    }
    copy()
      .then((id) => go.to(`/app/doc/${encodeURIComponent(id)}`))
      .catch((err) => {
        if (apiErrorStatus(err) === 401 || apiErrorStatus(err) === 0) setCopying({ state: "signin" })
        else setCopying({ state: "failed", msg: apiErrorMessage(err, "This page couldn't be copied. Try again in a moment.") })
      })
  }, [slug, k])

  const back = (
    <a href={pageAddress({ slug }, k)} className="self-start rounded-sm text-ui-sm text-ink-2 underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand">
      Back to the page
    </a>
  )
  if (copying.state === "signin") {
    return (
      <Card
        icon={<Copy />}
        title="Sign in to copy this page"
        line="A copy goes into your own docs, so it needs your account in this workspace. Sign in, and the copy carries on from here."
      >
        <Button onClick={() => void signInToCopy(slug, k)}>Sign in</Button>
        {back}
      </Card>
    )
  }
  if (copying.state === "failed") {
    return (
      <Card
        icon={<Copy />}
        title="This page couldn't be copied"
        line={copying.msg}
      >
        {back}
      </Card>
    )
  }
  return (
    <Card
      icon={<Copy />}
      title="Copying the page"
      line="It goes into your own docs, and opens there."
    >
      <Loader2 aria-label="Copying" className="size-5 animate-spin text-ink-3" />
    </Card>
  )
}

/**
 * What an address says when it has no page to show, in the page's own words
 * (business/Publish document.go), on this frame rather than the API's.
 */
const NOTICES = {
  gone: { icon: CalendarOff, title: "This page has expired", line: "Whoever published it set it to stop being shown, and that time has passed." },
  missing: { icon: Compass, title: "There's no page here", line: "The address may be mistyped, or the page may no longer be published." },
  busy: { icon: Clock, title: "This page is busy", line: "It has had a lot of visitors in the last minute. Try again in a moment." },
} as const

export function PublishedRoute({ slug }: { slug: string }) {
  const [mode, setMode] = React.useState<Mode | null>(null)
  const [notice, setNotice] = React.useState<keyof typeof NOTICES | "locked" | null>(null)
  React.useEffect(() => {
    const m = modeOf(window.location.search)
    setMode(m)
    if (m.kind !== "go") return
    let live = true
    // Asked first, so only a live page leaves for the server's: every other
    // state is shown here, in this frame. A failed ask goes to the page,
    // which says the same in its own.
    void pageState(slug).then((res) => {
      if (!live) return
      if (res.ok && res.data.state !== "live") {
        setNotice(res.data.state === "locked" ? "locked" : res.data.state)
      } else if (!res.ok && res.status === 429) {
        setNotice("busy")
      } else {
        go.to(pageAddress({ slug }))
      }
    })
    return () => {
      live = false
    }
  }, [slug])

  if (mode?.kind === "unlock" || notice === "locked") return <UnlockPage pageRef={{ slug }} />
  if (notice) {
    const n = NOTICES[notice]
    return (
      <Card
        icon={<n.icon />}
        title={n.title}
        line={n.line}
      >
        {notice === "busy" ? (
          <Button className="self-start" onClick={() => go.again()}>
            Try again
          </Button>
        ) : null}
      </Card>
    )
  }
  if (mode?.kind === "copy") return <CopyPage slug={slug} k={mode.k} />
  return (
    <Card
      icon={<Globe />}
      title="Opening the page"
      line="It opens in a moment."
    >
      <a href={pageAddress({ slug })} className="self-start rounded-sm text-ui-sm text-ink-2 underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand">
        Open it now
      </a>
    </Card>
  )
}
