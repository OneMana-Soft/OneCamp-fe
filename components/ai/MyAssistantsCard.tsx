"use client"

/**
 * MyAssistantsCard: connect your own AI assistant to OneCamp, and see and end
 * the ones you have connected.
 *
 * WHY A MEMBER PAGE. Personal agents (ChatGPT, Claude, Grok Bot, Meta's Muse)
 * are arriving at work, and the common way to give one your work tools is to
 * sign it in as you, with everything your account can reach and no record of
 * what it did. OneCamp's answer already existed (sign-in by URL, an agent you
 * sponsor, approval for destructive acts, the audit), but it was reachable only
 * from the admin page and "API tokens", which is not where a person looks to
 * connect their assistant. This is.
 *
 * THE PROMISES ARE THE SERVER'S RULES, stated plainly:
 *   - it acts as you (the agent-bound token, capped by your live permissions);
 *   - reads and additions go through, destructive acts wait for approval
 *     (business/MCPServer/write.go);
 *   - everything is recorded, and Disconnect ends it at once (the grant and its
 *     token are revoked together).
 */

import * as React from "react"
import { formatDistanceToNow } from "date-fns"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CopyableCode } from "@/components/ui/copyable-code"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Bot, Loader2, ShieldCheck } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { scopeLabel } from "@/services/apiTokenService"
import { mcpConnectRecipes } from "@/lib/utils/mcpEndpoint"
import { withAI } from "@/components/common/withFeature"
import { cn } from "@/lib/utils/helpers/cn"

export interface AssistantConnection {
  id: string
  client_name: string
  agent_id: string
  agent_name: string
  scopes: string[]
  created_at: string
  last_used_at?: string
}

interface MyAssistantsResponse {
  data?: { open: boolean; connections: AssistantConnection[] }
}

const ASSISTANT_ORDER = ["chatgpt", "claude", "grok", "cursor", "claude-code"]

const PROMISES = [
  { title: "It acts as you", body: "It can see and do only what you can, in the areas your admin allows. Never more." },
  { title: "Drastic steps wait for you", body: "Reading and adding go straight through. Anything that deletes waits for someone to approve it here." },
  { title: "Everything is on the record", body: "Each action is in the audit log, and you can disconnect it below at any time." },
]

/** `withTitle={false}` under a page header that already names it. */
function MyAssistantsCard({ withTitle = true }: { withTitle?: boolean }) {
  const res = useFetch<MyAssistantsResponse>(GetEndpointUrl.MyAssistants)
  const post = usePost()
  const recipes = React.useMemo(() => mcpConnectRecipes(), [])
  // Lead with the assistants most people use; a recipe not named here keeps
  // its place after them, and "any client" is always last.
  const ordered = React.useMemo(() => {
    const rank = (id: string) => {
      const i = ASSISTANT_ORDER.indexOf(id)
      return id === "any" ? Number.MAX_SAFE_INTEGER : i === -1 ? ASSISTANT_ORDER.length : i
    }
    return [...recipes].sort((a, b) => rank(a.id) - rank(b.id))
  }, [recipes])
  const [picked, setPicked] = React.useState(ordered[0]?.id ?? "")
  const recipe = ordered.find((r) => r.id === picked) ?? ordered[0]
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [ending, setEnding] = React.useState<string | null>(null)

  const open = res.data?.data?.open ?? false
  const connections = res.data?.data?.connections ?? []

  const disconnect = async (id: string) => {
    setEnding(id)
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.DisconnectMyAssistant,
        appendToUrl: `/${id}/disconnect`,
        payload: {},
        showToast: true,
      })
      await res.mutate()
    } catch {
      // The toast has said what went wrong; the row stays so it can be retried.
    } finally {
      setEnding(null)
      setConfirming(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        {withTitle && (
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="h-4 w-4 text-muted-foreground" />
            Your AI assistants
          </CardTitle>
        )}
        <CardDescription>
          Connect the assistant you already use, like ChatGPT, Claude or Grok Bot, so it can work in OneCamp for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="grid gap-3 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <li key={p.title} className="rounded-lg border border-border/60 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {p.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ul>

        {res.isLoading ? (
          <SkeletonRows rows={2} />
        ) : !open ? (
          <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
            Your admin has not let outside assistants into this workspace yet. They can turn it on in Admin, under AI.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">Connect one</p>
            <div role="tablist" aria-label="Assistant" className="flex flex-wrap gap-1.5">
              {ordered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={r.id === recipe?.id}
                  onClick={() => setPicked(r.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-sm transition-colors",
                    r.id === recipe?.id
                      ? "border-foreground/20 bg-accent text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
            {recipe && (
              <div role="tabpanel" className="space-y-3 rounded-lg border border-border/60 p-4">
                <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                  {recipe.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                {recipe.snippet && <CopyableCode value={recipe.snippet} label="Copy" />}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Connected</p>
          {!res.isLoading && connections.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing yet. Once you approve an assistant, it shows here.</p>
          )}
          <ul className="divide-y divide-border/60">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    {c.client_name}
                    {c.agent_name && (
                      <span className="font-normal text-muted-foreground"> · acting as {c.agent_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Connected {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    {" · "}
                    {c.last_used_at
                      ? `last active ${formatDistanceToNow(new Date(c.last_used_at), { addSuffix: true })}`
                      : "not used yet"}
                  </p>
                  {c.scopes.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {c.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="text-2xs font-normal">
                          {scopeLabel(s)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {confirming === c.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">It stops working at once.</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={ending === c.id}>
                      Keep
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => disconnect(c.id)} disabled={ending === c.id}>
                      {ending === c.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirming(c.id)}>
                    Disconnect
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export default withAI<{ withTitle?: boolean }>(MyAssistantsCard)
