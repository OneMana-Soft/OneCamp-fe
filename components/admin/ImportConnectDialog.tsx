"use client"

/**
 * ImportConnectDialog — collects credentials for live-API providers.
 *
 * Per-provider form fields:
 *   Trello   — API key (32-char), user token. Both required.
 *   Asana    — Personal Access Token only.
 *   Jira     — email + API token + site URL. The BE base64-encodes
 *              email:token to build the Basic auth header; site URL
 *              goes into metadata.site_url.
 *   Notion   — internal integration token (or OAuth access token).
 *   Todoist  — Personal API token.
 *   Linear   — Personal API key (linear.app/settings/api) or OAuth
 *              access token. Single Bearer token, no metadata needed.
 *   ClickUp  — Personal API Token (app.clickup.com/settings/apps) or
 *              OAuth access token. Single token, workspace selected
 *              via discover dialog.
 *
 * Tokens are sent over the admin-only API and encrypted at rest with
 * AES-256-GCM. The dialog never reads them back — re-connecting
 * overwrites.
 */

import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { connectImport, type ImportProvider } from "@/services/importService"
import { Loader2 } from "lucide-react"

interface Props {
  provider: ImportProvider
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}

const HELP_LINK: Record<ImportProvider, string> = {
  trello: "https://trello.com/app-key",
  asana: "https://app.asana.com/0/my-apps",
  jira: "https://id.atlassian.com/manage-profile/security/api-tokens",
  notion: "https://www.notion.so/my-integrations",
  todoist: "https://todoist.com/app/settings/integrations/developer",
  linear: "https://linear.app/settings/api",
  clickup: "https://app.clickup.com/settings/apps",
}

export const ImportConnectDialog: React.FC<Props> = ({ provider, open, onOpenChange, onConnected }) => {
  const { toast } = useToast()
  const [accessToken, setAccessToken] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [email, setEmail] = useState("")
  const [siteURL, setSiteURL] = useState("")
  const [accountName, setAccountName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const needsApiKey = provider === "trello"
  const needsEmail = provider === "jira"
  const needsSiteURL = provider === "jira"

  const handleSubmit = async () => {
    if (!accessToken.trim()) {
      toast({ title: "Token required", variant: "destructive" })
      return
    }
    if (needsApiKey && !apiKey.trim()) {
      toast({ title: "API key required for Trello", variant: "destructive" })
      return
    }
    if (needsEmail && !email.trim()) {
      toast({ title: "Email required for Jira", variant: "destructive" })
      return
    }
    if (needsSiteURL) {
      const url = siteURL.trim()
      if (!url || !/^https?:\/\//i.test(url)) {
        toast({ title: "Atlassian site URL required (https://acme.atlassian.net)", variant: "destructive" })
        return
      }
    }
    setSubmitting(true)
    try {
      const metadata: Record<string, string> = {}
      if (needsApiKey) metadata.api_key = apiKey.trim()
      if (needsEmail) metadata.email = email.trim()
      if (needsSiteURL) metadata.site_url = siteURL.trim()

      await connectImport(provider, {
        access_token: accessToken.trim(),
        source_account_name: accountName.trim() || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      })
      toast({ title: `${provider} connected`, description: "Token saved securely." })
      setAccessToken("")
      setApiKey("")
      setEmail("")
      setSiteURL("")
      setAccountName("")
      onConnected()
      onOpenChange(false)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Connection failed"
      toast({ title: "Connection failed", description: msg, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {capitalise(provider)}</DialogTitle>
          <DialogDescription>
            Paste the credentials below. Stored encrypted at rest with
            AES-256-GCM and never returned in API responses.{" "}
            <a href={HELP_LINK[provider]} target="_blank" rel="noopener noreferrer"
               className="underline">Where to find them</a>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {needsSiteURL && (
            <div className="space-y-1.5">
              <Label htmlFor="siteURL">Atlassian site URL</Label>
              <Input
                id="siteURL"
                value={siteURL}
                onChange={(e) => setSiteURL(e.target.value)}
                placeholder="https://acme.atlassian.net"
                autoComplete="off"
              />
            </div>
          )}
          {needsEmail && (
            <div className="space-y-1.5">
              <Label htmlFor="email">Atlassian account email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="off"
              />
            </div>
          )}
          {needsApiKey && (
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="32-char Trello API key"
                autoComplete="off"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="accessToken">
              {needsApiKey ? "User token" : needsEmail ? "API token" : "Access token"}
            </Label>
            <Input
              id="accessToken"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Paste the token"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountName">Workspace label (optional)</Label>
            <Input
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., Acme Inc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
