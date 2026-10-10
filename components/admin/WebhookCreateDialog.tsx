"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
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
import { cn } from "@/lib/utils/helpers/cn"

export const FALLBACK_EVENT_TYPES = [
  "post.created", "post.updated", "post.deleted",
  "chat.created", "chat.updated", "chat.deleted",
  "task.created", "task.deleted", "task.status_changed", "task.restored",
  "channel.created", "channel.archived",
  "user.joined", "user.left",
]

/**
 * The events an outgoing webhook is sent, as a list of checkboxes.
 *
 * Each event used to be a <span> with an onClick: not focusable, with no role
 * and no checked state, so a keyboard could not choose one and a screen reader
 * heard a run of words. The chosen ones were also filled in the accent, which
 * is for the one action a view asks for.
 */
export function WebhookEventChoice({
  events,
  chosen,
  onChange,
  idPrefix,
}: {
  events: string[]
  chosen: string[]
  onChange: (next: string[]) => void
  idPrefix: string
}) {
  const toggle = (ev: string, on: boolean) =>
    onChange(on ? (chosen.includes(ev) ? chosen : [...chosen, ev]) : chosen.filter((e) => e !== ev))
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Events to send</legend>
      <div className="grid max-h-48 grid-cols-1 gap-x-4 gap-y-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
        {events.map((ev) => {
          const id = `${idPrefix}-${ev}`
          return (
            <div key={ev} className="flex items-center gap-2">
              <Checkbox id={id} checked={chosen.includes(ev)} onCheckedChange={(v) => toggle(ev, v === true)} />
              <label htmlFor={id} className="cursor-pointer font-mono text-xs" translate="no">
                {ev}
              </label>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {chosen.length === 0
          ? "None ticked: it is sent every event."
          : `${chosen.length} ${chosen.length === 1 ? "event" : "events"} chosen.`}
      </p>
    </fieldset>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type WebhookType = "incoming" | "outgoing"

const blankForm = {
  name: "",
  description: "",
  type: "incoming" as WebhookType,
  target_url: "",
  channel_id: "" as string,
  bot_name: "Webhook Bot",
  events: [] as string[],
  scope_type: "org" as string,
  scope_entity_id: "",
}

const NO_CHANNEL_VALUE = "__none__"

const TYPE_HELP: Record<WebhookType, string> = {
  incoming: "A script or another service posts messages into a channel here.",
  outgoing: "OneCamp tells another service when something happens here.",
}

export default function WebhookCreateDialog({ open, onOpenChange, onSuccess }: Props) {
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

  const handleClose = () => {
    setForm({ ...blankForm })
    setErrors({})
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    // Said under the field it is about, and the cursor goes there: a red toast
    // in the corner, tied to no field, was all there was.
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = "Give the webhook a name."
    if (form.type === "outgoing") {
      const url = form.target_url.trim()
      if (!url) next.target_url = "Enter the address to send events to."
      else if (!url.startsWith("https://")) next.target_url = "Use an address that starts with https://, so events travel encrypted."
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
      // usePost says why, with the server's reason.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New webhook</DialogTitle>
          <DialogDescription>{TYPE_HELP[form.type]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Two choices of one, so a segmented radio group, not a select whose
              options were sentences. */}
          <div className="grid gap-2">
            <p id="wh-type-label" className="text-sm font-medium">Kind</p>
            <div role="radiogroup" aria-labelledby="wh-type-label" className="inline-flex w-fit gap-1 rounded-md bg-muted p-1">
              {(["incoming", "outgoing"] as const).map((t) => {
                const on = form.type === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={cn(
                      "h-8 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                      on ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t === "incoming" ? "Incoming" : "Outgoing"}
                  </button>
                )
              })}
            </div>
          </div>
          <Field label="Name" required error={errors.name}>
            <Input
              ref={nameRef}
              id="wh-name"
              value={form.name}
              onChange={(e) => {
                setForm(f => ({ ...f, name: e.target.value }))
                if (errors.name) setErrors((er) => ({ ...er, name: undefined }))
              }}
              placeholder="Deploy notices…"
              maxLength={100}
              autoComplete="off"
            />
          </Field>
          <Field label="What it is for" help="Optional. Shown under its name in the list.">
            <Input id="wh-desc" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} maxLength={255} autoComplete="off" />
          </Field>
          {form.type === "outgoing" && (
            <>
              <Field
                label="Address to send to"
                required
                error={errors.target_url}
                help="Must start with https://. Each event is sent as JSON, signed with HMAC-SHA256."
              >
                <Input
                  ref={urlRef}
                  id="wh-url"
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
              <Field label="Events from" help="Limit which events it is sent.">
                <Select value={form.scope_type} onValueChange={(v) => setForm(f => ({ ...f, scope_type: v, scope_entity_id: "" }))}>
                  <SelectTrigger id="wh-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">The whole workspace</SelectItem>
                    <SelectItem value="channel">One channel</SelectItem>
                    <SelectItem value="project">One project</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {form.scope_type === "channel" && (
                <Field label="Channel">
                  <Select value={form.scope_entity_id || undefined} onValueChange={(v) => setForm(f => ({ ...f, scope_entity_id: v }))} disabled={channelsLoading}>
                    <SelectTrigger id="wh-scope-channel">
                      <SelectValue placeholder={channelsLoading ? "Loading channels…" : "Choose a channel"} />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map(ch => (
                        <SelectItem key={ch.ch_uuid} value={ch.ch_uuid}>{ch.ch_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {form.scope_type === "project" && (
                <Field label="Project ID" help="The last part of the project's address in your browser.">
                  <Input id="wh-scope-project" value={form.scope_entity_id} onChange={(e) => setForm(f => ({ ...f, scope_entity_id: e.target.value }))} spellCheck={false} autoComplete="off" />
                </Field>
              )}
              <WebhookEventChoice events={EVENT_TYPES} chosen={form.events} onChange={(events) => setForm(f => ({ ...f, events }))} idPrefix="wh-ev" />
            </>
          )}
          {form.type === "incoming" && (
            <Field
              label="Channel to post in"
              help={<>Optional. Used when a message doesn&apos;t name its own: a message can name <code>channel_id</code>, <code>dm_id</code> or <code>group_chat_id</code> instead.</>}
            >
              <Select
                value={form.channel_id || NO_CHANNEL_VALUE}
                onValueChange={(v) => setForm(f => ({ ...f, channel_id: v === NO_CHANNEL_VALUE ? "" : v }))}
                disabled={channelsLoading}
              >
                <SelectTrigger id="wh-channel">
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
            <Input id="wh-bot" value={form.bot_name} onChange={(e) => setForm(f => ({ ...f, bot_name: e.target.value }))} maxLength={50} autoComplete="off" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={post.isSubmitting}>
            {post.isSubmitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            {post.isSubmitting ? "Creating…" : "Create webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
