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
import { format, formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsList, SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { CodeRow } from "@/components/ui/settingsControls"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotPlug } from "@/components/ui/graphics/spots"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bot, Loader2, Lock, MoreHorizontal, Plus, ShieldCheck } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { scopeLabel } from "@/services/apiTokenService"
import { mcpConnectRecipes, mcpEndpointUrl } from "@/lib/utils/mcpEndpoint"
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

/** The three the connect dialog offers as cards, in this order; the rest are in "Another client". */
const FEATURED = ["chatgpt", "claude", "grok"]

const PROMISES = [
  { title: "It acts as you", body: "It can see and do only what you can, in the areas your admin allows. Never more." },
  { title: "Drastic steps wait for you", body: "Reading and adding go straight through. Anything that deletes waits for someone to approve it here." },
  { title: "Everything is on the record", body: "Each action is in the audit log, and you can disconnect it below at any time." },
]

/** An assistant's mark: its first letter on the sunken surface, 32px. */
function AssistantMark({ name }: { name: string }) {
  return (
    <span aria-hidden="true" data-assistant-mark="" className="ai-sunken-note grid size-8 shrink-0 place-items-center rounded-[9px] text-sm font-medium text-ink-2">
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  )
}

/**
 * Connect an assistant (design v3, admin §S6): three option cards (the
 * chosen one gets the accent ring and lifts), then OneCamp's MCP address with
 * a big copy, and the chosen assistant's steps, numbered.
 */
function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const recipes = React.useMemo(() => mcpConnectRecipes(), [])
  const url = React.useMemo(() => mcpEndpointUrl(), [])
  const featured = FEATURED.map((id) => recipes.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r)
  const others = recipes.filter((r) => !FEATURED.includes(r.id))
  const [picked, setPicked] = React.useState(featured[0]?.id ?? recipes[0]?.id ?? "")
  const recipe = recipes.find((r) => r.id === picked) ?? recipes[0]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect an assistant</DialogTitle>
          <DialogDescription>Pick the one you use. It signs in as an agent you sponsor, and acts only as you could.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div role="radiogroup" aria-label="Assistant" className="grid gap-2 sm:grid-cols-3" data-assistant-options="">
            {featured.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={picked === r.id}
                onClick={() => setPicked(r.id)}
                data-assistant-option=""
                className="assistant-option"
              >
                <AssistantMark name={r.name} />
                <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
              </button>
            ))}
          </div>
          {others.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Another client</span>
              <Select value={FEATURED.includes(picked) ? "" : picked} onValueChange={setPicked}>
                <SelectTrigger className="h-8 w-auto min-w-[180px] text-xs" aria-label="Another client">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">OneCamp&apos;s address for assistants</p>
            <CodeRow value={url} label="MCP address" className="py-1.5 [&_button]:size-8" />
          </div>
          {recipe && (
            <ol className="space-y-3" data-connect-steps="" aria-label={`Connect ${recipe.name}`}>
              {recipe.steps.slice(0, 3).map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span aria-hidden="true" className="assistant-step-num">{i + 1}</span>
                  <span className="min-w-0 pt-px text-sm text-foreground text-pretty">{step}</span>
                </li>
              ))}
            </ol>
          )}
          {recipe?.snippet && recipe.snippet !== url && <CodeRow value={recipe.snippet} label={`${recipe.name} setup`} ellipsis="wrap" />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** `withTitle={false}` under a page header that already names it, as the settings page is. */
function MyAssistantsCard({ withTitle = true }: { withTitle?: boolean }) {
  const res = useFetch<MyAssistantsResponse>(GetEndpointUrl.MyAssistants)
  const post = usePost()
  const [connecting, setConnecting] = React.useState(false)
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
      // The toast has said what went wrong; the card stays so it can be retried.
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

  const connectButton = (variant: "default" | "outline") => (
    <Button size="sm" variant={variant} className={sectionActionClass} onClick={() => setConnecting(true)}>
      <Plus /> Connect an assistant
    </Button>
  )

  return (
    <div className="space-y-8">
      {withTitle && <h2 className="text-heading text-foreground">Your AI assistants</h2>}
      {/* What connecting means, said once: a note on the sunken surface. The
          promises sat on three tinted tiles (hue is for identity). */}
      <ul data-assistant-promises="" className="ai-sunken-note grid gap-x-6 gap-y-3 rounded-lg p-4 sm:grid-cols-3">
        {PROMISES.map((p) => (
          <li key={p.title} className="flex items-start gap-2.5">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground text-pretty">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <SettingsSection
        title="Connected"
        description="Outside assistants that act as you. Each stops at once when you disconnect it."
        action={!res.isLoading && open && connections.length > 0 ? connectButton("default") : undefined}
      >
        {res.isLoading ? (
          <div role="status" aria-label="Loading your connected assistants">
            <SettingsList>
              <div className="px-4 py-3">
                <Skeleton className="h-3.5 w-1/3 rounded" />
                <Skeleton className="mt-2 h-3 w-1/2 rounded" />
              </div>
            </SettingsList>
          </div>
        ) : !open ? (
          <SettingsList>
            <EmptyState
              icon={Lock}
              title="Outside assistants aren't allowed here yet"
              description="Your admin has not let outside assistants into this workspace yet. They can turn it on in Admin, AI & agents."
              className="py-8"
            />
          </SettingsList>
        ) : connections.length === 0 ? (
          <SettingsList>
            <EmptyState
              illustration={<SpotPlug />}
              title="Nothing connected yet"
              description="Connect ChatGPT, Claude or Grok Bot, and approve it here; it shows on this page."
              action={connectButton("outline")}
              className="min-h-[200px] py-8"
            />
          </SettingsList>
        ) : (
          <ul className="space-y-2" data-assistant-cards="">
            {connections.map((c) => (
              <li key={c.id} data-settings-card="" data-assistant-card="" className="set-card flex items-start gap-3 px-4 py-3">
                <AssistantMark name={c.client_name} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">{c.client_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Connected {format(new Date(c.created_at), "d MMM")}
                    {" · "}
                    {c.last_used_at ? `last active ${formatDistanceToNow(new Date(c.last_used_at), { addSuffix: true })}` : "not used yet"}
                    {c.agent_name ? ` · acting as ${c.agent_name}` : ""}
                  </p>
                  {c.scopes.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {c.scopes.map((sc) => (
                        <span key={sc} className="ai-chip">
                          {scopeLabel(sc)}
                        </span>
                      ))}
                    </div>
                  )}
                  {confirming === c.id && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-sm text-muted-foreground">It stops working at once.</span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={ending === c.id}>
                        Keep
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => disconnect(c.id)} disabled={ending === c.id}>
                        {ending === c.id && <Loader2 className="animate-spin" />}
                        Disconnect
                      </Button>
                    </div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="-mr-2 size-8 shrink-0 text-muted-foreground" aria-label={`More for ${c.client_name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onSelect={() => setConfirming(c.id)}>
                      <Bot className="h-4 w-4" /> Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
      <ConnectDialog open={connecting} onOpenChange={setConnecting} />
    </div>
  )
}

export default withAI(MyAssistantsCard)
