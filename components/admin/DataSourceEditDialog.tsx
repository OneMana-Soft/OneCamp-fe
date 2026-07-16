"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Database, AlertTriangle, Lock, Play, Check } from "@/lib/icons"
import {
  DataSource,
  DataSourceInput,
  DataSourceEngine,
  DataSourceSSLMode,
  DataSourceVisibility,
  createDataSource,
  updateDataSource,
  testDataSource,
  testDataSourceConfig,
} from "@/services/dataSourceService"

interface DataSourceEditDialogProps {
  source: DataSource | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const SSL_MODES: { value: DataSourceSSLMode; label: string }[] = [
  { value: "disable", label: "disable" },
  { value: "require", label: "require (encryption only)" },
  { value: "verify-ca", label: "verify-ca (verify certificate)" },
  { value: "verify-full", label: "verify-full (recommended)" },
]

// Supported engines + their default ports. Adding an engine here (and in the BE
// registry) is all it takes to surface it in the connect dialog.
const ENGINES: { value: DataSourceEngine; label: string; port: number }[] = [
  { value: "postgres", label: "PostgreSQL", port: 5432 },
  { value: "mysql", label: "MySQL", port: 3306 },
]

const CONNECTION_FIELDS = ["engine", "host", "port", "database", "username", "ssl_mode"] as const

function defaultPort(engine: DataSourceEngine): number {
  return ENGINES.find((e) => e.value === engine)?.port ?? 5432
}

function hasConnectionChanges(source: DataSource, input: DataSourceInput): boolean {
  return CONNECTION_FIELDS.some((field) => source[field] !== input[field])
}

const selectCls =
  "h-9 w-full rounded-md border border-border/70 bg-background px-2 text-sm outline-none focus:border-primary/60"

export function DataSourceEditDialog({ source, open, onClose, onSaved }: DataSourceEditDialogProps) {
  const { toast } = useToast()
  const editing = !!source

  const [name, setName] = React.useState("")
  const [engine, setEngine] = React.useState<DataSourceEngine>("postgres")
  const [host, setHost] = React.useState("")
  const [port, setPort] = React.useState("5432")
  const [database, setDatabase] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [passwordTouched, setPasswordTouched] = React.useState(false)
  const [sslMode, setSslMode] = React.useState<DataSourceSSLMode>("require")
  const [visibility, setVisibility] = React.useState<DataSourceVisibility>("private")
  const [enabled, setEnabled] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setTestResult(null)
    setPasswordTouched(false)
    setPassword("")
    if (source) {
      setName(source.name)
      setEngine(source.engine)
      setHost(source.host)
      setPort(String(source.port))
      setDatabase(source.database)
      setUsername(source.username)
      setSslMode(source.ssl_mode)
      setVisibility(source.visibility)
      setEnabled(source.enabled)
    } else {
      setName("")
      setEngine("postgres")
      setHost("")
      setPort("5432")
      setDatabase("")
      setUsername("")
      setSslMode("require")
      setVisibility("private")
      setEnabled(true)
    }
  }, [open, source])

  // When the engine changes, move the port to the new engine's default IF the
  // field still holds a known default (never clobber a value the admin typed).
  const handleEngineChange = (next: DataSourceEngine) => {
    setEngine(next)
    const known = ENGINES.some((e) => String(e.port) === port.trim())
    if (port.trim() === "" || known) {
      setPort(String(defaultPort(next)))
    }
  }

  const buildInput = (): DataSourceInput => {
    const input: DataSourceInput = {
      name: name.trim(),
      engine,
      host: host.trim(),
      port: Number(port) || defaultPort(engine),
      database: database.trim(),
      username: username.trim(),
      ssl_mode: sslMode,
      visibility,
      enabled,
    }
    // Password is write-only: only send it when the admin actually typed one, so
    // editing without touching it never clears the stored credential.
    if (!editing || passwordTouched) {
      input.password = password
    }
    return input
  }

  const input = buildInput()
  const connectionChanged = source ? hasConnectionChanges(source, input) : false
  const needsPasswordForInlineTest =
    editing && (connectionChanged || passwordTouched) && password.length === 0

  const handleTest = async () => {
    setTestResult(null)
    if (!host.trim() || !database.trim()) {
      setTestResult({ ok: false, message: "Enter host and database first." })
      return
    }

    // A saved-source test is the only safe way to use an existing write-only
    // credential. Testing edited connection details inline requires the admin to
    // explicitly provide that credential again.
    if (needsPasswordForInlineTest) {
      setTestResult({
        ok: false,
        message:
          "Save these connection changes and test the saved source, or re-enter the password to test before saving.",
      })
      return
    }

    setTesting(true)
    try {
      const res =
        source && !connectionChanged && !passwordTouched
          ? await testDataSource(source.id)
          : await testDataSourceConfig(input)
      setTestResult(res)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    if (!name.trim() || !host.trim() || !database.trim()) {
      setError("Name, host and database are required.")
      return
    }
    setSaving(true)
    try {
      if (editing && source) {
        await updateDataSource(source.id, input)
      } else {
        await createDataSource(input)
      }
      toast({ title: editing ? "Data source updated" : "Data source added" })
      onSaved()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg ||
        "Could not save the data source."
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            {editing ? "Edit data source" : "Add data source"}
          </DialogTitle>
          <DialogDescription>
            A read-only connection to an external SQL database. Use a least-privilege,
            read-only account — connections are opened read-only, but a scoped account is safest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ds-name">Name</Label>
              <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Analytics warehouse" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-engine">Engine</Label>
              <select
                id="ds-engine"
                className={selectCls}
                value={engine}
                onChange={(e) => handleEngineChange(e.target.value as DataSourceEngine)}
              >
                {ENGINES.map((en) => (
                  <option key={en.value} value={en.value}>{en.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ds-host">Host</Label>
              <Input id="ds-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="db.internal" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-port">Port</Label>
              <Input id="ds-port" value={port} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))} placeholder="5432" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ds-db">Database</Label>
              <Input id="ds-db" value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="analytics" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-user">Username</Label>
              <Input id="ds-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="readonly" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ds-pass" className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Password
            </Label>
            <Input
              id="ds-pass"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setPasswordTouched(true)
              }}
              placeholder={editing ? "•••••••• (leave blank to keep current)" : "connection password"}
              autoComplete="new-password"
              aria-describedby={needsPasswordForInlineTest ? "ds-test-guidance" : undefined}
            />
            {needsPasswordForInlineTest && (
              <div
                id="ds-test-guidance"
                role="note"
                className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-400"
              >
                <Lock className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Stored passwords can&apos;t be used with unsaved connection changes. Save first and
                  test the saved source, or re-enter the password to test before saving.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ds-ssl">SSL mode</Label>
              <select id="ds-ssl" className={selectCls} value={sslMode} onChange={(e) => setSslMode(e.target.value as DataSourceSSLMode)}>
                {SSL_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-vis">Who can query</Label>
              <select id="ds-vis" className={selectCls} value={visibility} onChange={(e) => setVisibility(e.target.value as DataSourceVisibility)}>
                <option value="private">Private (only me + admins)</option>
                <option value="workspace">Workspace (any member)</option>
              </select>
            </div>
          </div>

          {visibility === "workspace" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
              <span>
                A workspace-visible source is queryable by every member (and their agents) using this
                one stored credential — the external DB can&apos;t enforce per-user access. Prefer a
                read-only, least-privilege account.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="space-y-0.5">
              <Label>Enabled</Label>
              <p className="text-[11px] text-muted-foreground">Agents can query this source only when enabled.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {testResult && (
          <div
            className={
              "flex items-start gap-2 rounded-lg border p-2 text-xs " +
              (testResult.ok
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/5 text-destructive")
            }
          >
            {testResult.ok ? (
              <Check className="mt-px h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
            )}
            <span>{testResult.ok ? "Connection succeeded." : testResult.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="outline" onClick={handleTest} disabled={testing || saving}>
            {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            Test connection
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add source"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DataSourceEditDialog
