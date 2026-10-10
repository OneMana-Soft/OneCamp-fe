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
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel"
import { FALLBACK_EVENT_TYPES, WebhookEventChoice } from "@/components/admin/WebhookCreateDialog"

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
}

const NO_CHANNEL_VALUE = "__none__"

export default function WebhookEditDialog({ open, onOpenChange, onSuccess, webhook }: Props) {
  const post = usePost()
  const [form, setForm] = useState({ ...blankForm })
  const [errors, setErrors] = useState<{ name?: string; target_url?: string }>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  const { data: eventTypesData } = useFetch<{ event_types: string[] }>(GetEndpointUrl.GetWebhookEventTypes)
  const EVENT_TYPES = eventTypesData?.event_types || FALLBACK_EVENT_TYPES

  const { data: channelsData, isLoading: channelsLoading, isError: channelsError } = useFetch<ChannelInfoListInterfaceResp>(
    GetEndpointUrl.GetAllActiveChannelList
  )
  const channels: ChannelInfoInterface[] = channelsData?.channels_list || []

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
    setErrors(next)
    if (next.name) {
      nameRef.current?.focus()
      return
    }
    if (next.target_url) {
      urlRef.current?.focus()
      return
    }
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.UpdateWebhook,
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
