"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Database, AlertTriangle, Lock, Play, Check } from "@/lib/icons"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { apiErrorMessage } from "@/lib/utils/apiError"
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

// Native selects: explicit background and ink (Windows draws them dark-on-dark
// otherwise), and the focus ring every other control has.
const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"

type FieldErrors = { name?: string; host?: string; database?: string }

export function DataSourceEditDialog({ source, open, onClose, onSaved }: DataSourceEditDialogProps) {
  // Each missing field said under it, the cursor on the first; one line at the
  // foot ("Name, host and database are required.") was tied to none of them.
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({})
  const nameRef = React.useRef<HTMLInputElement>(null)
  const hostRef = React.useRef<HTMLInputElement>(null)
  const dbRef = React.useRef<HTMLInputElement>(null)
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
    } catch (e) {
      // It had no catch: a test that threw left nothing on screen.
      setTestResult({ ok: false, message: `Couldn't connect. ${apiErrorMessage(e, "Check the address and the password, then test again.")}` })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    const next: FieldErrors = {}
    if (!name.trim()) next.name = "Give the source a name."
    if (!host.trim()) next.host = "Enter the database's host."
    if (!database.trim()) next.database = "Enter the database's name."
    setFieldErrors(next)
    if (next.name) return nameRef.current?.focus()
    if (next.host) return hostRef.current?.focus()
    if (next.database) return dbRef.current?.focus()
    setSaving(true)
    try {
      if (editing && source) {
        await updateDataSource(source.id, input)
      } else {
        await createDataSource(input)
      }
      toast({ title: editing ? `${name.trim()} saved` : `${name.trim()} added` })
      onSaved()
    } catch (e: unknown) {
      setError(`Couldn't save the data source. ${apiErrorMessage(e, "Try again in a moment.")}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          {/* On the AI and automation group's tile; it was orange. */}
          <DialogTitle className="flex items-center gap-2.5">
            <Tile hue={ADMIN_GROUP_HUE.ai} size="sm">
              <Database />
            </Tile>
            {editing ? "Edit the data source" : "Add a data source"}
          </DialogTitle>
          <DialogDescription>
            A read-only connection to an outside SQL database. Connections are opened read-only, but an account that
            can only read is safest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ds-name">Name</Label>
              <Input
                ref={nameRef}
                id="ds-name"
                value={name}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? "ds-name-error" : undefined}
                onChange={(e) => {
                  setName(e.target.value)
                  if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }))
                }}
                placeholder="Analytics warehouse…"
                autoComplete="off"
              />
              {fieldErrors.name && <p id="ds-name-error" className="text-xs font-medium text-danger-ink">{fieldErrors.name}</p>}
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
              <Input
                ref={hostRef}
                id="ds-host"
                value={host}
                aria-invalid={fieldErrors.host ? true : undefined}
                aria-describedby={fieldErrors.host ? "ds-host-error" : undefined}
                onChange={(e) => {
                  setHost(e.target.value)
                  if (fieldErrors.host) setFieldErrors((f) => ({ ...f, host: undefined }))
                }}
                placeholder="db.internal…"
                spellCheck={false}
                autoComplete="off"
              />
              {fieldErrors.host && <p id="ds-host-error" className="text-xs font-medium text-danger-ink">{fieldErrors.host}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-port">Port</Label>
              <Input id="ds-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))} placeholder="5432" autoComplete="off" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ds-db">Database</Label>
              <Input
                ref={dbRef}
                id="ds-db"
                value={database}
                aria-invalid={fieldErrors.database ? true : undefined}
                aria-describedby={fieldErrors.database ? "ds-db-error" : undefined}
                onChange={(e) => {
                  setDatabase(e.target.value)
                  if (fieldErrors.database) setFieldErrors((f) => ({ ...f, database: undefined }))
                }}
                placeholder="analytics…"
                spellCheck={false}
                autoComplete="off"
              />
              {fieldErrors.database && <p id="ds-db-error" className="text-xs font-medium text-danger-ink">{fieldErrors.database}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-user">Username</Label>
              <Input id="ds-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="readonly…" spellCheck={false} autoComplete="off" />
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
              placeholder={editing ? "Saved: leave empty to keep it" : ""}
              autoComplete="new-password"
              aria-describedby={needsPasswordForInlineTest ? "ds-test-guidance" : undefined}
            />
            {needsPasswordForInlineTest && (
              <div
                id="ds-test-guidance"
                role="note"
                className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs text-warning-ink"
              >
                <Lock className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
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
                <option value="private">Only me and admins</option>
                <option value="workspace">Everyone here</option>
              </select>
            </div>
          </div>

          {visibility === "workspace" && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs text-warning-ink">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>
                Everyone here, and their agents, can query it with this one saved account: the outside database
                can&apos;t tell people apart. Use an account that can only read.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="ds-enabled">Use this source</Label>
              <p id="ds-enabled-help" className="text-xs text-muted-foreground">Agents can query it only while this is on.</p>
            </div>
            <Switch id="ds-enabled" aria-describedby="ds-enabled-help" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-danger-ink">
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {testResult && (
          <div
            role="status"
            className={
              "flex items-start gap-2 rounded-lg border p-2 text-xs " +
              (testResult.ok
                ? "border-success/30 bg-success/5 text-success-ink"
                : "border-destructive/30 bg-destructive/5 text-danger-ink")
            }
          >
            {testResult.ok ? (
              <Check className="mt-px h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
            )}
            <span>{testResult.ok ? "It connects." : testResult.message}</span>
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

