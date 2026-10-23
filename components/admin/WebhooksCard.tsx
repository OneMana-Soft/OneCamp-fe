"use client"

/**
 * Webhooks (design v3, admin §A20). Each webhook is one 56px row in the
 * settings card: its name, its address in mono with the middle elided, up to
 * three neutral event chips and "+N", how its last delivery went as a dot and
 * a word, a switch that saves on change, and a ⋯ for the rest. Its
 * credentials and recent deliveries open under the row, so the list reads as
 * a list and not a wall of tokens.
 */

import { useState } from "react"
import { useDispatch } from "react-redux"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, RefreshCw, Copy, Eye, EyeOff, CheckCircle2, XCircle, ChevronDown, Pencil, Terminal } from "@/lib/icons";
import { PlayCircle, ExternalLink, ArrowDownToLine, ArrowUpFromLine, FileJson, ListChecks } from "lucide-react";
import { useFetch } from "@/hooks/useFetch"
import { AdminGet, AdminPost } from "@/services/endpoints/admin"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { openUI } from "@/store/slice/uiSlice"
import axiosInstance from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { cn } from "@/lib/utils/helpers/cn"
import { SpotPlug } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { NeutralChip, RowMenu, StateWord } from "@/components/admin/connectParts"
import { deliveryState, eventChips, parseEvents, pausedWhy, shortUrl } from "@/components/admin/webhookParts"
import { AddressReveal, incomingUrl } from "@/components/admin/webhookAddress"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SaysLoadFailure } from "@/lib/http/loadFailure"

interface WebhookItem {
  id: string
  name: string
  description?: string
  type: "incoming" | "outgoing"
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
  scope_type?: string
  paused_at?: string
  paused_reason?: string
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
 * A credential's buttons, in three slots that every row keeps: show or hide,
 * copy, and regenerate or open. The value before them ended where its own
 * buttons began (one on the URL, three on the token), so the values stopped at
 * different x and the copy buttons sat in different columns.
 */
function CredentialActions({ children }: { children: [React.ReactNode, React.ReactNode, React.ReactNode] }) {
  return (
    <div data-credential-actions="" className="grid w-24 shrink-0 grid-cols-3">
      {children.map((slot, i) => slot ?? <span key={i} aria-hidden="true" className="h-8 w-8" />)}
    </div>
  )
}

/** A credential's value: mono 12.5 on the sunken surface with an inset ring (§1.4), ending where the slots begin. */
const credentialValue = "cx-wh-code min-w-0 flex-1 truncate"

/** One row while the list loads, in a loaded row's shape: name and address, chips, state, switch, ⋯. */
function WebhookRowSkeleton() {
  return (
    <li data-webhook-skeleton-row="" aria-hidden="true" className="cx-wh-row">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      <Skeleton className="hidden h-[22px] w-24 rounded-sm md:block" />
      <Skeleton className="hidden h-3 w-24 sm:block" />
      <Skeleton className="h-4 w-7 rounded-full" />
      <Skeleton className="size-8 rounded-md" />
    </li>
  )
}

/**
 * The first row under a delivery's tabs, the same on all three, so switching
 * tabs moves nothing but the content: Request and Response opened with this
 * row and Overview did not, so its first line sat 40px higher.
 */
function DeliveryToolbar({ icon: Icon, label, action }: { icon: React.ComponentType<{ className?: string }>; label: string; action: React.ReactNode }) {
  return (
    <div data-delivery-toolbar="" className="mb-2 flex h-8 shrink-0 items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      {action}
    </div>
  )
}

const WebhooksCard = () => {
  const dispatch = useDispatch()
  const { data: webhookData, isLoading, isError, mutate } = useFetch<{ webhooks: WebhookItem[] }>(AdminGet.GetAllWebhooks)
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
  // A regenerated token, shown once: it is kept only as its hash (audit A1).
  // Kept once closed, so the dialog keeps its words while it animates out.
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null)
  const [revealOpen, setRevealOpen] = useState(false)
  const [secretVisible, setSecretVisible] = useState<Record<string, boolean>>({})
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)
  // The switch's answer before the list re-reads: on at once, back if refused.
  const [activeOverride, setActiveOverride] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const regenerateToken = async (webhook: WebhookItem) => {
    try {
      const res = await axiosInstance.post(`${AdminPost.RegenerateWebhookToken}/${webhook.id}/regenerate-token`)
      if (res.data?.token) {
        setRevealed({ name: webhook.name, token: res.data.token })
        setRevealOpen(true)
      }
      mutate()
    } catch {
      // The interceptor's toast carries the server's reason.
    }
  }

  const regenerateSecret = async (webhookId: string) => {
    try {
      await axiosInstance.post(`${AdminPost.RegenerateWebhookSecret}/${webhookId}/regenerate-secret`)
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
      onConfirm: () => void regenerateToken(webhook),
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
      await axiosInstance.post(`${AdminPost.TestWebhook}/${webhookId}/test`)
      toast({ title: "Test delivery sent", description: "It shows under Recent deliveries in a moment." })
      setShowLogs(webhookId)
      setTimeout(() => fetchLogs(webhookId, 1, true), 2000)
    } catch {
      // The interceptor's toast carries the server's reason.
    }
  }

  // A paused webhook's deliveries go again; the server says whether the admin
  // took it over, or why they can't.
  const resume = async (webhook: WebhookItem) => {
    setSaving((m) => ({ ...m, [webhook.id]: true }))
    try {
      const res = await axiosInstance.post(`${AdminPost.UpdateWebhook}/${webhook.id}/resume`)
      toast({ title: `${webhook.name} resumed`, description: res.data?.msg, tone: "success" })
      await mutate()
    } catch {
      // The interceptor's toast carries the server's reason.
    } finally {
      setSaving((m) => ({ ...m, [webhook.id]: false }))
    }
  }

  // The switch saves on change with the same fields the edit dialog sends, so
  // nothing else about the webhook is cleared by a partial update.
  const setActive = async (webhook: WebhookItem, on: boolean) => {
    setActiveOverride((m) => ({ ...m, [webhook.id]: on }))
    setSaving((m) => ({ ...m, [webhook.id]: true }))
    const events = parseEvents(webhook.events)
    try {
      await axiosInstance.put(`${AdminPost.UpdateWebhook}/${webhook.id}`, {
        name: webhook.name,
        description: webhook.description || undefined,
        target_url: webhook.target_url || undefined,
        channel_id: webhook.type === "incoming" && webhook.channel_id ? webhook.channel_id : undefined,
        bot_name: webhook.bot_name || "Webhook Bot",
        events: events.length > 0 ? events : undefined,
        is_active: on,
      })
      await mutate()
    } catch {
      // Back to what it was; the interceptor's toast carries the reason.
      setActiveOverride((m) => ({ ...m, [webhook.id]: !on }))
    } finally {
      setSaving((m) => ({ ...m, [webhook.id]: false }))
    }
  }

  const fetchLogs = async (webhookId: string, page: number, replace: boolean) => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      const res = await axiosInstance.get(`${AdminGet.GetWebhookLogs}/${webhookId}/logs?page=${page}&page_size=${LOG_PAGE_SIZE}`)
      const newLogs: WebhookLog[] = res.data?.logs || []
      if (replace) setLogs(newLogs)
      else setLogs(prev => [...prev, ...newLogs])
      setLogsHasMore(newLogs.length === LOG_PAGE_SIZE)
      setLogsPage(page)
    } catch (e) {
      if (replace) setLogs([])
      setLogsError(apiErrorMessage(e, "Try again in a moment."))
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
  const loaded = !isLoading && !isError && !!webhookData

  const openEdit = (webhook: WebhookItem) =>
    dispatch(openUI({ key: "webhookEdit", data: {
      id: webhook.id, name: webhook.name, description: webhook.description,
      type: webhook.type, target_url: webhook.target_url, channel_id: webhook.channel_id,
      bot_name: webhook.bot_name, events: webhook.events, is_active: webhook.is_active,
    }}))
  const openDelete = (webhook: WebhookItem) =>
    dispatch(openUI({ key: "webhookDelete", data: { id: webhook.id, name: webhook.name, type: webhook.type, last_triggered_at: webhook.last_triggered_at } }))

  return (
    <SettingsSection
      title={
        <>
          {"Webhooks "}
          {loaded && <span className="ml-1 text-sm font-normal tabular-nums text-muted-foreground">{webhooks.length}</span>}
        </>
      }
      description="An incoming webhook lets a script or a bot post into a channel. An outgoing one tells another service when something happens here."
      action={
        <Button size="sm" className={cn(sectionActionClass, "gap-1.5")} onClick={() => dispatch(openUI({ key: "webhookCreate" }))}>
          <Plus className="h-4 w-4" />
          New webhook
        </Button>
      }
    >
      {isLoading ? (
        <ul role="status" aria-label="Loading webhooks" className="set-card">
          {[0, 1, 2].map((i) => (
            <WebhookRowSkeleton key={i} />
          ))}
        </ul>
      ) : isError ? (
        <ErrorState
          compact
          subject="the webhooks"
          detail={apiErrorMessage(isError) || undefined}
          onRetry={() => void mutate()}
        />
      ) : webhooks.length === 0 ? (
        // A first run, in the card: the plug spot, the muted size every admin
        // empty state uses, and the one way forward.
        <div className="set-card">
          <EmptyState
            illustration={<SpotPlug hue={ADMIN_GROUP_HUE.connections} />}
            title="No webhooks yet"
            description="Create an incoming webhook to let a bot post messages, or an outgoing one to tell another service when something happens."
            action={
              <Button size="sm" variant="secondary" onClick={() => dispatch(openUI({ key: "webhookCreate" }))}>
                <Plus /> New webhook
              </Button>
            }
          />
        </div>
      ) : (
        <ul aria-label="Webhooks" className="set-card">
          {webhooks.map(webhook => {
            const active = activeOverride[webhook.id] ?? webhook.is_active
            const state = deliveryState({ ...webhook, is_active: active })
            const events = eventChips(parseEvents(webhook.events))
            const address =
              webhook.type === "outgoing"
                ? webhook.target_url
                  ? shortUrl(webhook.target_url)
                  : "No address yet"
                : urlBase === ""
                  ? "No API address is set on this server"
                  : shortUrl(`${urlBase}••••••••`)
            const open = showLogs === webhook.id
            const why = webhook.type === "outgoing" ? pausedWhy(webhook) : null
            return (
            <li key={webhook.id} data-webhook-row="" className="cx-wh-item">
              <div className="cx-wh-row">
                {/* Which way it points: an arrow in ink-3, no tinted tile. */}
                <span className="cx-wh-dir" aria-hidden="true">
                  {webhook.type === "incoming" ? <ArrowDownToLine /> : <ArrowUpFromLine />}
                </span>
                <div className="cx-wh-words min-w-0">
                  <h3 className="truncate text-sm font-medium text-foreground">
                    {webhook.name}
                    <span className="sr-only">, {webhook.type === "incoming" ? "incoming" : "outgoing"}</span>
                  </h3>
                  <p data-webhook-url="" className="truncate font-mono text-2xs text-muted-foreground" translate="no" title={webhook.type === "outgoing" ? webhook.target_url : undefined}>
                    {address}
                  </p>
                  {why && (
                    <p data-webhook-paused="" className="flex flex-wrap items-center gap-x-2 text-2xs text-warning-ink">
                      <span>{why}</span>
                      <Button
                        variant="link"
                        size="sm"
                        // A 24px target for a finger; the word stays small.
                        className="-my-1 h-6 px-1 text-2xs"
                        disabled={saving[webhook.id]}
                        aria-label={`Resume ${webhook.name}`}
                        onClick={() => void resume(webhook)}
                      >
                        Resume
                      </Button>
                    </p>
                  )}
                </div>
                {webhook.type === "outgoing" && (
                  <div data-webhook-events="" className="cx-wh-events">
                    {events.shown.length === 0 ? (
                      <NeutralChip>Every event</NeutralChip>
                    ) : (
                      events.shown.map((ev) => (
                        <NeutralChip key={ev} className="font-mono">
                          {ev}
                        </NeutralChip>
                      ))
                    )}
                    {events.more > 0 && (
                      <span data-webhook-more="" className="text-2xs font-medium tabular-nums text-muted-foreground">
                        +{events.more}
                      </span>
                    )}
                  </div>
                )}
                <StateWord tone={state.tone} className="cx-wh-state">
                  {state.word}
                </StateWord>
                <Switch
                  checked={active}
                  disabled={saving[webhook.id]}
                  aria-busy={saving[webhook.id] || undefined}
                  aria-label={`${webhook.name} is on`}
                  onCheckedChange={(v) => void setActive(webhook, v)}
                  className="cx-wh-switch shrink-0"
                />
                <div className="cx-wh-actions">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Show recent deliveries"
                    aria-expanded={open}
                    className="size-11 md:size-8"
                    onClick={() => handleFetchLogs(webhook.id)}
                    title="Credentials and recent deliveries"
                  >
                    <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                  </Button>
                  <RowMenu
                    label={`More for ${webhook.name}`}
                    items={[
                      { label: "Edit", icon: Pencil, onSelect: () => openEdit(webhook) },
                      ...(webhook.type === "outgoing"
                        ? [{ label: "Send a test delivery", icon: PlayCircle, onSelect: () => void handleTest(webhook.id) }]
                        : []),
                      { label: "Delete", icon: Trash2, destructive: true, separated: true, onSelect: () => openDelete(webhook) },
                    ]}
                  />
                </div>
              </div>

              {open && (
                <div data-webhook-detail="" className="cx-wh-detail">
                  {webhook.description && <p className="text-xs text-muted-foreground">{webhook.description}</p>}
                  {webhook.last_triggered_at && (
                    <p className="text-xs text-muted-foreground">Last used {shortDateTime(new Date(webhook.last_triggered_at))}</p>
                  )}
                  {/* Label and value rows at one x, the task panel's layout. */}
                  <div className="space-y-2">
                    {webhook.type === "incoming" && (
                      <div className={fieldRow("center", "mb-0")}>
                        <span className={fieldLabel}>Webhook URL</span>
                        <div className="flex min-w-0 items-center gap-2">
                          {/* Kept only as its hash (audit A1): shown once, when it is made. */}
                          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                            {urlBase === "" ? "No API address is set on this server" : "Hidden. Regenerate to get a new one."}
                          </span>
                          <CredentialActions>
                            {null}
                            {null}
                            <Button variant="ghost" size="icon" aria-label="Regenerate the token" className="h-8 w-8" onClick={() => handleRegenerateToken(webhook)} title="Regenerate the token"><RefreshCw className="h-4 w-4" /></Button>
                          </CredentialActions>
                        </div>
                      </div>
                    )}
                    {webhook.type === "outgoing" && webhook.secret && (
                      <div className={fieldRow("center", "mb-0")}>
                        <span className={fieldLabel}>Signing secret</span>
                        <div className="flex min-w-0 items-center gap-2">
                          <code className={credentialValue} translate="no">
                            {secretVisible[webhook.id] ? webhook.secret : "••••••••••••••••"}
                          </code>
                          <CredentialActions>
                            <Button aria-label={secretVisible[webhook.id] ? "Hide signing secret" : "Show signing secret"} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSecretVisible(v => ({ ...v, [webhook.id]: !v[webhook.id] }))}>
                              {secretVisible[webhook.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button aria-label="Copy signing secret" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(webhook.secret!)}><Copy className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" aria-label="Regenerate the signing secret" className="h-8 w-8" onClick={() => handleRegenerateSecret(webhook)} title="Regenerate the signing secret"><RefreshCw className="h-4 w-4" /></Button>
                          </CredentialActions>
                        </div>
                      </div>
                    )}
                    {webhook.type === "outgoing" && webhook.target_url && (
                      <div className={fieldRow("center", "mb-0")}>
                        <span className={fieldLabel}>Sends to</span>
                        <div className="flex min-w-0 items-center gap-2">
                          <code className={credentialValue} translate="no">{webhook.target_url}</code>
                          <CredentialActions>
                            {null}
                            {null}
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                              <a href={webhook.target_url} target="_blank" rel="noopener noreferrer" aria-label="Open the target in a new tab">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </CredentialActions>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-medium text-muted-foreground">Recent deliveries</h4>
                    {logsLoading && logs.length === 0 ? (
                      <div role="status" aria-label="Loading deliveries">
                        <SkeletonRows rows={2} avatar={false} lines={1} />
                      </div>
                    ) : logsError && logs.length === 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p role="alert" className="text-xs text-danger-ink">
                          Couldn&apos;t load the deliveries. {logsError}<SaysLoadFailure />
                        </p>
                        <Button variant="secondary" size="sm" onClick={() => fetchLogs(webhook.id, 1, true)}>
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
                            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                          >
                            {log.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-ink" aria-label="Delivered" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-danger-ink" aria-label="Failed" />}
                            <NeutralChip className="font-mono">{log.event_type}</NeutralChip>
                            {log.response_status && <span className={cn("font-mono", log.response_status >= 200 && log.response_status < 300 ? "text-success-ink" : "text-danger-ink")}>{log.response_status}</span>}
                            {log.duration_ms !== undefined && <span className="text-muted-foreground tabular-nums">{log.duration_ms} ms</span>}
                            {log.error_message && <span className="flex-1 truncate text-danger-ink">{log.error_message}</span>}
                            <span className="ml-auto shrink-0 text-muted-foreground">{shortDateTime(new Date(log.created_at))}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {logsError && logs.length > 0 && (
                      <p role="alert" className="mt-2 text-xs text-danger-ink">Couldn&apos;t load more deliveries. {logsError}<SaysLoadFailure /></p>
                    )}
                    {logsHasMore && (
                      <Button variant="ghost" size="sm" className="mt-2 h-8 w-full text-xs" onClick={handleLoadMore} disabled={logsLoading}>
                        {logsLoading ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" /> : null}{logsLoading ? "Loading…" : "Show more"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
            )
          })}
        </ul>
      )}

      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{revealed?.name}: its new address</DialogTitle>
            <DialogDescription>The old one has stopped working. Give this one to the service that posts here.</DialogDescription>
          </DialogHeader>
          {revealed && <AddressReveal token={revealed.token} />}
          <DialogFooter>
            <Button onClick={() => setRevealOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedLog} onOpenChange={(o) => { if (!o) setSelectedLog(null) }}>
        <SheetContent className="sm:max-w-lg w-full flex flex-col">
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="flex items-center gap-2.5 text-base">
              <Terminal className="size-4 text-ink-3" aria-hidden="true" />
              Delivery
            </SheetTitle>
            <SheetDescription asChild>
              <div>
                {selectedLog && (
                  <span className="flex flex-wrap items-center gap-2">
                    <NeutralChip className="font-mono">{selectedLog.event_type}</NeutralChip>
                    <span className="text-muted-foreground">{shortDateTime(new Date(selectedLog.created_at))}</span>
                    <StateWord tone={selectedLog.success ? "success" : "danger"}>{selectedLog.success ? "Delivered" : "Failed"}</StateWord>
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

              <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto mt-3 data-[state=active]:flex data-[state=active]:flex-col">
                <DeliveryToolbar
                  icon={ListChecks}
                  label="Summary"
                  action={
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => copyToClipboard(selectedLog.id)}>
                      <Copy className="mr-1 h-3 w-3" /> Copy ID
                    </Button>
                  }
                />
                <dl className="space-y-2">
                  <div className={fieldRow("center", "mb-0 min-h-8")}>
                    <dt className={fieldLabel}>Answer</dt>
                    <dd className={cn("font-mono text-sm font-medium", selectedLog.response_status && selectedLog.response_status >= 200 && selectedLog.response_status < 300 ? "text-success-ink" : "text-danger-ink")}>
                      {selectedLog.response_status ?? "Not recorded"}
                    </dd>
                  </div>
                  <div className={fieldRow("center", "mb-0 min-h-8")}>
                    <dt className={fieldLabel}>Took</dt>
                    <dd className="text-sm tabular-nums">{selectedLog.duration_ms !== undefined ? `${selectedLog.duration_ms} ms` : "Not recorded"}</dd>
                  </div>
                  <div className={fieldRow("center", "mb-0 min-h-8")}>
                    <dt className={fieldLabel}>Event</dt>
                    <dd className="text-sm">{selectedLog.event_type}</dd>
                  </div>
                  <div className={fieldRow("center", "mb-0 min-h-8")}>
                    <dt className={fieldLabel}>Delivery ID</dt>
                    <dd className="truncate font-mono text-xs" translate="no">{selectedLog.id}</dd>
                  </div>
                </dl>
                {selectedLog.error_message && (
                  <div className="cx-wh-code mt-3 px-3 py-2.5 font-sans text-xs text-danger-ink">
                    <span className="mb-0.5 block font-medium">What went wrong</span>
                    {selectedLog.error_message}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="request" className="flex-1 min-h-0 overflow-y-auto mt-3 data-[state=active]:flex data-[state=active]:flex-col">
                <DeliveryToolbar
                  icon={FileJson}
                  label="Request body"
                  action={
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => copyToClipboard(prettyJson(selectedLog.request_body))}>
                      <Copy className="mr-1 h-3 w-3" /> Copy
                    </Button>
                  }
                />
                <pre className="cx-wh-code cx-wh-pre p-3 overflow-x-auto font-mono whitespace-pre-wrap flex-1">
                  {prettyJson(selectedLog.request_body) || "No request body was recorded."}
                </pre>
              </TabsContent>

              <TabsContent value="response" className="flex-1 min-h-0 overflow-y-auto mt-3 data-[state=active]:flex data-[state=active]:flex-col">
                <DeliveryToolbar
                  icon={FileJson}
                  label="Response body"
                  action={
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => copyToClipboard(prettyJson(selectedLog.response_body))}>
                      <Copy className="mr-1 h-3 w-3" /> Copy
                    </Button>
                  }
                />
                <pre className="cx-wh-code cx-wh-pre p-3 overflow-x-auto font-mono whitespace-pre-wrap flex-1">
                  {prettyJson(selectedLog.response_body) || "No response body was recorded."}
                </pre>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </SettingsSection>
  )
}

export default WebhooksCard
