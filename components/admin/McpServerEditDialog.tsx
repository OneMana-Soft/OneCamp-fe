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
  createMcpServer,
  updateMcpServer,
  testMcpServer,
} from "@/services/mcpService"

interface McpServerEditDialogProps {
  server: McpServer | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const AUTH_TYPES: { value: McpAuthType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer token" },
  { value: "header", label: "Custom header" },
]

export function McpServerEditDialog({ server, open, onClose, onSaved }: McpServerEditDialogProps) {
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
  const [error, setError] = React.useState<string | null>(null)

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
    setError(null)
    setTools(null)
    setTestError(null)
  }, [open, server])

  const buildInput = (): McpServerInput => ({
    name: name.trim(),
    description: description.trim() || undefined,
    url: url.trim(),
    auth_type: authType,
    auth_header_name: authType === "header" ? authHeaderName.trim() : undefined,
    auth_secret: secretTouched ? authSecret : undefined,
    enabled,
  })

  const validate = (): string | null => {
    if (!name.trim()) return "Give the server a name."
    if (!url.trim() || !/^https?:\/\//i.test(url.trim())) return "Enter a valid http(s) URL."
    if (authType === "header" && !authHeaderName.trim()) return "Enter the header name."
    return null
  }

  const handleSave = async () => {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (editing && server) await updateMcpServer(server.id, buildInput(), secretTouched)
      else await createMcpServer(buildInput())
      toast({ title: editing ? "Server updated" : "Server added", description: "Introspecting tools in the background." })
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
        setTestError(res.msg || "Could not connect.")
      }
    } catch {
      setTestError("Could not connect.")
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" />
            {editing ? "Edit MCP server" : "Add MCP server"}
          </DialogTitle>
          <DialogDescription>
            Connect an external MCP server to give your agents new tools. Its tools become available
            in the agent builder once connected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="mcp-name">Name</Label>
            <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GitHub" maxLength={120} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="mcp-desc">Description</Label>
            <Input id="mcp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this server provides (optional)" maxLength={500} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="mcp-url">Server URL</Label>
            <Input id="mcp-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/sse" />
          </div>

          <div className="grid gap-2">
            <Label>Authentication</Label>
            <div className="flex flex-wrap gap-1.5">
              {AUTH_TYPES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAuthType(a.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    authType === a.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {authType === "header" && (
            <div className="grid gap-2">
              <Label htmlFor="mcp-header">Header name</Label>
              <Input id="mcp-header" value={authHeaderName} onChange={(e) => setAuthHeaderName(e.target.value)} placeholder="e.g. X-API-Key" />
            </div>
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
                placeholder={editing && server?.has_auth_secret ? "•••••••• (leave blank to keep)" : "Secret value"}
                autoComplete="new-password"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} id="mcp-enabled" />
            <Label htmlFor="mcp-enabled">Enabled</Label>
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

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
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> {testError}
                </p>
              )}
              {tools && (
                <div className="text-sm">
                  <p className="mb-1 text-xs font-medium text-foreground">
                    Connected · {tools.length} tool{tools.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((t) => (
                      <span key={t.name} className="rounded-full border bg-background px-2 py-0.5 text-[11px]">{t.name}</span>
                    ))}
                  </div>
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

export default McpServerEditDialog
