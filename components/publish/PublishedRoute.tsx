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
 *   member's own docs, and opens the copy.
 *
 * It is a visitor's page (lib/axiosInstance onVisitorPage): nothing here signs
 * anyone out or sends them to sign in by itself.
 */

import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tile } from "@/components/ui/graphics/Tile"
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame"
import { Copy, Eye, EyeOff, Globe, Loader2, Lock } from "@/lib/icons"
import { refreshSession } from "@/lib/auth/sessionRefresh"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { copyPublishedPage, pageAddress, unlockPage, type PageRef } from "@/lib/publish/publish"
import { sendFailedText } from "@/services/publicApi"

type Mode = { kind: "go" } | { kind: "unlock" } | { kind: "copy"; k: string | null }

/** What the address asks for. Pure. */
export function modeOf(search: string): Mode {
  const q = new URLSearchParams(search)
  if (q.get("unlock")) return { kind: "unlock" }
  if (q.get("copy")) return { kind: "copy", k: q.get("k") }
  return { kind: "go" }
}

/** Where the browser goes for the page: replaced, so Back skips this address. A seam for tests. */
export const go = { to: (url: string) => window.location.replace(url) }

function Card({ tile, title, line, children, high }: { tile: React.ReactNode; title: string; line: string; children?: React.ReactNode; high?: boolean }) {
  return (
    // high: a card with a field sits in the top third on a phone, clear of the keyboard.
    <PublicFrame surface="published-page" header={false} mainClassName={high ? "justify-start px-4 pb-10 pt-[12dvh] sm:justify-center sm:py-10" : "justify-center px-4 py-10"}>
      <PaperCard className="flex max-w-[440px] flex-col gap-4 p-6 sm:p-8">
        {tile}
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.375rem] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
          <p className="text-ui text-ink-2">{line}</p>
        </div>
        {children}
      </PaperCard>
    </PublicFrame>
  )
}

/** A password page's way in: its password, then the page with its unlock. For an address or a link's token. */
export function UnlockPage({ pageRef }: { pageRef: PageRef }) {
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [shown, setShown] = React.useState(false)
  const fieldId = React.useId()
  return (
    <Card
      high
      tile={
        // A password names no area of the app, so its tile is neutral, not a hue.
        <span aria-hidden="true" data-unlock-tile="" className="inline-grid size-10 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2 ring-1 ring-inset ring-line [&>svg]:size-5">
          <Lock />
        </span>
      }
      title="This page needs a password"
      line="Whoever shared it with you has its password."
    >
      <form
        className="flex flex-col gap-3"
        data-publish-unlock=""
        onSubmit={async (e) => {
          e.preventDefault()
          if (!password || busy) return
          setBusy(true)
          setError(null)
          const res = await unlockPage(pageRef, password)
          if (res.ok && res.data?.url) {
            go.to(res.data.url)
            return
          }
          setBusy(false)
          if (!res.ok) setError(res.status === 401 ? "That password doesn't open this page." : sendFailedText(res))
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="text-ui-sm font-medium text-ink">
            Password
          </label>
          <div className="relative">
            <Input
              id={fieldId}
              type={shown ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "publish-unlock-error" : undefined}
              autoComplete="current-password"
              autoFocus
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              aria-label={shown ? "Hide the password" : "Show the password"}
              aria-pressed={shown}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            >
              {shown ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
            </button>
          </div>
        </div>
        {error ? (
          <p id="publish-unlock-error" role="alert" className="text-ui-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={!password || busy}>
          {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          Open the page
        </Button>
      </form>
    </Card>
  )
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
        tile={
          <Tile hue="sky" size="lg">
            <Copy aria-hidden="true" />
          </Tile>
        }
        title="Sign in to copy this page"
        line="A copy goes into your own docs, so it needs your account in this workspace. Sign in, then choose Copy to my workspace on the page again."
      >
        <Button asChild>
          <Link href="/">Sign in</Link>
        </Button>
        {back}
      </Card>
    )
  }
  if (copying.state === "failed") {
    return (
      <Card
        tile={
          <Tile hue="sun" size="lg">
            <Copy aria-hidden="true" />
          </Tile>
        }
        title="This page couldn't be copied"
        line={copying.msg}
      >
        {back}
      </Card>
    )
  }
  return (
    <Card
      tile={
        <Tile hue="sky" size="lg">
          <Copy aria-hidden="true" />
        </Tile>
      }
      title="Copying the page"
      line="It goes into your own docs, and opens there."
    >
      <Loader2 aria-label="Copying" className="size-5 animate-spin text-ink-3" />
    </Card>
  )
}

export function PublishedRoute({ slug }: { slug: string }) {
  const [mode, setMode] = React.useState<Mode | null>(null)
  React.useEffect(() => {
    const m = modeOf(window.location.search)
    setMode(m)
    if (m.kind === "go") go.to(pageAddress({ slug }))
  }, [slug])

  if (mode?.kind === "unlock") return <UnlockPage pageRef={{ slug }} />
  if (mode?.kind === "copy") return <CopyPage slug={slug} k={mode.k} />
  return (
    <Card
      tile={
        <Tile hue="sky" size="lg">
          <Globe aria-hidden="true" />
        </Tile>
      }
      title="Opening the page"
      line="It opens in a moment."
    >
      <a href={pageAddress({ slug })} className="self-start rounded-sm text-ui-sm text-ink-2 underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand">
        Open it now
      </a>
    </Card>
  )
}
