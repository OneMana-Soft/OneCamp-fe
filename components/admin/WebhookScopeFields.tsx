"use client"

import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ChannelInfoInterface } from "@/types/channel"

/**
 * What an outgoing webhook is sent events from: the whole workspace, one
 * channel or one project (the server's business/Webhook webhookScope). The
 * help says what each sends, because the server decides by it: a private
 * channel's words go only to a webhook set up for that channel, and a direct
 * message goes to none.
 */
export type WebhookScope = "org" | "channel" | "project"

const SCOPE_HELP: Record<WebhookScope, string> = {
  org: "Public channels and projects send their events whole; a private channel's events carry only ids. Direct messages are never sent.",
  channel: "Everything from this channel, private or not. Direct messages are never sent.",
  project: "Everything from this project's tasks.",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What is missing from a scope, said for the field; undefined when it is whole. */
export function scopeProblem(scope: string, entity: string): string | undefined {
  if (scope === "channel" && !entity.trim()) return "Choose the channel to send events from."
  if (scope === "project" && !UUID_RE.test(entity.trim())) return "Enter the project's ID: the last part of its address in your browser."
  return undefined
}

/** A scope as the server reads it: an entity only for a channel or a project. */
export function scopePayload(scope: string, entity: string): { scope_type: string; scope_entity_id?: string } {
  const type = scope === "channel" || scope === "project" ? scope : "org"
  return type === "org" ? { scope_type: type } : { scope_type: type, scope_entity_id: entity.trim() }
}

export function WebhookScopeFields({
  scope,
  entity,
  onChange,
  channels,
  channelsLoading,
  idPrefix,
  error,
}: {
  scope: string
  entity: string
  onChange: (scope: WebhookScope, entity: string) => void
  channels: ChannelInfoInterface[]
  channelsLoading: boolean
  idPrefix: string
  error?: string
}) {
  const known: WebhookScope = scope === "channel" || scope === "project" ? scope : "org"
  return (
    <>
      <Field label="Events from" help={SCOPE_HELP[known]}>
        <Select id={`${idPrefix}-scope`} value={known} onValueChange={(v) => onChange(v as WebhookScope, "")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="org">The whole workspace</SelectItem>
            <SelectItem value="channel">One channel</SelectItem>
            <SelectItem value="project">One project</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {known === "channel" && (
        <Field label="Channel" error={error}>
          <Select id={`${idPrefix}-scope-channel`} value={entity || undefined} onValueChange={(v) => onChange("channel", v)} disabled={channelsLoading}>
            <SelectTrigger>
              <SelectValue placeholder={channelsLoading ? "Loading channels…" : "Choose a channel"} />
            </SelectTrigger>
            <SelectContent>
              {channels.map((ch) => (
                <SelectItem key={ch.ch_uuid} value={ch.ch_uuid}>{ch.ch_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {known === "project" && (
        <Field label="Project ID" error={error} help="The last part of the project's address in your browser.">
          <Input
            id={`${idPrefix}-scope-project`}
            value={entity}
            onChange={(e) => onChange("project", e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      )}
    </>
  )
}
