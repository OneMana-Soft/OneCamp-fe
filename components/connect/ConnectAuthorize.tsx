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
import { ShieldCheck } from "@/lib/icons"
import { AuthHeading, authControl } from "@/components/auth/AuthShell"
import { SpotError } from "@/components/ui/graphics/spots"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { scopeLabel } from "@/services/apiTokenService"
import {
  approveConsent,
  denyConsent,
  getConsent,
  isWriteScope,
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

type Phase =
  | { kind: "loading" }
  | { kind: "signin" }
  | { kind: "error"; message: string }
  | { kind: "ready"; view: ConsentView }
  | { kind: "leaving"; to: string; host: string }

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
 * The page's place while the sign-in loads: a heading, the choice of agent and
 * the button, in outline. Exported for the page's Suspense fallback, so the two
 * waits look the same.
 */
export function ConnectAuthorizeLoading() {
  return (
    <div role="status" aria-label="Loading the sign-in" aria-busy="true">
      <div aria-hidden="true">
        <div className="mb-8 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className={`mt-6 ${authControl}`} />
      </div>
    </div>
  )
}

export function ConnectAuthorize() {
  const params = useSearchParams()
  const requestId = params.get("request")
  const error = params.get("error")
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

  const leave = (to: string) => {
    setPhase({ kind: "leaving", to, host: hostOf(to) })
    window.location.assign(to)
  }

  const approve = async () => {
    if (!requestId) return
    setBusy(true)
    setActionError("")
    try {
      const res = await approveConsent(requestId, { agent_id: agentId, scopes })
      leave(res.redirect)
    } catch (e) {
      if (status(e) === 410) setPhase({ kind: "error", message: message(e, "This sign-in has expired.") })
      else setActionError(message(e, "It couldn't be connected. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const deny = async () => {
    if (!requestId) return
    setBusy(true)
    try {
      leave(await denyConsent(requestId))
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
        <AuthHeading title={`Returning you to ${phase.host}…`} />
      </div>
    )
  }

  // It was a red icon over a centred sentence with nothing to press. The
  // message says what to do in the agent; the link is the way on from here.
  if (phase.kind === "error") {
    return (
      <>
        <AuthHeading
          title="This sign-in can't continue"
          art={<SpotError />}
        >
          {phase.message}
        </AuthHeading>
        <Button className={authControl} asChild>
          <Link href="/app/home">Go to your workspace</Link>
        </Button>
      </>
    )
  }

  if (phase.kind === "signin") {
    return (
      <>
        <AuthHeading title="Sign in to connect your agent">
          An agent is asking to work in this workspace. Sign in, and you&apos;ll come straight back here to decide.
        </AuthHeading>
        <Button
          className={authControl}
          onClick={() => {
            if (requestId) rememberPendingConnect(requestId)
            window.location.assign("/")
          }}
        >
          Sign in
        </Button>
      </>
    )
  }

  const { view } = phase
  const closed = !view.surface_enabled
  const toggle = (scope: string, on: boolean) =>
    setScopes((cur) => (on ? [...cur, scope] : cur.filter((s) => s !== scope)))

  return (
    <div className="space-y-6">
      <AuthHeading title={`Connect ${view.client_name}`}>
        {view.client_name} wants to work in this workspace. It will act as an agent you sponsor, with no more reach
        than you have, and every call it makes is checked and recorded.
      </AuthHeading>

      {closed && (
        <div role="status" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          {view.is_admin ? (
            <>
              Outside agents are turned off here. Turn them on in{" "}
              <Link className="font-medium underline underline-offset-2" href="/app/admin?tab=ai-models#ai-models-mcp">
                Admin, AI &amp; agents
              </Link>
              , then come back to this tab.
            </>
          ) : (
            "An admin has not allowed outside agents in this workspace yet. Ask one to turn them on, then try again."
          )}
        </div>
      )}

      <fieldset className="space-y-2" disabled={closed || busy}>
        <legend className="text-sm font-medium text-muted-foreground">It acts as</legend>
        <RadioGroup value={agentId} onValueChange={setAgentId} className="gap-2">
          {!view.suggested_agent_id && (
            <Label className="flex items-center gap-2.5 rounded-md border p-3 font-normal">
              <RadioGroupItem value={NEW_AGENT} />
              <span>
                A new agent named <span className="font-medium">{view.client_name}</span>
                <span className="block text-xs text-muted-foreground">With exactly the tools you allow below.</span>
              </span>
            </Label>
          )}
          {view.agents.map((a) => (
            <Label key={a.id} className="flex items-center gap-2.5 rounded-md border p-3 font-normal">
              <RadioGroupItem value={a.id} />
              <span>
                {a.name}
                <span className="block text-xs text-muted-foreground">
                  {a.id === view.suggested_agent_id ? "Connected before. " : ""}
                  {a.tools === 0 ? "No tools enabled yet" : `${a.tools} tools enabled`}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-2" disabled={closed || busy}>
        <legend className="text-sm font-medium text-muted-foreground">It may</legend>
        <div className="grid gap-2">
          {view.scopes.map((s) => (
            <Label key={s} className="flex min-h-11 items-center gap-2.5 font-normal md:min-h-0">
              <Checkbox checked={scopes.includes(s)} onCheckedChange={(v) => toggle(s, v === true)} />
              <span>
                {scopeLabel(s)}
                {isWriteScope(s) && <span className="ml-1.5 text-xs text-muted-foreground">changes things</span>}
              </span>
            </Label>
          ))}
        </div>
      </fieldset>

      {actionError && (
        <p role="alert" className="text-sm text-danger-ink">
          {actionError}
        </p>
      )}

      <div className="space-y-2">
        <Button className={authControl} onClick={approve} disabled={closed || busy || scopes.length === 0}>
          {busy ? "Connecting…" : `Connect ${view.client_name}`}
        </Button>
        <Button className={authControl} variant="ghost" onClick={deny} disabled={busy}>
          Don&apos;t connect
        </Button>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          You return to <span className="font-medium text-foreground">{view.redirect_host}</span>. Pause the agent or
          revoke its key any time from Admin, Agent inventory.
        </span>
      </p>
    </div>
  )
}
