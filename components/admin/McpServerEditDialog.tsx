"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { Loader2, Plug, Check, X, AlertTriangle } from "@/lib/icons"
import {
  McpServer,
  McpServerInput,
  McpAuthType,
  McpTool,
  McpCatalogEntry,
  createMcpServer,
  updateMcpServer,
  testMcpServer,
} from "@/services/mcpService"
import { McpToolRiskBadge, McpToolRiskLegend } from "./McpToolRisk"
import { Field } from "@/components/ui/field"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { apiErrorMessage } from "@/lib/utils/apiError"

interface McpServerEditDialogProps {
  server: McpServer | null
  open: boolean
  onClose: () => void
  onSaved: () => void
  // prefill seeds a fresh (create) dialog from a catalog connector, so the admin
  // only fills the deployed URL + secret. Ignored when editing an existing server.
  prefill?: McpCatalogEntry | null
}

const AUTH_TYPES: { value: McpAuthType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer token" },
  { value: "header", label: "Custom header" },
]

export function McpServerEditDialog({ server, open, onClose, onSaved, prefill }: McpServerEditDialogProps) {
  const { toast } = useToast()
  const editing = !!server

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [authType, setAuthType] = React.useState<McpAuthType>("none")
  const [authHeaderName, setAuthHeaderName] = React.useState("")
  const [authSecret, setAuthSecret] = React.useState("")
  const [secretTouched, setSecretTouched] = React.useState(false)
  const [enabled, setEnabled] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  // Each problem under the field it is about: one red line at the dialog's
  // foot, tied to no field, was all there was.
  const [errors, setErrors] = React.useState<{ name?: string; url?: string; header?: string }>({})
  const nameRef = React.useRef<HTMLInputElement>(null)
  const urlRef = React.useRef<HTMLInputElement>(null)
  const headerRef = React.useRef<HTMLInputElement>(null)

  // Test connection
  const [testing, setTesting] = React.useState(false)
  const [tools, setTools] = React.useState<McpTool[] | null>(null)
  const [testError, setTestError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    if (server) {
      setName(server.name)
      setDescription(server.description || "")
      setUrl(server.url)
      setAuthType(server.auth_type)
      setAuthHeaderName(server.auth_header_name || "")
      setEnabled(server.enabled)
    } else if (prefill) {
      // Catalog install: seed everything the connector specifies; the admin
      // still supplies the deployed URL and (if needed) the secret.
      setName(prefill.name)
      setDescription(prefill.description || "")
      setUrl("")
      setAuthType(prefill.auth_type)
      setAuthHeaderName(prefill.auth_header_name || "")
      setEnabled(true)
    } else {
      setName("")
      setDescription("")
      setUrl("")
      setAuthType("none")
      setAuthHeaderName("")
      setEnabled(true)
    }
    setAuthSecret("")
    setSecretTouched(false)
    setErrors({})
    setTools(null)
    setTestError(null)
  }, [open, server, prefill])

  const buildInput = (): McpServerInput => ({
    name: name.trim(),
    description: description.trim() || undefined,
    url: url.trim(),
    auth_type: authType,
    auth_header_name: authType === "header" ? authHeaderName.trim() : undefined,
    auth_secret: secretTouched ? authSecret : undefined,
    enabled,
  })

  const validate = () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = "Give the server a name."
    if (!url.trim() || !/^https?:\/\//i.test(url.trim())) next.url = "Enter its address, starting with https:// or http://."
    if (authType === "header" && !authHeaderName.trim()) next.header = "Enter the header's name."
    return next
  }

  const handleSave = async () => {
    const next = validate()
    setErrors(next)
    if (next.name) return nameRef.current?.focus()
    if (next.url) return urlRef.current?.focus()
    if (next.header) return headerRef.current?.focus()
    setSaving(true)
    try {
      if (editing && server) await updateMcpServer(server.id, buildInput(), secretTouched)
      else await createMcpServer(buildInput())
      toast({ title: editing ? `${name.trim()} saved` : `${name.trim()} added`, description: "Its tools appear in a moment." })
      onSaved()
    } catch {
      // interceptor surfaces the error
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!editing || !server) {
      toast({ title: "Save first", description: "Add the server, then test the connection." })
      return
    }
    setTesting(true)
    setTools(null)
    setTestError(null)
    try {
      const res = await testMcpServer(server.id)
      if (res.ok) {
        setTools(res.tools || [])
      } else {
        setTestError(res.msg || "Couldn't connect. Check the address and the secret, then test again.")
      }
    } catch (e) {
      setTestError(`Couldn't connect. ${apiErrorMessage(e, "Check the address and the secret, then test again.")}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {/* The title's icon on the AI and automation group's tile; it was
              orange, which is for the one action a view asks for. */}
          <DialogTitle className="flex items-center gap-2.5">
            <Tile hue={ADMIN_GROUP_HUE.ai} size="sm">
              <Plug />
            </Tile>
            {editing ? "Edit the MCP server" : "Add an MCP server"}
          </DialogTitle>
          <DialogDescription>
            Its tools are offered to your agents once it connects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name" error={errors.name}>
            <Input
              ref={nameRef}
              id="mcp-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name) setErrors((er) => ({ ...er, name: undefined }))
              }}
              placeholder="GitHub…"
              maxLength={120}
              autoComplete="off"
            />
          </Field>

          <Field label="What it gives agents" help="Optional.">
            <Input id="mcp-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} autoComplete="off" />
          </Field>

          {!editing && prefill && (
            <p className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground">
              Run the {prefill.name} MCP server, then paste its address below.{" "}
              <a href={prefill.docs_url} target="_blank" rel="noreferrer" className="text-primary underline">
                Setup guide
              </a>
              .
            </p>
          )}

          <Field label="Server address" error={errors.url}>
            <Input
              ref={urlRef}
              id="mcp-url"
              type="url"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                if (errors.url) setErrors((er) => ({ ...er, url: undefined }))
              }}
              placeholder={(!editing && prefill?.url_placeholder) || "https://mcp.example.com/sse…"}
            />
          </Field>

          {/* A choice of one: a segmented radio group, not three buttons with
              the chosen one drawn in the accent. */}
          <div className="grid gap-2">
            <p id="mcp-auth-label" className="text-sm font-medium">How it signs in</p>
            <div role="radiogroup" aria-labelledby="mcp-auth-label" className="inline-flex w-fit flex-wrap gap-1 rounded-md bg-muted p-1">
              {AUTH_TYPES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={authType === a.value}
                  onClick={() => setAuthType(a.value)}
                  className={cn(
                    "h-8 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    authType === a.value ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {authType === "header" && (
            <Field label="Header name" error={errors.header}>
              <Input
                ref={headerRef}
                id="mcp-header"
                value={authHeaderName}
                onChange={(e) => {
                  setAuthHeaderName(e.target.value)
                  if (errors.header) setErrors((er) => ({ ...er, header: undefined }))
                }}
                placeholder="X-API-Key…"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
          )}

          {authType !== "none" && (
            <div className="grid gap-2">
              <Label htmlFor="mcp-secret">{authType === "bearer" ? "Token" : "Header value"}</Label>
              <Input
                id="mcp-secret"
                type="password"
                value={authSecret}
                onChange={(e) => {
                  setAuthSecret(e.target.value)
                  setSecretTouched(true)
                }}
                placeholder={
                  editing && server?.auth_secret_unreadable
                    ? "Enter the secret again"
                    : editing && server?.has_auth_secret
                      ? "Saved: leave empty to keep it"
                      : ""
                }
                autoComplete="new-password"
              />
              {/* Offering to keep a secret that cannot be decrypted is the one thing
                  this field must not do: leaving it blank would look like a save and
                  change nothing. */}
              {editing && server?.auth_secret_unreadable && (
                <p className="text-xs text-danger-ink">
                  The saved secret can&apos;t be read, so it can&apos;t be kept. Enter it again to make this server usable.
                </p>
              )}
              {!editing && prefill?.secret_hint && (
                <p className="text-xs text-muted-foreground">{prefill.secret_hint}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="mcp-enabled" />
            <Label htmlFor="mcp-enabled">Use this server</Label>
          </div>

          {/* Test connection (saved servers only) */}
          {editing && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5">
                  <Plug className="h-3.5 w-3.5" /> Connection
                </Label>
                <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="gap-1.5">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                  Test connection
                </Button>
              </div>
              {testError && (
                <p className="flex items-center gap-1.5 text-xs text-danger-ink">
                  <AlertTriangle className="h-3.5 w-3.5" /> {testError}
                </p>
              )}
              {tools && (
                <div className="space-y-1.5 text-sm">
                  <p className="text-xs font-medium text-foreground">
                    Connected · {tools.length} tool{tools.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((t) => (
                      <span
                        key={t.name}
                        className="inline-flex items-center gap-1 rounded-sm border bg-background px-2 py-0.5 text-2xs"
                      >
                        {t.name}
                        <McpToolRiskBadge tool={t} compact />
                      </span>
                    ))}
                  </div>
                  {tools.length > 0 && <McpToolRiskLegend />}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="gap-1.5">
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {editing ? "Save changes" : "Add server"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

