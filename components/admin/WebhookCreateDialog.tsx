"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const blankForm = {
  name: "",
  description: "",
  type: "incoming" as "incoming" | "outgoing",
  target_url: "",
  channel_id: "" as string,
  bot_name: "Webhook Bot",
  events: [] as string[],
  scope_type: "org" as string,
  scope_entity_id: "",
}

const NO_CHANNEL_VALUE = "__none__"

export default function WebhookCreateDialog({ open, onOpenChange, onSuccess }: Props) {
  const post = usePost()
  const { toast } = useToast()
  const [form, setForm] = useState({ ...blankForm })

  const { data: eventTypesData } = useFetch<{ event_types: string[] }>(GetEndpointUrl.GetWebhookEventTypes)
  const EVENT_TYPES = eventTypesData?.event_types || FALLBACK_EVENT_TYPES

  const { data: channelsData, isLoading: channelsLoading, isError: channelsError } = useFetch<ChannelInfoListInterfaceResp>(
    GetEndpointUrl.GetAllActiveChannelList
  )
  const channels: ChannelInfoInterface[] = channelsData?.channels_list || []

  const handleClose = () => {
    setForm({ ...blankForm })
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Validation Error", description: "Name is required", variant: "destructive" })
      return
    }
    if (form.type === "outgoing" && !form.target_url.trim()) {
      toast({ title: "Validation Error", description: "Target URL is required for outgoing webhooks", variant: "destructive" })
      return
    }
    if (form.type === "outgoing" && !form.target_url.startsWith("https://")) {
      toast({ title: "Validation Error", description: "Target URL must use HTTPS", variant: "destructive" })
      return
    }
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.CreateWebhook,
        payload: {
          name: form.name.trim(),
          type: form.type,
          bot_name: form.bot_name.trim() || "Webhook Bot",
          description: form.description.trim() || undefined,
          target_url: form.type === "outgoing" ? form.target_url.trim() : undefined,
          channel_id: form.type === "incoming" && form.channel_id.trim() ? form.channel_id.trim() : undefined,
          events: form.type === "outgoing" && form.events.length > 0 ? form.events : undefined,
          scope_type: form.scope_type || "org",
          scope_entity_id: form.scope_entity_id.trim() || undefined,
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
          <DialogTitle>Create Webhook</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="wh-name">Name *</Label>
            <Input id="wh-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. CI/CD Bot" maxLength={100} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wh-desc">Description</Label>
            <Input id="wh-desc" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this webhook do?" maxLength={255} />
          </div>
          <div className="grid gap-2">
            <Label>Type *</Label>
            <Select value={form.type} onValueChange={(v: "incoming" | "outgoing") => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incoming"><div className="flex items-center gap-2"><ArrowDownToLine className="h-3.5 w-3.5" /> Incoming — receive messages from external services</div></SelectItem>
                <SelectItem value="outgoing"><div className="flex items-center gap-2"><ArrowUpFromLine className="h-3.5 w-3.5" /> Outgoing — send events to external services</div></SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.type === "outgoing" && (
            <>
              <div className="grid gap-2">
                <Label>Scope</Label>
                <Select value={form.scope_type} onValueChange={(v) => setForm(f => ({ ...f, scope_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">Organization-wide</SelectItem>
                    <SelectItem value="channel">Channel-specific</SelectItem>
                    <SelectItem value="project">Project-specific</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Limit which events this webhook receives.</p>
              </div>
              {form.scope_type !== "org" && (
                <div className="grid gap-2">
                  <Label htmlFor="scope-entity">Scope Entity ID</Label>
                  <Input id="scope-entity" value={form.scope_entity_id} onChange={(e) => setForm(f => ({ ...f, scope_entity_id: e.target.value }))} placeholder="UUID of the channel or project" />
                </div>
              )}
            </>
          )}
          {form.type === "incoming" && (
            <div className="grid gap-2">
              <Label htmlFor="wh-channel">Default Destination Channel (optional)</Label>
              <Select
                value={form.channel_id || NO_CHANNEL_VALUE}
                onValueChange={(v) => setForm(f => ({ ...f, channel_id: v === NO_CHANNEL_VALUE ? "" : v }))}
                disabled={channelsLoading}
              >
                <SelectTrigger id="wh-channel">
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
          {form.type === "outgoing" && (
            <div className="grid gap-2">
              <Label htmlFor="wh-url">Target URL *</Label>
              <Input id="wh-url" type="url" value={form.target_url} onChange={(e) => setForm(f => ({ ...f, target_url: e.target.value }))} placeholder="https://api.example.com/webhook" />
              <p className="text-xs text-muted-foreground">Must use HTTPS. Events will be POSTed as JSON with HMAC-SHA256 signature.</p>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="wh-bot">Bot Display Name</Label>
            <Input id="wh-bot" value={form.bot_name} onChange={(e) => setForm(f => ({ ...f, bot_name: e.target.value }))} maxLength={50} />
          </div>
          {form.type === "outgoing" && (
            <div className="grid gap-2">
              <Label>Events to subscribe</Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
                {EVENT_TYPES.map(ev => (
                  <Badge key={ev} variant={form.events.includes(ev) ? "default" : "outline"} className="cursor-pointer text-xs transition-colors"
                    onClick={() => setForm(f => ({ ...f, events: f.events.includes(ev) ? f.events.filter(e => e !== ev) : [...f.events, ev] }))}
                  >{ev}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{form.events.length === 0 ? "No events selected — webhook will receive ALL events" : `${form.events.length} event(s) selected`}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={post.isSubmitting}>
            {post.isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
