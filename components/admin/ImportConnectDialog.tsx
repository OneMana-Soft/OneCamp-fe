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
 *   monday   — Personal API token (avatar → Developers → My access
 *              tokens). Single token; workspace picked via discover.
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
import { connectImport, importProblemOf, importProviderLabel, type ImportProvider } from "@/services/importService"
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
  monday: "https://developer.monday.com/api-reference/docs/authentication",
}

// Where the token lives when the help link can't point at it directly
// (monday's token page sits under each account's own subdomain).
const TOKEN_HINT: Partial<Record<ImportProvider, string>> = {
  monday: "In monday.com, click your avatar, then Developers → My access tokens → Show, and copy the personal API token. Imports see the boards that user can open.",
}

export const ImportConnectDialog: React.FC<Props> = ({ provider, open, onOpenChange, onConnected }) => {
  const { toast } = useToast()
  const [accessToken, setAccessToken] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [email, setEmail] = useState("")
  const [siteURL, setSiteURL] = useState("")
  const [accountName, setAccountName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // What the provider said about the token, kept in the dialog so the admin
  // can fix the field it is about instead of chasing a toast.
  const [problem, setProblem] = useState("")

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
    setProblem("")
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
      toast({ title: `${importProviderLabel(provider)} connected`, description: "It accepted the token, and it's saved securely." })
      setAccessToken("")
      setApiKey("")
      setEmail("")
      setSiteURL("")
      setAccountName("")
      onConnected()
      onOpenChange(false)
    } catch (err: unknown) {
      setProblem(importProblemOf(err, "Couldn't connect. Try again.").message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {importProviderLabel(provider)}</DialogTitle>
          <DialogDescription>
            Paste the credentials below. {importProviderLabel(provider)} is asked to accept them before they are
            saved, encrypted at rest and never returned in API responses.{" "}
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
            {TOKEN_HINT[provider] && (
              <p className="text-xs text-muted-foreground">{TOKEN_HINT[provider]}</p>
            )}
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

        {problem && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {problem}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking with {importProviderLabel(provider)}…
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
