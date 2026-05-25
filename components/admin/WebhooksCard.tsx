"use client"

import React, { useState } from "react"
import { useDispatch } from "react-redux"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, RefreshCw, Copy, Eye, EyeOff, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, Pencil, Terminal } from "@/lib/icons";
import { Webhook, PlayCircle, ExternalLink, ArrowDownToLine, ArrowUpFromLine, FileJson } from "lucide-react";
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { openUI } from "@/store/slice/uiSlice"
import axiosInstance from "@/lib/axiosInstance"

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

const WebhooksCard = () => {
  const dispatch = useDispatch()
  const { data: webhookData, isLoading, mutate } = useFetch<{ webhooks: WebhookItem[] }>(GetEndpointUrl.GetAllWebhooks)
  const post = usePost()
  const { toast } = useToast()

  const [showLogs, setShowLogs] = useState<string | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsHasMore, setLogsHasMore] = useState(false)
  const [tokenVisible, setTokenVisible] = useState<Record<string, boolean>>({})
  const [secretVisible, setSecretVisible] = useState<Record<string, boolean>>({})
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)

  const handleRegenerateToken = async (webhookId: string) => {
    try {
      await axiosInstance.post(`${PostEndpointUrl.RegenerateWebhookToken}/${webhookId}/regenerate-token`)
      toast({ title: "Token regenerated", description: "New token has been generated. Update your integrations." })
      mutate()
    } catch {
      // Error toast handled by axios interceptor
    }
  }

  const handleRegenerateSecret = async (webhookId: string) => {
    try {
      await axiosInstance.post(`${PostEndpointUrl.RegenerateWebhookSecret}/${webhookId}/regenerate-secret`)
      toast({ title: "Secret regenerated", description: "New signing secret has been generated." })
      mutate()
    } catch {
      // Error toast handled by axios interceptor
    }
  }

  const handleTest = async (webhookId: string) => {
    try {
      await axiosInstance.post(`${PostEndpointUrl.TestWebhook}/${webhookId}/test`)
      toast({ title: "Test sent", description: "A test event has been dispatched" })
      setTimeout(() => fetchLogs(webhookId, 1, true), 2000)
    } catch {
      // Error toast handled by axios interceptor
    }
  }

  const fetchLogs = async (webhookId: string, page: number, replace: boolean) => {
    setLogsLoading(true)
    try {
      const res = await axiosInstance.get(`${GetEndpointUrl.GetWebhookLogs}/${webhookId}/logs?page=${page}&page_size=${LOG_PAGE_SIZE}`)
      const newLogs: WebhookLog[] = res.data?.logs || []
      if (replace) setLogs(newLogs)
      else setLogs(prev => [...prev, ...newLogs])
      setLogsHasMore(newLogs.length === LOG_PAGE_SIZE)
      setLogsPage(page)
    } catch {
      if (replace) setLogs([])
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
      toast({ title: "Copied", description: "Copied to clipboard" })
    } catch {
      toast({ title: "Error", description: "Failed to copy", variant: "destructive" })
    }
  }

  const getWebhookUrl = (token: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080"
    return `${backendUrl}/webhook/incoming/${token}`
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

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 p-1.5 rounded-md">
                <Webhook className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">Webhooks</CardTitle>
              <span className="text-xs font-medium text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                {webhooks.length}
              </span>
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              Manage incoming and outgoing webhooks for bots, AI agents, and external integrations.
            </CardDescription>
          </div>
          <Button size="sm" className="h-9 gap-2 shrink-0 self-start" onClick={() => dispatch(openUI({ key: "webhookCreate" }))}>
            <Plus className="h-4 w-4" />
            <span>Create Webhook</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 overflow-y-auto pr-4 custom-scrollbar pb-10 min-h-0">
        {isLoading ? (
          <div className="text-sm text-muted-foreground animate-pulse">Loading webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Webhook className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">No webhooks configured</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create an incoming webhook to let bots post messages, or an outgoing webhook to notify external services.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map(webhook => (
              <div key={webhook.id} className="border border-border/50 rounded-lg bg-card/50 backdrop-blur-sm overflow-hidden">
                <div className="p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${webhook.type === "incoming" ? "bg-blue-500/10" : "bg-orange-500/10"}`}>
                      {webhook.type === "incoming" ? (
                        <ArrowDownToLine className={`h-4 w-4 ${webhook.is_active ? "text-blue-500" : "text-muted-foreground"}`} />
                      ) : (
                        <ArrowUpFromLine className={`h-4 w-4 ${webhook.is_active ? "text-orange-500" : "text-muted-foreground"}`} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm truncate">{webhook.name}</h3>
                        <Badge variant={webhook.is_active ? "default" : "secondary"} className="text-xs">{webhook.is_active ? "Active" : "Disabled"}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{webhook.type}</Badge>
                        {webhook.failure_count >= 5 && (
                          <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />{webhook.failure_count} failures</Badge>
                        )}
                      </div>
                      {webhook.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{webhook.description}</p>}
                      {webhook.last_triggered_at && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />Last triggered: {new Date(webhook.last_triggered_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap shrink-0 -ml-1 sm:ml-0">
                    {webhook.type === "outgoing" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleTest(webhook.id)} title="Send test event">
                        <PlayCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => dispatch(openUI({ key: "webhookEdit", data: {
                      id: webhook.id, name: webhook.name, description: webhook.description,
                      type: webhook.type, target_url: webhook.target_url, channel_id: webhook.channel_id,
                      bot_name: webhook.bot_name, events: webhook.events, is_active: webhook.is_active,
                    }}))}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleFetchLogs(webhook.id)} title="View logs">
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLogs === webhook.id ? "rotate-180" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => dispatch(openUI({ key: "webhookDelete", data: { id: webhook.id, name: webhook.name, type: webhook.type } }))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="px-4 pb-3 space-y-2">
                  {webhook.type === "incoming" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Webhook URL</span>
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded flex-1 truncate font-mono">
                        {tokenVisible[webhook.id] ? getWebhookUrl(webhook.token) : `${getWebhookUrl("")}••••••••`}
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        if (tokenVisible[webhook.id]) {
                          copyToClipboard(getWebhookUrl(webhook.token))
                        }
                      }} disabled={!tokenVisible[webhook.id]}><Copy className="h-3 w-3" /></Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Token</span>
                    <code className="text-xs bg-muted/50 px-2 py-1 rounded flex-1 truncate font-mono">
                      {tokenVisible[webhook.id] ? webhook.token : "••••••••••••••••"}
                    </code>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTokenVisible(v => ({ ...v, [webhook.id]: !v[webhook.id] }))}>
                      {tokenVisible[webhook.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(webhook.token)}><Copy className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRegenerateToken(webhook.id)} title="Regenerate token"><RefreshCw className="h-3 w-3" /></Button>
                  </div>
                  {webhook.type === "outgoing" && webhook.secret && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Secret</span>
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded flex-1 truncate font-mono">
                        {secretVisible[webhook.id] ? webhook.secret : "••••••••••••••••"}
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSecretVisible(v => ({ ...v, [webhook.id]: !v[webhook.id] }))}>
                        {secretVisible[webhook.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(webhook.secret!)}><Copy className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRegenerateSecret(webhook.id)} title="Regenerate secret"><RefreshCw className="h-3 w-3" /></Button>
                    </div>
                  )}
                  {webhook.type === "outgoing" && webhook.target_url && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Target</span>
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded flex-1 truncate font-mono">{webhook.target_url}</code>
                      <a href={webhook.target_url} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon" className="h-6 w-6"><ExternalLink className="h-3 w-3" /></Button></a>
                    </div>
                  )}
                </div>

                {showLogs === webhook.id && (
                  <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Recent Logs</h4>
                    {logsLoading && logs.length === 0 ? (
                      <div className="text-xs text-muted-foreground animate-pulse">Loading logs...</div>
                    ) : logs.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No logs yet</div>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {logs.map(log => (
                          <button
                            key={log.id}
                            onClick={() => setSelectedLog(log)}
                            className="w-full flex items-center gap-2 text-xs py-1.5 px-1.5 rounded hover:bg-muted/40 text-left transition-colors"
                          >
                            {log.success ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                            <Badge variant="outline" className="text-[10px] px-1.5">{log.event_type}</Badge>
                            {log.response_status && <span className={`font-mono ${log.response_status >= 200 && log.response_status < 300 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{log.response_status}</span>}
                            {log.duration_ms !== undefined && <span className="text-muted-foreground">{log.duration_ms}ms</span>}
                            {log.error_message && <span className="text-red-500 truncate flex-1">{log.error_message}</span>}
                            <span className="text-muted-foreground ml-auto flex-shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {logsHasMore && (
                      <Button variant="ghost" size="sm" className="text-xs mt-2 w-full" onClick={handleLoadMore} disabled={logsLoading}>
                        {logsLoading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}Load More
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={!!selectedLog} onOpenChange={(o) => { if (!o) setSelectedLog(null) }}>
        <SheetContent className="sm:max-w-lg w-full flex flex-col">
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-4 w-4" />
              Delivery Log
            </SheetTitle>
            <SheetDescription>
              {selectedLog && (
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{selectedLog.event_type}</Badge>
                  <span className="text-muted-foreground">{new Date(selectedLog.created_at).toLocaleString()}</span>
                  {selectedLog.success ? (
                    <Badge variant="default" className="text-[10px] bg-green-600">Success</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">Failed</Badge>
                  )}
                </span>
              )}
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
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-muted/40 p-2.5 rounded-md">
                    <span className="text-muted-foreground block mb-0.5">Status</span>
                    <span className={`font-mono font-medium ${selectedLog.response_status && selectedLog.response_status >= 200 && selectedLog.response_status < 300 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {selectedLog.response_status ?? "—"}
                    </span>
                  </div>
                  <div className="bg-muted/40 p-2.5 rounded-md">
                    <span className="text-muted-foreground block mb-0.5">Duration</span>
                    <span className="font-medium">{selectedLog.duration_ms !== undefined ? `${selectedLog.duration_ms}ms` : "—"}</span>
                  </div>
                  <div className="bg-muted/40 p-2.5 rounded-md">
                    <span className="text-muted-foreground block mb-0.5">Event Type</span>
                    <span className="font-medium">{selectedLog.event_type}</span>
                  </div>
                  <div className="bg-muted/40 p-2.5 rounded-md">
                    <span className="text-muted-foreground block mb-0.5">Log ID</span>
                    <span className="font-mono text-[10px] truncate block">{selectedLog.id}</span>
                  </div>
                </div>
                {selectedLog.error_message && (
                  <div className="bg-destructive/10 text-destructive px-3 py-2.5 rounded-md text-xs">
                    <span className="font-semibold block mb-0.5">Error</span>
                    {selectedLog.error_message}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="request" className="flex-1 min-h-0 overflow-y-auto mt-3 data-[state=active]:flex data-[state=active]:flex-col">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FileJson className="h-3.5 w-3.5" /> Request Body
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(prettyJson(selectedLog.request_body))}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <pre className="text-[11px] bg-muted/40 p-3 rounded-md overflow-x-auto font-mono whitespace-pre-wrap flex-1">
                  {prettyJson(selectedLog.request_body) || "No request body recorded"}
                </pre>
              </TabsContent>

              <TabsContent value="response" className="flex-1 min-h-0 overflow-y-auto mt-3 data-[state=active]:flex data-[state=active]:flex-col">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FileJson className="h-3.5 w-3.5" /> Response Body
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(prettyJson(selectedLog.response_body))}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <pre className="text-[11px] bg-muted/40 p-3 rounded-md overflow-x-auto font-mono whitespace-pre-wrap flex-1">
                  {prettyJson(selectedLog.response_body) || "No response body recorded"}
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
