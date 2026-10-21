"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RefreshCw } from "@/lib/icons";
import { usePost } from "@/hooks/usePost"
import { useFetch } from "@/hooks/useFetch"
import { AdminGet, AdminPost } from "@/services/endpoints/admin"
import { useEveryChannel } from "@/components/admin/useEveryChannel"
import { WebhookScopeFields, scopePayload, scopeProblem } from "@/components/admin/WebhookScopeFields"
import { FALLBACK_EVENT_TYPES, WebhookEventChoice } from "@/components/admin/WebhookCreateDialog"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { StateWord } from "@/components/admin/connectParts"
import { PlayCircle } from "lucide-react"

interface TestDelivery {
  event_type: string
  request_body?: string
  response_status?: number
  response_body?: string
  success: boolean
  duration_ms?: number
  error_message?: string
}

const pretty = (raw?: string) => {
  if (!raw) return ""
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/**
 * Send a test (design v3, admin §A20): fires the test event and shows what
 * went and what came back, in mono, with the answer's status as a dot and a
 * word. The test endpoint answers before the delivery is logged, so it reads
 * the newest log entry a moment later.
 */
function SendTest({ webhookId }: { webhookId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle")
  const [delivery, setDelivery] = useState<TestDelivery | null>(null)
  const [problem, setProblem] = useState("")
  const send = async () => {
    setState("sending")
    setProblem("")
    setDelivery(null)
    try {
      await axiosInstance.post(`${AdminPost.TestWebhook}/${webhookId}/test`)
      await new Promise((r) => setTimeout(r, 1500))
      const res = await axiosInstance.get(`${AdminGet.GetWebhookLogs}/${webhookId}/logs?page=1&page_size=1`)
      const log: TestDelivery | undefined = res.data?.logs?.[0]
      if (log) {
        setDelivery(log)
        setState("done")
      } else {
        setProblem("Sent. The delivery isn't in the log yet; it shows under Recent deliveries in a moment.")
        setState("failed")
      }
    } catch (e) {
      setProblem(apiErrorMessage(e, "Couldn't send the test. Try again."))
      setState("failed")
    }
  }
  const status = delivery?.response_status
  return (
    <div data-send-test="" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Send a test</p>
          <p className="text-xs text-muted-foreground">Sends a test event to the address saved now.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={send} disabled={state === "sending"} aria-busy={state === "sending" || undefined}>
          {state === "sending" ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <PlayCircle aria-hidden="true" />}
          {state === "sending" ? "Sending…" : "Send a test"}
        </Button>
      </div>
      {problem && (
        <p role="status" className="text-xs text-muted-foreground">
          {problem}
        </p>
      )}
      {delivery && (
        <div className="space-y-2" aria-live="polite">
          <StateWord tone={delivery.success ? "success" : "danger"}>
            {status ? `${status} · ` : ""}
            {delivery.success ? "Delivered" : "Failed"}
            {delivery.duration_ms !== undefined ? ` · ${delivery.duration_ms} ms` : ""}
          </StateWord>
          {delivery.error_message && <p className="text-xs text-danger-ink">{delivery.error_message}</p>}
          <p className="text-2xs font-medium text-muted-foreground">Request</p>
          <pre className="cx-wh-code cx-wh-pre max-h-32 overflow-auto p-2.5">{pretty(delivery.request_body) || "No request body was recorded."}</pre>
          <p className="text-2xs font-medium text-muted-foreground">Response</p>
          <pre className="cx-wh-code cx-wh-pre max-h-32 overflow-auto p-2.5">{pretty(delivery.response_body) || "No response body was recorded."}</pre>
        </div>
      )}
    </div>
  )
}

interface WebhookData {
  id: string
  name: string
  description?: string
  type: "incoming" | "outgoing"
  target_url?: string
  channel_id?: string
  bot_name: string
  events?: string
  is_active: boolean
  scope_type?: string
  scope_entity_id?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  webhook: WebhookData
}

const blankForm = {
  name: "",
  description: "",
  target_url: "",
  channel_id: "" as string,
  bot_name: "Webhook Bot",
  events: [] as string[],
  is_active: true,
  scope_type: "org" as string,
  scope_entity_id: "",
}

const NO_CHANNEL_VALUE = "__none__"

export default function WebhookEditDialog({ open, onOpenChange, onSuccess, webhook }: Props) {
  const post = usePost()
  const [form, setForm] = useState({ ...blankForm })
  const [errors, setErrors] = useState<{ name?: string; target_url?: string; scope?: string }>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  const { data: eventTypesData } = useFetch<{ event_types: string[] }>(AdminGet.GetWebhookEventTypes)
  const EVENT_TYPES = eventTypesData?.event_types || FALLBACK_EVENT_TYPES

  // Every channel, page by page (the list answers 20 at a time); its failure
  // is said in the picker, and the toast stays quiet.
  const { channels, isLoading: channelsLoading, isError: channelsError } = useEveryChannel(open, OWN_ERRORS)

  useEffect(() => {
    if (open && webhook) {
      let events: string[] = []
      try { if (webhook.events) events = JSON.parse(webhook.events) } catch {}
      setForm({
        name: webhook.name,
        description: webhook.description || "",
        target_url: webhook.target_url || "",
        channel_id: webhook.channel_id || "",
        bot_name: webhook.bot_name,
        events,
        is_active: webhook.is_active,
        scope_type: webhook.scope_type || "org",
        scope_entity_id: webhook.scope_entity_id || "",
      })
      setErrors({})
    }
  }, [open, webhook])

  const handleClose = () => {
    setForm({ ...blankForm })
    setErrors({})
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = "Give the webhook a name."
    if (webhook?.type === "outgoing" && form.target_url.trim() && !form.target_url.trim().startsWith("https://")) {
      next.target_url = "Use an address that starts with https://, so events travel encrypted."
    }
    if (webhook?.type === "outgoing") next.scope = scopeProblem(form.scope_type, form.scope_entity_id)
    setErrors(next)
    if (next.name) {
      nameRef.current?.focus()
      return
    }
    if (next.target_url) {
      urlRef.current?.focus()
      return
    }
    if (next.scope) return
    try {
      await post.makeRequest({
        apiEndpoint: AdminPost.UpdateWebhook,
        appendToUrl: `/${webhook.id}`,
        method: "PUT",
        payload: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          target_url: form.target_url.trim() || undefined,
          channel_id: webhook?.type === "incoming" && form.channel_id.trim() ? form.channel_id.trim() : undefined,
          bot_name: form.bot_name.trim() || "Webhook Bot",
          events: form.events.length > 0 ? form.events : undefined,
          is_active: form.is_active,
          ...(webhook?.type === "outgoing" ? scopePayload(form.scope_type, form.scope_entity_id) : {}),
        },
        showToast: true,
      })
      onSuccess()
      handleClose()
    } catch {
      // usePost says why, with the server's reason.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit webhook</DialogTitle>
          <DialogDescription>
            {webhook?.type === "outgoing"
              ? "OneCamp tells another service when something happens here."
              : "A script or another service posts messages into a channel here."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="Name" required error={errors.name}>
            <Input
              ref={nameRef}
              id="edit-name"
              value={form.name}
              onChange={(e) => {
                setForm(f => ({ ...f, name: e.target.value }))
                if (errors.name) setErrors((er) => ({ ...er, name: undefined }))
              }}
              maxLength={100}
              autoComplete="off"
            />
          </Field>
          <Field label="What it is for" help="Optional. Shown under its name in the list.">
            <Input id="edit-desc" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} maxLength={255} autoComplete="off" />
          </Field>
          {webhook?.type === "outgoing" && (
            <>
              <Field label="Address to send to" error={errors.target_url} help="Must start with https://.">
                <Input
                  ref={urlRef}
                  id="edit-url"
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  autoComplete="off"
                  value={form.target_url}
                  onChange={(e) => {
                    setForm(f => ({ ...f, target_url: e.target.value }))
                    if (errors.target_url) setErrors((er) => ({ ...er, target_url: undefined }))
                  }}
                  placeholder="https://api.example.com/webhook…"
                />
              </Field>
              <WebhookScopeFields
                scope={form.scope_type}
                entity={form.scope_entity_id}
                onChange={(scope_type, scope_entity_id) => {
                  setForm(f => ({ ...f, scope_type, scope_entity_id }))
                  if (errors.scope) setErrors((er) => ({ ...er, scope: undefined }))
                }}
                channels={channels}
                channelsLoading={channelsLoading}
                idPrefix="edit"
                error={errors.scope}
              />
              <WebhookEventChoice events={EVENT_TYPES} chosen={form.events} onChange={(events) => setForm(f => ({ ...f, events }))} idPrefix="edit-ev" />
            </>
          )}
          {webhook?.type === "incoming" && (
            <Field
              label="Channel to post in"
              help={<>Optional. Used when a message doesn&apos;t name its own: a message can name <code>channel_id</code>, <code>dm_id</code> or <code>group_chat_id</code> instead.</>}
            >
              <Select
                value={form.channel_id || NO_CHANNEL_VALUE}
                onValueChange={(v) => setForm(f => ({ ...f, channel_id: v === NO_CHANNEL_VALUE ? "" : v }))}
                disabled={channelsLoading}
              >
                <SelectTrigger id="edit-channel">
                  {channelsLoading ? (
                    <span className="text-muted-foreground">Loading channels…</span>
                  ) : (
                    <SelectValue placeholder="Choose a channel" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHANNEL_VALUE}>No channel</SelectItem>
                  {channelsError && (
                    <div className="px-2 py-2 text-center text-sm text-danger-ink">Couldn&apos;t load the channels. Close this and try again.</div>
                  )}
                  {!channelsError && channels.length === 0 && !channelsLoading && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">No channels yet</div>
                  )}
                  {channels.map(ch => (
                    <SelectItem key={ch.ch_uuid} value={ch.ch_uuid}>
                      {ch.ch_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Sender name" help="Who its posts appear to come from.">
            <Input id="edit-bot" value={form.bot_name} onChange={(e) => setForm(f => ({ ...f, bot_name: e.target.value }))} maxLength={50} autoComplete="off" />
          </Field>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-active">Active</Label>
              <p id="edit-active-desc" className="text-xs text-muted-foreground">While it is off, it neither sends nor accepts anything.</p>
            </div>
            <Switch
              id="edit-active"
              aria-describedby="edit-active-desc"
              className="mt-0.5"
              checked={form.is_active}
              onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))}
            />
          </div>
          {webhook?.type === "outgoing" && webhook.id && <SendTest webhookId={webhook.id} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={post.isSubmitting}>
            {post.isSubmitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            {post.isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
