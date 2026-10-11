"use client"

/**
 * /connect/authorize: where a person approves an outside agent (Claude, Cowork,
 * ChatGPT, Grok Bot, Cursor) signing in to this workspace.
 *
 * The agent's client sends the browser here through the backend's
 * /oauth/authorize, with a request id. The person chooses the agent identity
 * it acts as (a new one named after the client, or one they already sponsor)
 * and what it may do, then goes back to the client, which receives a
 * credential bound to that agent. Everything after that is the governance the
 * workspace already has: the inventory lists it, the agent's switch stops it,
 * the audit log names it.
 *
 * Public path (see lib/axiosInstance), so a signed-out visitor is shown a
 * sign-in button here instead of being logged out and bounced. The request id
 * is remembered for this tab and resumed after whichever login they use.
 */

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Check, Plus, ShieldCheck } from "@/lib/icons"
import { AuthNotice, authControl } from "@/components/auth/AuthShell"
import { GradientRing, useHost } from "@/components/auth/CampArt"
import { SpotError } from "@/components/ui/graphics/spots"
import { AgentAvatar } from "@/components/ui/graphics"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { changesThings, scopeWords } from "@/lib/auth/consentScopes"
import {
  approveConsent,
  denyConsent,
  getConsent,
  type ConsentView,
} from "@/services/connectService"
import { isConnectRequestId, rememberPendingConnect } from "@/lib/pendingConnect"

/** Errors the backend sends here instead of to an unverified client address. */
const ERRORS: Record<string, string> = {
  invalid_client: "This app is not registered with this workspace. Remove the connector in your agent and add it again.",
  invalid_redirect_uri:
    "This sign-in asked to return to an address the app never registered, so it was stopped. Remove the connector in your agent and add it again.",
  server_error: "The workspace could not start this sign-in. Try again from your agent.",
}

const NEW_AGENT = ""

/** How long "Connected" shows, dots turned moss, before the client takes over. */
export const CONNECTED_PAUSE_MS = 900

type Phase =
  | { kind: "loading" }
  | { kind: "signin" }
  | { kind: "error"; message: string }
  | { kind: "ready"; view: ConsentView }
  | { kind: "leaving"; to: string; host: string; connected: boolean; client: string }

function status(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status
}

function message(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg || fallback
}

/** The destination's host, for "Returning you to …". */
function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/**
 * The two-mark handshake (F9): the client's mark (its initial on the sunken
 * surface), a three-dot connector and the workspace's ring. The dots shimmer
 * while the page waits on the server and turn moss in sequence on consent,
 * when the client's mark takes a moss check.
 */
function Handshake({ client, state }: { client: string; state: "wait" | "idle" | "done" }) {
  return (
    <div className="auth-hand" aria-hidden="true" data-handshake={state}>
      <span className="auth-hand-mark">
        {(client.trim()[0] ?? "?").toUpperCase()}
        {state === "done" && (
          <span className="auth-badge text-white" style={{ background: "var(--camp-moss)" }}>
            <Check />
          </span>
        )}
      </span>
      <span className="auth-dots" data-wait={state === "wait" ? "" : undefined} data-done={state === "done" ? "" : undefined}>
        <i />
        <i />
        <i />
      </span>
      <span className="auth-hand-mark">
        <GradientRing size={24} />
      </span>
    </div>
  )
}

/** The consent card: 440px, r16, e3, the handshake on top and `foot` on the sunken strip. */
function ConsentCard({ client, state, children, foot }: { client: string; state: "wait" | "idle" | "done"; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="auth-consent" data-consent-card="">
      <Handshake client={client} state={state} />
      <div className="px-6 pb-5 pt-4">{children}</div>
      {foot && <div className="auth-consent-foot">{foot}</div>}
    </div>
  )
}

/** The card's centred title (20/27, 590) and its line. */
function ConsentTitle({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="text-title-2 text-balance">{title}</h1>
      {children && <p className="mt-1.5 text-sm text-muted-foreground text-pretty">{children}</p>}
    </div>
  )
}

/**
 * The page's place while the sign-in loads: the card with its handshake
 * shimmering, the title, two options and the button in outline. Exported for
 * the page's Suspense fallback, so the two waits look the same.
 */
export function ConnectAuthorizeLoading() {
  return (
    <div role="status" aria-label="Loading the sign-in" aria-busy="true">
      <ConsentCard client="" state="wait">
        <div aria-hidden="true" className="space-y-3">
          <div className="auth-skel mx-auto h-6 w-64" />
          <div className="auth-skel mx-auto h-4 w-72" />
          <div className="auth-skel mt-5 h-14 rounded-xl" />
          <div className="auth-skel h-14 rounded-xl" />
          <div className="auth-skel mt-4 h-10" />
        </div>
      </ConsentCard>
    </div>
  )
}

export function ConnectAuthorize() {
  const params = useSearchParams()
  const requestId = params.get("request")
  const error = params.get("error")
  const host = useHost()
  const workspace = process.env.NEXT_PUBLIC_ORG_NAME?.trim() || host || "this workspace"
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" })
  const [agentId, setAgentId] = React.useState(NEW_AGENT)
  const [scopes, setScopes] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState("")

  const load = React.useCallback(async () => {
    if (error) {
      setPhase({ kind: "error", message: ERRORS[error] || ERRORS.server_error })
      return
    }
    if (!isConnectRequestId(requestId)) {
      setPhase({ kind: "error", message: "This page is opened by your agent when it signs in. Start from the agent." })
      return
    }
    try {
      const view = await getConsent(requestId)
      setAgentId(view.suggested_agent_id || NEW_AGENT)
      setScopes(view.scopes)
      setPhase({ kind: "ready", view })
    } catch (e) {
      if (status(e) === 401) setPhase({ kind: "signin" })
      else setPhase({ kind: "error", message: message(e, "This sign-in couldn't be loaded. Start again from your agent.") })
    }
  }, [error, requestId])

  React.useEffect(() => {
    void load()
  }, [load])

  // Connected: the dots go moss and the check springs, then the client takes
  // over. Declined: straight back.
  React.useEffect(() => {
    if (phase.kind !== "leaving") return
    if (!phase.connected) {
      window.location.assign(phase.to)
      return
    }
    const t = window.setTimeout(() => window.location.assign(phase.to), CONNECTED_PAUSE_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  const approve = async () => {
    if (!requestId || phase.kind !== "ready") return
    setBusy(true)
    setActionError("")
    try {
      const res = await approveConsent(requestId, { agent_id: agentId, scopes })
      setPhase({ kind: "leaving", to: res.redirect, host: hostOf(res.redirect), connected: true, client: phase.view.client_name })
    } catch (e) {
      if (status(e) === 410) setPhase({ kind: "error", message: message(e, "This sign-in has expired.") })
      else setActionError(message(e, "It couldn't be connected. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const deny = async () => {
    if (!requestId || phase.kind !== "ready") return
    setBusy(true)
    try {
      const to = await denyConsent(requestId)
      setPhase({ kind: "leaving", to, host: hostOf(to), connected: false, client: phase.view.client_name })
    } catch (e) {
      setPhase({ kind: "error", message: message(e, "This sign-in has expired.") })
    } finally {
      setBusy(false)
    }
  }

  if (phase.kind === "loading") {
    return <ConnectAuthorizeLoading />
  }

  if (phase.kind === "leaving") {
    return (
      <div role="status">
        <ConsentCard client={phase.client} state={phase.connected ? "done" : "idle"}>
          <ConsentTitle title={phase.connected ? `Connected. Returning to ${phase.host}…` : `Returning you to ${phase.host}…`} />
        </ConsentCard>
      </div>
    )
  }

  // The message says what to do in the agent; the link is the way on from here.
  if (phase.kind === "error") {
    return (
      <ConsentCard client="?" state="idle">
        <div data-auth-art="" aria-hidden="true" className="mb-4 flex justify-center">
          <SpotError size={64} />
        </div>
        <ConsentTitle title="This sign-in can't continue">{phase.message}</ConsentTitle>
        <Button size="lg" className={`${authControl} mt-6`} asChild>
          <Link href="/app/home">Go to your workspace</Link>
        </Button>
      </ConsentCard>
    )
  }

  if (phase.kind === "signin") {
    return (
      <ConsentCard client="?" state="idle">
        <ConsentTitle title="Sign in to continue">
          An agent is asking to work in {workspace}. Sign in, and you&apos;ll come straight back here to decide.
        </ConsentTitle>
        <Button
          size="lg"
          className={`${authControl} mt-6`}
          onClick={() => {
            if (requestId) rememberPendingConnect(requestId)
            window.location.assign("/")
          }}
        >
          Sign in
        </Button>
      </ConsentCard>
    )
  }

  const { view } = phase
  const closed = !view.surface_enabled
  const toggle = (scope: string, on: boolean) =>
    setScopes((cur) => (on ? [...cur, scope] : cur.filter((s) => s !== scope)))
  const options = [
    ...(!view.suggested_agent_id
      ? [{ id: NEW_AGENT, name: <>A new agent named {view.client_name}</>, line: "With exactly the tools you allow below", fresh: true }]
      : []),
    ...view.agents.map((a) => ({
      id: a.id,
      name: <>{a.name}</>,
      line: `${a.id === view.suggested_agent_id ? "Connected before. " : ""}${a.tools === 0 ? "No tools enabled yet" : `${a.tools} tools enabled`}`,
      fresh: false,
    })),
  ]

  return (
    <ConsentCard
      client={view.client_name}
      state={busy ? "wait" : "idle"}
      foot={
        <div className="space-y-2">
          {actionError && (
            <p role="alert" className="auth-field-error pb-1">
              {actionError}
            </p>
          )}
          <Button size="lg" className={authControl} onClick={approve} disabled={closed || busy || scopes.length === 0}>
            {busy ? "Connecting…" : `Connect ${view.client_name}`}
          </Button>
          <Button className={authControl} variant="ghost" size="lg" onClick={deny} disabled={busy}>
            Don&apos;t connect
          </Button>
          <p className="flex items-start gap-2 pt-2 auth-hint">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              You&apos;ll return to <span className="font-medium text-foreground">{view.redirect_host}</span>. Pause or
              revoke it any time in Admin › Agent inventory.
            </span>
          </p>
        </div>
      }
    >
      <ConsentTitle title={`${view.client_name} wants to work in ${workspace}`}>
        It acts as an agent you sponsor. It can never do more than you can, and every call is recorded.
      </ConsentTitle>

      {closed && (
        <div className="mt-5">
          <AuthNotice tone="warning" title="Outside agents are off" role="status">
            {view.is_admin ? (
              <>
                Outside agents are turned off here. Turn them on in{" "}
                <Link className="font-medium text-foreground underline underline-offset-2" href="/app/admin?tab=ai-models#ai-models-mcp">
                  Admin, AI &amp; agents
                </Link>
                , then come back to this tab.
              </>
            ) : (
              "An admin has not allowed outside agents in this workspace yet. Ask one to turn them on, then try again."
            )}
          </AuthNotice>
        </div>
      )}

      <fieldset className="mt-5 space-y-2" disabled={closed || busy}>
        <legend className="mb-2 text-2xs font-medium text-faint-foreground">It acts as</legend>
        {options.map((o) => {
          const selected = agentId === o.id
          return (
            <label key={o.id || "new"} className="auth-option" data-selected={selected ? "" : undefined}>
              <input
                type="radio"
                name="connect-agent"
                className="sr-only"
                value={o.id}
                checked={selected}
                onChange={() => setAgentId(o.id)}
              />
              {o.fresh ? (
                <span className="auth-agent-new" aria-hidden="true">
                  <Plus />
                </span>
              ) : (
                <span className="size-8 flex-none" aria-hidden="true">
                  <AgentAvatar />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium">{o.name}</span>
                <span className="auth-hint block">{o.line}</span>
              </span>
              <span className="auth-radio" aria-hidden="true" />
            </label>
          )
        })}
      </fieldset>

      <fieldset className="mt-5" disabled={closed || busy}>
        <legend className="mb-1 text-2xs font-medium text-faint-foreground">It may</legend>
        {view.scopes.map((s) => (
          <label key={s} className="auth-scope" data-scope={s}>
            <Checkbox checked={scopes.includes(s)} onCheckedChange={(v) => toggle(s, v === true)} />
            <span>{scopeWords(s)}</span>
            {changesThings(s) && <span className="auth-tag-sun">Changes things</span>}
            <span className="auth-scope-raw font-mono" translate="no">
              {s}
            </span>
          </label>
        ))}
      </fieldset>
    </ConsentCard>
  )
}
