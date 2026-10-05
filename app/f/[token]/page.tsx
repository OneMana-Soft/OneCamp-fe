"use client"

// A public intake form: answer the questions, press Send, done. Whatever is
// sent becomes a task for the team that shared the link. No account needed.

import { use, useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getForm, sendForm, type PublicForm } from "@/services/formService"
import type { FormField } from "@/lib/forms/forms"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

export default function IntakeForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [form, setForm] = useState<PublicForm | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "sent">("loading")
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [website, setWebsite] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getForm(token).then((res) => {
      if (res.ok) {
        setForm(res.data)
        setState("ready")
        document.title = res.data.title
      } else setState("missing")
    })
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await sendForm(token, answers, website)
    setBusy(false)
    if (res.ok) setState("sent")
    else setError(res.msg)
  }

  if (state === "loading") return <Centered><Loader2 className="h-7 w-7 animate-spin text-primary" /></Centered>
  if (state === "missing" || !form) {
    return (
      <Centered>
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-base font-semibold">This form isn&apos;t available</p>
        <p className="max-w-sm text-sm text-muted-foreground">The link may be wrong, or the team has closed the form.</p>
      </Centered>
    )
  }
  if (state === "sent") {
    return (
      <Centered>
        <CheckCircle2 className="h-10 w-10 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Sent</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Thanks. The team has it now.</p>
        <Button variant="outline" onClick={() => { setAnswers({}); setState("ready") }}>Send another</Button>
      </Centered>
    )
  }

  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }))
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:py-14">
      <form onSubmit={submit} className="mx-auto grid max-w-xl gap-6 rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <header className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{form.title}</h1>
          {form.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{form.description}</p>}
        </header>
        {form.fields.map((f) => (
          <Question key={f.id} field={f} value={answers[f.id]} onChange={(v) => set(f.id, v)} />
        ))}
        {/* Hidden from people; a bot that fills every field fills this one. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="f-website">Website</label>
          <input id="f-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="justify-self-start">
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Send
        </Button>
      </form>
      <MadeWithOneCamp surface="form" className="mt-6" />
    </main>
  )
}

function Question({ field, value, onChange }: { field: FormField; value: unknown; onChange: (v: unknown) => void }) {
  const id = `q-${field.id}`
  const label = (
    <Label htmlFor={id} className="text-sm font-medium">
      {field.label}
      {field.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
    </Label>
  )
  const str = typeof value === "string" ? value : ""
  switch (field.type) {
    case "long_text":
      return <div className="grid gap-1.5">{label}<Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} required={field.required} maxLength={5000} rows={4} /></div>
    case "select":
      return (
        <div className="grid gap-1.5">
          {label}
          <Select value={str} onValueChange={onChange}>
            <SelectTrigger id={id} aria-required={field.required}><SelectValue placeholder="Choose one" /></SelectTrigger>
            <SelectContent>{(field.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )
    case "checkbox":
      return (
        <label className="flex items-start gap-2 text-sm" htmlFor={id}>
          <input id={id} type="checkbox" className="mt-0.5" checked={value === true} onChange={(e) => onChange(e.target.checked)} required={field.required} />
          <span>{field.label}{field.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}</span>
        </label>
      )
    default: {
      const type = field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} type={type} value={str} onChange={(e) => onChange(e.target.value)} required={field.required} maxLength={300}
            autoComplete={field.type === "email" ? "email" : undefined} inputMode={field.type === "number" ? "decimal" : undefined} />
        </div>
      )
    }
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">{children}</main>
}
