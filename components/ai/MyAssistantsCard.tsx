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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CopyableCode } from "@/components/ui/copyable-code"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsSection } from "@/components/ui/settingsSection"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Tile } from "@/components/ui/graphics/Tile"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bot, Loader2, Lock, ShieldCheck } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { scopeLabel } from "@/services/apiTokenService"
import { mcpConnectRecipes } from "@/lib/utils/mcpEndpoint"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { withAI } from "@/components/common/withFeature"

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

/** The section's own hue (lib/settingsSections): its tiles here and in the list of sections. */
const HUE = "sky" as const

const PROMISES = [
  { title: "It acts as you", body: "It can see and do only what you can, in the areas your admin allows. Never more." },
  { title: "Drastic steps wait for you", body: "Reading and adding go straight through. Anything that deletes waits for someone to approve it here." },
  { title: "Everything is on the record", body: "Each action is in the audit log, and you can disconnect it below at any time." },
]

/** `withTitle={false}` under a page header that already names it, as the settings page is. */
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

  // Before anything about the workspace or the list: a failed read used to say
  // the admin hadn't let assistants in, and "Nothing yet", both false.
  if (res.isError && !res.data) {
    return (
      <ErrorState
        compact
        subject="your AI assistants"
        detail={apiErrorMessage(res.isError, "Try again in a moment.")}
        onRetry={() => void res.mutate()}
      />
    )
  }

  // Flat sections under the page's h1, which already says "Your AI
  // assistants": this was a bordered Card that said it again, at 18px.
  return (
    <div className="space-y-10">
      {withTitle && <h2 className="text-base font-semibold">Your AI assistants</h2>}
      {/* What connecting means, said once, each promise on the section's tile:
          they were three bordered boxes with orange icons. */}
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
        {PROMISES.map((p) => (
          <li key={p.title} className="flex items-start gap-3">
            <Tile hue={HUE} size="sm" className="mt-0.5">
              <ShieldCheck aria-hidden="true" />
            </Tile>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{p.title}</p>
              <p className="text-sm text-muted-foreground text-pretty">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <SettingsSection
        title="Connect an assistant"
        description="Connect the assistant you already use, like ChatGPT, Claude or Grok Bot, so it can work in OneCamp for you."
      >
        {res.isLoading ? (
          <div role="status" aria-label="Checking whether assistants can connect" className="space-y-3">
            <Skeleton className="h-9 w-full max-w-md rounded-md" />
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        ) : !open ? (
          <div className="rounded-lg border border-border">
            <EmptyState
              icon={Lock}
              hue={HUE}
              title="Outside assistants aren't allowed here yet"
              description="Your admin has not let outside assistants into this workspace yet. They can turn it on in Admin, AI & agents."
              className="py-6"
            />
          </div>
        ) : (
          // The house tabs, as the admin's connection recipes use: a row of
          // bordered buttons with a box around the steps under them.
          <Tabs value={recipe?.id} onValueChange={setPicked} className="space-y-3">
            <TabsList aria-label="Assistant" className="h-auto flex-wrap justify-start">
              {ordered.map((r) => (
                <TabsTrigger key={r.id} value={r.id}>
                  {r.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {ordered.map((r) => (
              <TabsContent key={r.id} value={r.id} className="mt-0 space-y-3">
                <ol className="list-decimal space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
                  {r.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {r.snippet && <CopyableCode value={r.snippet} label="Copy" />}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </SettingsSection>

      <SettingsSection title="Connected" description="Each one acts as you, and stops at once when you disconnect it.">
        {res.isLoading ? (
          <div role="status" aria-label="Loading your connected assistants" className="rounded-lg border border-border px-4 py-3">
            <Skeleton className="h-3.5 w-1/3 rounded" />
            <Skeleton className="mt-2 h-3 w-1/2 rounded" />
          </div>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState
              icon={Bot}
              hue={HUE}
              title="Nothing connected yet"
              description="Once you approve an assistant, it shows here."
              className="py-6"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
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
                      {c.scopes.map((sc) => (
                        <Badge key={sc} variant="outline" className="text-2xs font-normal">
                          {scopeLabel(sc)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {confirming === c.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">It stops working at once.</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={ending === c.id}>
                      Keep
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => disconnect(c.id)} disabled={ending === c.id}>
                      {ending === c.id && <Loader2 className="animate-spin" />}
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
        )}
      </SettingsSection>
    </div>
  )
}

export default withAI(MyAssistantsCard)
