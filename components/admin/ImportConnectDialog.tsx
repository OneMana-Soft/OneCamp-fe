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
 *   Basecamp — no tokens to paste: the admin signs in at Basecamp
 *              (signIn) and comes back to the import page, connected.
 *   Miro     — the OAuth token of an app the admin makes in their own
 *              Miro (owner decision O3: no OneCamp Miro app), installed on
 *              the team that holds the boards. Board picked via discover.
 *   Airtable — Personal access token (airtable.com/create/tokens) with
 *              data.records:read and schema.bases:read and access to the
 *              bases; a base picked via discover, or every base.
 *
 * Tokens are sent over the admin-only API and encrypted at rest with
 * AES-256-GCM. The dialog never reads them back — re-connecting
 * overwrites.
 */

import React, { useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SetupSentence } from "@/components/ui/setupSentence"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { useToast } from "@/hooks/use-toast"
import {
  connectImport,
  importProblemOf,
  importProviderLabel,
  importSignInURL,
  type ProviderInfo,
  type TokenProvider,
} from "@/services/importService"
import { leaveTo } from "@/lib/navigate"
import { webURL } from "@/lib/links/webURL"

interface Props {
  provider: TokenProvider
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
  /** Set for a provider connected by signing in at it rather than with a token. */
  signIn?: ProviderInfo["sign_in"]
}

const HELP_LINK: Record<TokenProvider, string> = {
  // trello.com/app-key no longer issues keys: a key now comes from a Power-Up.
  trello: "https://trello.com/power-ups/admin",
  asana: "https://app.asana.com/0/my-apps",
  jira: "https://id.atlassian.com/manage-profile/security/api-tokens",
  notion: "https://www.notion.so/my-integrations",
  todoist: "https://todoist.com/app/settings/integrations/developer",
  linear: "https://linear.app/settings/api",
  clickup: "https://app.clickup.com/settings/apps",
  monday: "https://developer.monday.com/api-reference/docs/authentication",
  basecamp: "https://launchpad.37signals.com/integrations",
  miro: "https://developers.miro.com/docs/rest-api-build-your-first-hello-world-app",
  airtable: "https://airtable.com/create/tokens",
  // Google Sheets signs in with the server's Google client, made here.
  gsheets: "https://console.cloud.google.com/apis/credentials",
}

// Where the token lives when the help link can't point at it directly
// (monday's token page sits under each account's own subdomain).
const TOKEN_HINT: Partial<Record<TokenProvider, string>> = {
  trello:
    "Trello gives API keys to Power-Ups now. Open trello.com/power-ups/admin, create a Power-Up (any name, in your Workspace), open its API key page and generate a key. Copy the API key, then follow the Token link beside it, allow access, and copy the token.",
  jira:
    "Use a classic API token: at id.atlassian.com, open Security, then Create and manage API tokens, and choose Create API token (not the one with scopes). Use the email you sign in to Jira with.",
  monday: "In monday.com, click your avatar, then Developers → My access tokens → Show, and copy the personal API token. Imports see the boards that user can open.",
  miro: "In Miro, open your profile settings, then Your apps, and create an app (Miro makes a free Developer team for it). Give it the boards:read permission, choose Install app and get OAuth token for the team that holds your boards, and copy the token. Imports see that team's boards.",
  airtable:
    "At airtable.com/create/tokens, create a token with the scopes data.records:read and schema.bases:read, add the bases to bring under Access, and copy it. Imports see only the bases you add.",
}

type FieldKey = "siteURL" | "email" | "apiKey" | "accessToken"
const FIELD_ORDER: FieldKey[] = ["siteURL", "email", "apiKey", "accessToken"]

export const ImportConnectDialog: React.FC<Props> = ({ provider, open, onOpenChange, onConnected, signIn }) => {
  if (signIn) return <SignInDialog provider={provider} signIn={signIn} open={open} onOpenChange={onOpenChange} />
  return <TokenDialog provider={provider} open={open} onOpenChange={onOpenChange} onConnected={onConnected} />
}

/** Signing in at the provider: the admin leaves for its sign-in page and comes back connected. */
function SignInDialog({ provider, signIn, open, onOpenChange }: { provider: TokenProvider; signIn: NonNullable<ProviderInfo["sign_in"]>; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [leaving, setLeaving] = useState(false)
  const [problem, setProblem] = useState("")
  const name = importProviderLabel(provider)
  const go = async () => {
    setLeaving(true)
    setProblem("")
    try {
      const url = await importSignInURL(provider)
      if (!url) throw new Error()
      leaveTo(url)
    } catch (err: unknown) {
      setProblem(importProblemOf(err, `Couldn't start signing in to ${name}. Try again.`).message)
      setLeaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {name}</DialogTitle>
          <DialogDescription>
            {signIn.configured
              ? `You'll sign in to ${name}, allow this workspace to read it, and come back here to pick what to import. The sign-in is encrypted at rest and never returned in API responses.`
              : <SetupSentence text={signIn.setup ?? `${name} is connected by signing in, and this server isn't set up for that yet.`} />}
          </DialogDescription>
        </DialogHeader>
        {problem && (
          <p role="alert" className="cx-imp-note text-sm text-danger-ink">
            {problem}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={leaving}>
            {signIn.configured ? "Cancel" : "Close"}
          </Button>
          {signIn.configured && (
            <Button onClick={go} busy={leaving}>
              {leaving ? `Opening ${name}…` : `Continue to ${name}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Pasting a token: tested with the provider before it is saved. */
function TokenDialog({ provider, open, onOpenChange, onConnected }: Omit<Props, "signIn">) {
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
  // What each field is missing, said under it. Each was a red toast, away
  // from the field and gone in five seconds.
  const [missing, setMissing] = useState<Partial<Record<FieldKey, string>>>({})
  const refs = {
    siteURL: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    apiKey: useRef<HTMLInputElement>(null),
    accessToken: useRef<HTMLInputElement>(null),
  }

  const needsApiKey = provider === "trello"
  const needsEmail = provider === "jira"
  const needsSiteURL = provider === "jira"
  const tokenWord = needsApiKey ? "Trello user token" : needsEmail ? "Jira API token" : "access token"

  const clear = (k: FieldKey) => setMissing((m) => (m[k] ? { ...m, [k]: undefined } : m))

  const handleSubmit = async () => {
    // In the order the fields are on screen, so the cursor goes to the first.
    const found: Partial<Record<FieldKey, string>> = {}
    if (needsSiteURL && !webURL(siteURL)) {
      found.siteURL = "Enter your Atlassian site's address, like https://acme.atlassian.net."
    }
    if (needsEmail && !email.trim()) found.email = "Enter the email you sign in to Jira with."
    if (needsApiKey && !apiKey.trim()) found.apiKey = "Paste the Trello API key."
    if (!accessToken.trim()) found.accessToken = `Paste the ${tokenWord}.`
    setMissing(found)
    const first = FIELD_ORDER.find((k) => found[k])
    if (first) {
      refs[first].current?.focus()
      return
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
            <Field label="Atlassian site URL" error={missing.siteURL}>
              <Input
                ref={refs.siteURL}
                type="url"
                inputMode="url"
                value={siteURL}
                onChange={(e) => {
                  setSiteURL(e.target.value)
                  clear("siteURL")
                }}
                placeholder="https://acme.atlassian.net…"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          )}
          {needsEmail && (
            <Field label="Atlassian account email" error={missing.email}>
              <Input
                ref={refs.email}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clear("email")
                }}
                placeholder="you@company.com…"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          )}
          {needsApiKey && (
            <Field label="API key" error={missing.apiKey}>
              <Input
                ref={refs.apiKey}
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  clear("apiKey")
                }}
                placeholder="The 32-character Trello API key…"
                autoComplete="off"
              />
            </Field>
          )}
          <Field
            label={needsApiKey ? "User token" : needsEmail ? "API token" : "Access token"}
            help={TOKEN_HINT[provider]}
            error={missing.accessToken}
          >
            <Input
              ref={refs.accessToken}
              type="password"
              value={accessToken}
              onChange={(e) => {
                setAccessToken(e.target.value)
                clear("accessToken")
              }}
              placeholder="Paste the token…"
              autoComplete="off"
            />
          </Field>
          <Field label="Workspace label (optional)">
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Acme Inc."
              autoComplete="off"
            />
          </Field>
        </div>

        {problem && (
          <p role="alert" className="cx-imp-note text-sm text-danger-ink">
            {problem}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} busy={submitting}>
            {submitting ? `Checking with ${importProviderLabel(provider)}…` : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
