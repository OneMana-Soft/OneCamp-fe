"use client"

import { useState } from "react"
import { useDispatch } from "react-redux"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, RefreshCw, Copy, Eye, EyeOff, CheckCircle2, XCircle, ChevronDown, Pencil, Terminal } from "@/lib/icons";
import { Webhook, PlayCircle, ExternalLink, ArrowDownToLine, ArrowUpFromLine, FileJson } from "lucide-react";
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { openUI } from "@/store/slice/uiSlice"
import axiosInstance from "@/lib/axiosInstance"
import { apiUrl } from "@/lib/utils/apiUrl"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { cn } from "@/lib/utils/helpers/cn"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

interface WebhookItem {
  id: string
  name: string
  description?: string
  type: "incoming" | "outgoing"
  token: string
  secret?: string
  target_url?: string
  channel_id?: string
  events?: string
  is_active: boolean
  created_by: string
  bot_name: string
  bot_avatar_url?: string
  last_triggered_at?: string
  failure_count: number
  created_at: string
  updated_at: string
}

interface WebhookLog {
  id: string
  webhook_id: string
  event_type: string
  request_body?: string
  response_status?: number
  response_body?: string
  success: boolean
  duration_ms?: number
  error_message?: string
  created_at: string
}

const LOG_PAGE_SIZE = 20

/**
 * Where an incoming webhook is posted to.
 *
 * Through apiUrl, because the deployed API address ends in "/": the card used
 * to add its own and showed "…//webhook/incoming/…", which the API's router
 * does not match, so the URL an admin copied into another service failed. An
 * unset address is said as such instead of inventing localhost.
 */
const incomingUrl = (token: string) => apiUrl(`webhook/incoming/${token}`)

/** A state is a dot and a word, not a filled badge that reads as a button. */
function StateWord({ tone, children }: { tone: "ok" | "off" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        tone === "bad" ? "text-danger-ink" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "ok" ? "bg-success" : tone === "bad" ? "bg-destructive" : "bg-faint-foreground",
        )}
      />
      {children}
    </span>
  )
}

const WebhooksCard = () => {
  const dispatch = useDispatch()
  const { data: webhookData, isLoading, isError, mutate } = useFetch<{ webhooks: WebhookItem[] }>(GetEndpointUrl.GetAllWebhooks)
  const { toast } = useToast()
  const confirm = useConfirm()

  const [showLogs, setShowLogs] = useState<string | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  // Why the last read of the log failed. A failed read used to leave the list
  // empty and say "No logs yet", a claim about the webhook rather than the request.
  const [logsError, setLogsError] = useState<string | null>(null)
  const [logsPage, setLogsPage] = useState(1)
  const [logsHasMore, setLogsHasMore] = useState(false)
  const [tokenVisible, setTokenVisible] = useState<Record<string, boolean>>({})
  const [secretVisible, setSecretVisible] = useState<Record<string, boolean>>({})
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)

  const regenerateToken = async (webhookId: string) => {
    try {
      await axiosInstance.post(`${PostEndpointUrl.RegenerateWebhookToken}/${webhookId}/regenerate-token`)
      toast({ title: "Token regenerated", description: "Give the new token to anything that posts to this webhook." })
      mutate()
    } catch {
      // The interceptor's toast carries the server's reason.
    }
  }

  const regenerateSecret = async (webhookId: string) => {
    try {
      await axiosInstance.post(`${PostEndpointUrl.RegenerateWebhookSecret}/${webhookId}/regenerate-secret`)
      toast({ title: "Signing secret regenerated", description: "Give the new secret to the service that receives these deliveries." })
      mutate()
    } catch {
      // The interceptor's toast carries the server's reason.
    }
  }

  // Confirmed: one click on a small icon used to replace the credential every
  // integration uses, at once and for good. The question names the webhook and
  // says what stops working.
  const handleRegenerateToken = (webhook: WebhookItem) =>
    confirm({
      title: `Regenerate the token for ${webhook.name}?`,
      description:
        "The current token stops working at once. Anything that posts to this webhook needs the new one before it can post again.",
      confirmText: "Regenerate token",
      destructive: true,
      onConfirm: () => void regenerateToken(webhook.id),
    })

  const handleRegenerateSecret = (webhook: WebhookItem) =>
    confirm({
      title: `Regenerate the signing secret for ${webhook.name}?`,
      description:
        "The current secret stops working at once. The service that receives these deliveries needs the new one to check their signatures.",
      confirmText: "Regenerate secret",
      destructive: true,
      onConfirm: () => void regenerateSecret(webhook.id),
    })

  const handleTest = async (webhookId: string) => {
    try {
      await axiosInstance.post(`${PostEndpointUrl.TestWebhook}/${webhookId}/test`)
      toast({ title: "Test delivery sent", description: "It shows under Recent deliveries in a moment." })
      setTimeout(() => fetchLogs(webhookId, 1, true), 2000)
    } catch {
      // The interceptor's toast carries the server's reason.
    }
  }

  const fetchLogs = async (webhookId: string, page: number, replace: boolean) => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      const res = await axiosInstance.get(`${GetEndpointUrl.GetWebhookLogs}/${webhookId}/logs?page=${page}&page_size=${LOG_PAGE_SIZE}`)
      const newLogs: WebhookLog[] = res.data?.logs || []
      if (replace) setLogs(newLogs)
      else setLogs(prev => [...prev, ...newLogs])
      setLogsHasMore(newLogs.length === LOG_PAGE_SIZE)
      setLogsPage(page)
    } catch (e) {
      if (replace) setLogs([])
      setLogsError(apiErrorMessage(e, "Check your connection and try again."))
    } finally {
      setLogsLoading(false)
    }
  }

  const handleFetchLogs = async (webhookId: string) => {
    if (showLogs === webhookId) { setShowLogs(null); return }
    setShowLogs(webhookId)
    fetchLogs(webhookId, 1, true)
  }

  const handleLoadMore = () => {
    if (!showLogs || logsLoading) return
    fetchLogs(showLogs, logsPage + 1, false)
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: "Copied" })
    } catch {
      toast({ title: "Couldn't copy", description: "Select the text and copy it yourself.", variant: "destructive" })
    }
  }

  const prettyJson = (raw: string | undefined) => {
    if (!raw) return ""
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }

  const webhooks = webhookData?.webhooks || []
  const urlBase = incomingUrl("")

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base font-semibold">Webhooks</CardTitle>
              <span className="text-sm tabular-nums text-muted-foreground">
                {webhooks.length}
              </span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              An incoming webhook lets a script or a bot post into a channel. An outgoing one tells another service when something happens here.
            </CardDescription>
          </div>
          <Button size="sm" className="h-9 gap-2 shrink-0 self-start" onClick={() => dispatch(openUI({ key: "webhookCreate" }))}>
            <Plus className="h-4 w-4" />
            <span>New webhook</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {isLoading ? (
          <div role="status" aria-label="Loading webhooks">
            <SkeletonRows rows={3} />
          </div>
        ) : isError ? (
          <ErrorState subject="the webhooks" onRetry={() => void mutate()} />
        ) : webhooks.length === 0 ? (
          <EmptyState
            tone="accent"
            icon={Webhook}
            hue={ADMIN_GROUP_HUE.connections}
            title="No webhooks yet"
            description="Create an incoming webhook to let a bot post messages, or an outgoing one to tell another service when something happens."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {webhooks.map(webhook => (
              <li key={webhook.id}>
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {/* Which way it points is the information; an arrow in ink
                        says it without a tinted tile in a hue of its own. */}
                    <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
                      {webhook.type === "incoming" ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="truncate text-sm font-medium">{webhook.name}</h3>
                        <span className="text-xs text-muted-foreground">{webhook.type === "incoming" ? "Incoming" : "Outgoing"}</span>
                        <StateWord tone={webhook.is_active ? "ok" : "off"}>{webhook.is_active ? "Active" : "Turned off"}</StateWord>
                        {webhook.failure_count >= 5 && (
                          <StateWord tone="bad">{webhook.failure_count} failed deliveries</StateWord>
                        )}
                      </div>
                      {webhook.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{webhook.description}</p>}
                      {webhook.last_triggered_at && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Last used {shortDateTime(new Date(webhook.last_triggered_at))}</p>
                      )}
                    </div>
                  </div>
                  <div className="-ml-1 flex shrink-0 flex-wrap items-center gap-1 sm:ml-0">
                    {webhook.type === "outgoing" && (
                      <Button variant="ghost" size="icon" aria-label="Send a test delivery" className="h-8 w-8" onClick={() => handleTest(webhook.id)} title="Send a test delivery">
                        <PlayCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label="Edit this webhook" className="h-8 w-8" title="Edit" onClick={() => dispatch(openUI({ key: "webhookEdit", data: {
                      id: webhook.id, name: webhook.name, description: webhook.description,
                      type: webhook.type, target_url: webhook.target_url, channel_id: webhook.channel_id,
                      bot_name: webhook.bot_name, events: webhook.events, is_active: webhook.is_active,
                    }}))}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Show recent deliveries"
                      aria-expanded={showLogs === webhook.id}
                      className="h-8 w-8"
                      onClick={() => handleFetchLogs(webhook.id)}
                      title="Recent deliveries"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", showLogs === webhook.id && "rotate-180")} />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete this webhook" className="h-8 w-8 text-danger-ink hover:text-danger-ink" title="Delete" onClick={() => dispatch(openUI({ key: "webhookDelete", data: { id: webhook.id, name: webhook.name, type: webhook.type } }))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Label and value rows at one x, the task panel's layout:
                    quiet labels in a 6.5rem column, the value on one line. */}
                <div className="space-y-1.5 px-4 pb-3 sm:pl-11">
                  {webhook.type === "incoming" && (
                    <div className={fieldRow("center", "mb-0")}>
                      <span className={fieldLabel}>Webhook URL</span>
                      <div className="flex min-w-0 items-center gap-1">
                        <code className="min-w-0 flex-1 truncate rounded-sm bg-muted/50 px-2 py-1 font-mono text-xs" translate="no">
                          {urlBase === ""
                            ? "No API address is set on this server"
                            : tokenVisible[webhook.id]
                              ? incomingUrl(webhook.token)
                              : `${urlBase}••••••••`}
                        </code>
                        <Button aria-label="Copy webhook URL" variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          if (tokenVisible[webhook.id]) copyToClipboard(incomingUrl(webhook.token))
                        }} disabled={!tokenVisible[webhook.id] || urlBase === ""}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  )}
                  <div className={fieldRow("center", "mb-0")}>
                    <span className={fieldLabel}>Token</span>
                    <div className="flex min-w-0 items-center gap-1">
                      <code className="min-w-0 flex-1 truncate rounded-sm bg-muted/50 px-2 py-1 font-mono text-xs" translate="no">
                        {tokenVisible[webhook.id] ? webhook.token : "••••••••••••••••"}
                      </code>
                      <Button aria-label={tokenVisible[webhook.id] ? "Hide token" : "Show token"} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTokenVisible(v => ({ ...v, [webhook.id]: !v[webhook.id] }))}>
                        {tokenVisible[webhook.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button aria-label="Copy token" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(webhook.token)}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" aria-label="Regenerate the token" className="h-8 w-8" onClick={() => handleRegenerateToken(webhook)} title="Regenerate the token"><RefreshCw className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  {webhook.type === "outgoing" && webhook.secret && (
                    <div className={fieldRow("center", "mb-0")}>
                      <span className={fieldLabel}>Signing secret</span>
                      <div className="flex min-w-0 items-center gap-1">
                        <code className="min-w-0 flex-1 truncate rounded-sm bg-muted/50 px-2 py-1 font-mono text-xs" translate="no">
                          {secretVisible[webhook.id] ? webhook.secret : "••••••••••••••••"}
                        </code>
                        <Button aria-label={secretVisible[webhook.id] ? "Hide signing secret" : "Show signing secret"} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSecretVisible(v => ({ ...v, [webhook.id]: !v[webhook.id] }))}>
                          {secretVisible[webhook.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button aria-label="Copy signing secret" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(webhook.secret!)}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Regenerate the signing secret" className="h-8 w-8" onClick={() => handleRegenerateSecret(webhook)} title="Regenerate the signing secret"><RefreshCw className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  )}
                  {webhook.type === "outgoing" && webhook.target_url && (
                    <div className={fieldRow("center", "mb-0")}>
                      <span className={fieldLabel}>Sends to</span>
                      <div className="flex min-w-0 items-center gap-1">
                        <code className="min-w-0 flex-1 truncate rounded-sm bg-muted/50 px-2 py-1 font-mono text-xs" translate="no">{webhook.target_url}</code>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <a href={webhook.target_url} target="_blank" rel="noopener noreferrer" aria-label="Open the target in a new tab">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {showLogs === webhook.id && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">Recent deliveries</h4>
                    {logsLoading && logs.length === 0 ? (
                      <div role="status" aria-label="Loading deliveries">
                        <SkeletonRows rows={2} avatar={false} lines={1} />
                      </div>
                    ) : logsError && logs.length === 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p role="alert" className="text-xs text-danger-ink">
                          Couldn&apos;t load the deliveries. {logsError}
                        </p>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => fetchLogs(webhook.id, 1, true)}>
                          Try again
                        </Button>
                      </div>
                    ) : logs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No deliveries yet.</p>
                    ) : (
                      <div className="space-y-0.5">
                        {logs.map(log => (
                          <button
                            key={log.id}
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                          >
                            {log.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-ink" aria-label="Delivered" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-danger-ink" aria-label="Failed" />}
                            <Badge variant="outline" size="sm">{log.event_type}</Badge>
                            {log.response_status && <span className={cn("font-mono", log.response_status >= 200 && log.response_status < 300 ? "text-success-ink" : "text-danger-ink")}>{log.response_status}</span>}
                            {log.duration_ms !== undefined && <span className="text-muted-foreground tabular-nums">{log.duration_ms} ms</span>}
                            {log.error_message && <span className="flex-1 truncate text-danger-ink">{log.error_message}</span>}
                            <span className="ml-auto shrink-0 text-muted-foreground">{shortDateTime(new Date(log.created_at))}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {logsError && logs.length > 0 && (
                      <p role="alert" className="mt-2 text-xs text-danger-ink">Couldn&apos;t load more deliveries. {logsError}</p>
                    )}
                    {logsHasMore && (
                      <Button variant="ghost" size="sm" className="mt-2 h-8 w-full text-xs" onClick={handleLoadMore} disabled={logsLoading}>
                        {logsLoading ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> : null}{logsLoading ? "Loading…" : "Show more"}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Sheet open={!!selectedLog} onOpenChange={(o) => { if (!o) setSelectedLog(null) }}>
        <SheetContent className="sm:max-w-lg w-full flex flex-col">
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="flex items-center gap-2.5 text-base">
              <Tile hue={ADMIN_GROUP_HUE.connections} size="sm"><Terminal /></Tile>
              Delivery
            </SheetTitle>
            <SheetDescription asChild>
              <div>
                {selectedLog && (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" size="sm">{selectedLog.event_type}</Badge>
                    <span className="text-muted-foreground">{shortDateTime(new Date(selectedLog.created_at))}</span>
                    <StateWord tone={selectedLog.success ? "ok" : "bad"}>{selectedLog.success ? "Delivered" : "Failed"}</StateWord>
                  </span>
                )}
              </div>
            </SheetDescription>
          </SheetHeader>

          {selectedLog && (
            <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col mt-4">
              <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="response">Response</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-3 data-[state=active]:flex data-[state=active]:flex-col">
                <dl className="space-y-1.5 text-xs">
                  <div className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>Answer</dt>
                    <dd className={cn("font-mono font-medium", selectedLog.response_status && selectedLog.response_status >= 200 && selectedLog.response_status < 300 ? "text-success-ink" : "text-danger-ink")}>
                      {selectedLog.response_status ?? "Not recorded"}
                    </dd>
                  </div>
                  <div className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>Took</dt>
                    <dd className="font-medium tabular-nums">{selectedLog.duration_ms !== undefined ? `${selectedLog.duration_ms} ms` : "Not recorded"}</dd>
                  </div>
                  <div className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>Event</dt>
                    <dd className="font-medium">{selectedLog.event_type}</dd>
                  </div>
                  <div className={fieldRow("center", "mb-0")}>
                    <dt className={fieldLabel}>Delivery ID</dt>
                    <dd className="truncate font-mono text-2xs" translate="no">{selectedLog.id}</dd>
                  </div>
                </dl>
                {selectedLog.error_message && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2.5 text-xs text-danger-ink">
                    <span className="mb-0.5 block font-medium">What went wrong</span>
                    {selectedLog.error_message}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="request" className="flex-1 min-h-0 overflow-y-auto mt-3 data-[state=active]:flex data-[state=active]:flex-col">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileJson className="h-3.5 w-3.5" /> Request body
                  </span>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => copyToClipboard(prettyJson(selectedLog.request_body))}>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </Button>
                </div>
                <pre className="text-2xs bg-muted/40 p-3 rounded-md overflow-x-auto font-mono whitespace-pre-wrap flex-1">
                  {prettyJson(selectedLog.request_body) || "No request body was recorded."}
                </pre>
              </TabsContent>

              <TabsContent value="response" className="flex-1 min-h-0 overflow-y-auto mt-3 data-[state=active]:flex data-[state=active]:flex-col">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <FileJson className="h-3.5 w-3.5" /> Response body
                  </span>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => copyToClipboard(prettyJson(selectedLog.response_body))}>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </Button>
                </div>
                <pre className="text-2xs bg-muted/40 p-3 rounded-md overflow-x-auto font-mono whitespace-pre-wrap flex-1">
                  {prettyJson(selectedLog.response_body) || "No response body was recorded."}
                </pre>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  )
}

export default WebhooksCard
