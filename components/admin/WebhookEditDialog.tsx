"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast"
import { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel"

const FALLBACK_EVENT_TYPES = [
  "post.created", "post.updated", "post.deleted",
  "chat.created", "chat.updated", "chat.deleted",
  "task.created", "task.deleted", "task.status_changed", "task.restored",
  "channel.created", "channel.archived",
  "user.joined", "user.left",
]

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
  const { toast } = useToast()
  const [form, setForm] = useState({ ...blankForm })

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
    }
  }, [open, webhook])

  const handleClose = () => {
    setForm({ ...blankForm })
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Validation Error", description: "Name is required", variant: "destructive" })
      return
    }
    if (webhook?.type === "outgoing" && form.target_url.trim() && !form.target_url.startsWith("https://")) {
      toast({ title: "Validation Error", description: "Target URL must use HTTPS", variant: "destructive" })
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
      // handled by usePost
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Webhook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name *</Label>
            <Input id="edit-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} maxLength={100} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-desc">Description</Label>
            <Input id="edit-desc" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} maxLength={255} />
          </div>
          {webhook?.type === "outgoing" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="edit-url">Target URL</Label>
                <Input id="edit-url" type="url" value={form.target_url} onChange={(e) => setForm(f => ({ ...f, target_url: e.target.value }))} placeholder="https://api.example.com/webhook" />
              </div>
              <div className="grid gap-2">
                <Label>Events</Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
                  {EVENT_TYPES.map(ev => (
                    <Badge key={ev} variant={form.events.includes(ev) ? "default" : "outline"} className="cursor-pointer text-xs transition-colors"
                      onClick={() => setForm(f => ({ ...f, events: f.events.includes(ev) ? f.events.filter(e => e !== ev) : [...f.events, ev] }))}
                    >{ev}</Badge>
                  ))}
                </div>
              </div>
            </>
          )}
          {webhook?.type === "incoming" && (
            <div className="grid gap-2">
              <Label htmlFor="edit-channel">Default Destination Channel (optional)</Label>
              <Select
                value={form.channel_id || NO_CHANNEL_VALUE}
                onValueChange={(v) => setForm(f => ({ ...f, channel_id: v === NO_CHANNEL_VALUE ? "" : v }))}
                disabled={channelsLoading}
              >
                <SelectTrigger id="edit-channel">
                  {channelsLoading ? (
                    <span className="text-muted-foreground animate-pulse">Loading channels...</span>
                  ) : (
                    <SelectValue placeholder="Select a channel (optional)" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHANNEL_VALUE}>— None —</SelectItem>
                  {channelsError && (
                    <div className="text-sm text-destructive px-2 py-2 text-center">Failed to load channels</div>
                  )}
                  {!channelsError && channels.length === 0 && !channelsLoading && (
                    <div className="text-sm text-muted-foreground px-2 py-4 text-center">No channels available</div>
                  )}
                  {channels.map(ch => (
                    <SelectItem key={ch.ch_uuid} value={ch.ch_uuid}>
                      {ch.ch_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                If set, messages are posted here when no destination is specified in the payload.
                The payload can override this with <code>channel_id</code>, <code>dm_id</code>, or <code>group_chat_id</code>.
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="edit-bot">Bot Display Name</Label>
            <Input id="edit-bot" value={form.bot_name} onChange={(e) => setForm(f => ({ ...f, bot_name: e.target.value }))} maxLength={50} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable or disable this webhook</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={post.isSubmitting}>
            {post.isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
