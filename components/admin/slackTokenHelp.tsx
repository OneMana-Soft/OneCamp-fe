"use client"

/**
 * How to get the Slack token a read through Slack's API takes (chat item 2):
 * a Slack app of the team's own, made from a manifest that asks only for what
 * the read reads, installed to their workspace, and its User OAuth Token. An
 * app a team makes for itself reads at Slack's ordinary rates. An admin's read
 * of the workspace and a member's read of their own DMs ask for different
 * apps (WORKSPACE_READ_APP, DM_READ_APP).
 */

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Disclosure } from "@/components/ui/disclosure"
import { Check, Copy } from "@/lib/icons"

/**
 * The scopes the read asks for, and why. users:read.email is what matches
 * Slack's people to the workspace's members: without it everyone would come
 * across as someone new.
 */
export const SLACK_READ_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "users:read",
  "users:read.email",
  "pins:read",
  "files:read",
] as const

/**
 * The scopes a member's read of their own DMs asks for: their private
 * channels, group DMs and DMs, and the people, never a public channel.
 */
export const SLACK_DM_SCOPES = [
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "mpim:history",
  "mpim:read",
  "users:read",
  "users:read.email",
  "pins:read",
  "files:read",
] as const

/** The Slack app a read asks for: its name, what it says it does, and its scopes. */
export interface SlackReadApp {
  name: string
  description: string
  scopes: readonly string[]
  /** A line after the install step, for a person who may need an admin's yes. */
  approval?: string
}

/** An admin's read of the whole workspace. */
export const WORKSPACE_READ_APP: SlackReadApp = {
  name: "OneCamp import",
  description: "Reads this workspace once, to bring it into OneCamp.",
  scopes: SLACK_READ_SCOPES,
}

/** A member's read of their own DMs. */
export const DM_READ_APP: SlackReadApp = {
  name: "OneCamp DMs",
  description: "Reads your DMs, group DMs and private channels once, to bring them into OneCamp.",
  scopes: SLACK_DM_SCOPES,
  approval: "If Slack says your workspace needs an admin to approve it, ask one of your Slack admins.",
}

/** The app's manifest, as Slack's "From a manifest" takes it. Pure. */
export function slackReadManifest(app: SlackReadApp = WORKSPACE_READ_APP): string {
  return JSON.stringify(
    {
      display_information: { name: app.name, description: app.description },
      oauth_config: { scopes: { user: [...app.scopes] } },
      settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
    },
    null,
    2,
  )
}

export function SlackTokenHelp({ app = WORKSPACE_READ_APP }: { app?: SlackReadApp }) {
  const [copied, setCopied] = useState(false)
  const manifest = slackReadManifest(app)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(manifest)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Disclosure className="cx-imp-note text-xs" summary="How to get a token" summaryClassName="font-medium text-foreground">
      <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-muted-foreground">
        <li>
          At{" "}
          <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noreferrer" className="text-brand-text underline-offset-2 hover:underline">
            api.slack.com/apps
          </a>
          , create an app <em>From a manifest</em>, choose your workspace, and paste this one. It asks only to read.
        </li>
        <li>
          Install it to your workspace.
          {app.approval && <> {app.approval}</>}
        </li>
        <li>
          Copy its <strong className="font-medium text-foreground">User OAuth Token</strong> (it starts xoxp-) and paste it above.
        </li>
      </ol>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted-foreground">The manifest</span>
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="mt-1.5 max-h-40 overflow-auto rounded-md bg-press p-2 font-mono text-3xs leading-4 text-ink-2">{manifest}</pre>
    </Disclosure>
  )
}
