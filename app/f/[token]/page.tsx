"use client"

// A public intake form: answer the questions, press Send, done. Whatever is
// sent becomes a task for the team that shared the link. No account needed.
//
// Design v3 (work.md W46): the frame with the form's light at the top, one
// sheet card, each question's label with "Required" in words (not a red
// star), and a sent state whose moss badge springs in with one spark.

import { use, useEffect, useRef, useState } from "react"
import { Check, Loader2 } from "@/lib/icons"
import { PublicGone } from "@/components/guest/publicStates"
import { publicTrouble } from "@/services/publicApi"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor } from "@/lib/campHue"
import { celebrateTask, warmBurstsWhenIdle } from "@/lib/celebrateSoon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DateField } from "@/components/ui/date-field"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getForm, sendForm, type PublicForm } from "@/services/formService"
import { numberProblem, type FormField } from "@/lib/forms/forms"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"
import { SpamTrap } from "@/components/common/SpamTrap"

export default function IntakeForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [form, setForm] = useState<PublicForm | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed" | "sent">("loading")
  // Bumped by Try again, to read the form again.
  const [attempt, setAttempt] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [website, setWebsite] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // The sent badge's spark is lib/celebrate's, fetched once the page is idle.
  useEffect(() => warmBurstsWhenIdle(), [])

  useEffect(() => {
    getForm(token).then((res) => {
      if (res.ok) {
        setForm(res.data)
        setState("ready")
        document.title = res.data.title
      } else {
        // A busy or unreachable server isn't a closed form: it says so, with Try again.
        setState(publicTrouble(res.status) === "gone" ? "missing" : "failed")
      }
    })
  }, [token, attempt])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // A number in the sender's own signs, said before anything is sent.
    const problem = form ? numberProblem(form.fields, answers) : ""
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError("")
    const res = await sendForm(token, answers, website)
    setBusy(false)
    if (res.ok) setState("sent")
    else setError(res.msg)
  }

  if (state === "loading") return <Centered><Loader2 className="size-7 animate-spin text-ink-3" aria-label="Opening the form" /></Centered>
  if (state === "failed") {
    return (
      <PublicGone
        surface="form"
        noun="form"
        kind="failed"
        onRetry={() => {
          setState("loading")
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (state === "missing" || !form) {
    // As every public link says it (PublicGone): it was a lone grey ring with no frame (PTC-19).
    return <PublicGone surface="form" noun="form" detail="The link may be wrong, or the team has closed the form." />
  }
  const hue = hueFor(form.title || token)
  if (state === "sent") {
    return (
      <FormFrame hue={hue}>
        <Sent title={form.title} onAnother={() => { setAnswers({}); setState("ready") }} />
      </FormFrame>
    )
  }

  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }))
  return (
    <FormFrame hue={hue}>
      <form onSubmit={submit} data-form-sheet="" className="mx-auto grid max-w-[560px] gap-6 rounded-2xl bg-sheet p-6 shadow-e2 sm:p-8">
        <header className="grid gap-2">
          <h1 className="text-title-1 font-semibold text-balance text-foreground">{form.title}</h1>
          {form.description && <p className="whitespace-pre-line text-ui text-ink-2">{form.description}</p>}
        </header>
        {form.fields.map((f) => (
          <Question key={f.id} field={f} value={answers[f.id]} onChange={(v) => set(f.id, v)} />
        ))}
        <SpamTrap id="f-website" value={website} onChange={setWebsite} />
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
        <Button type="submit" size="lg" disabled={busy} className="justify-self-start">
          {busy && <Loader2 className="size-4 animate-spin" />}
          Send
        </Button>
      </form>
    </FormFrame>
  )
}

/** The page around the card: the frame, the form's light at its top, the credit under it. */
function FormFrame({ hue, children }: { hue: ReturnType<typeof hueFor>; children: React.ReactNode }) {
  return (
    <main className={`${HUE_CLASS[hue]} relative isolate min-h-dvh bg-frame px-4 py-8 sm:py-14`}>
      <div aria-hidden="true" data-form-band="" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[260px] [background:radial-gradient(560px_240px_at_50%_0px,color-mix(in_oklab,var(--hue)_12%,transparent),transparent)]" />
      {children}
      <MadeWithOneCamp surface="form" className="mt-6" />
    </main>
  )
}

/** Sent: a moss badge that springs in with one spark, and the way to send another. */
function Sent({ title, onAnother }: { title: string; onAnother: () => void }) {
  const badge = useRef<HTMLSpanElement>(null)
  const sparked = useRef(false)
  useEffect(() => {
    if (sparked.current) return
    sparked.current = true
    celebrateTask(badge.current)
  }, [])
  return (
    <section data-form-sent="" className="mx-auto grid max-w-[560px] justify-items-center gap-3 rounded-2xl bg-sheet p-8 text-center shadow-e2 sm:p-10" aria-live="polite">
      <span ref={badge} className="hue-moss flex size-12 items-center justify-center rounded-full bg-hue text-white [animation:work-check-fill_220ms_var(--ease-spring)_both]">
        <Check className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-title-2 font-semibold text-foreground">Sent</h1>
      <p className="max-w-sm text-ui text-ink-2">Thanks. The team behind &ldquo;{title}&rdquo; has it now.</p>
      <Button variant="secondary" onClick={onAnother}>Send another</Button>
    </section>
  )
}

function Question({ field, value, onChange }: { field: FormField; value: unknown; onChange: (v: unknown) => void }) {
  const id = `q-${field.id}`
  const label = (
    <Label htmlFor={id} className="flex items-baseline justify-between gap-2 text-ui-sm font-medium text-foreground">
      {field.label}
      {field.required && <RequiredWord />}
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
          <span className="flex flex-1 items-baseline justify-between gap-2">{field.label}{field.required && <RequiredWord />}</span>
        </label>
      )
    case "date":
      return (
        <div className="grid gap-1.5">
          {label}
          <DateField id={id} value={str} onChange={onChange} required={field.required} />
        </div>
      )
    default: {
      // A number is typed as text in the person's own signs ("1,5" in de-DE),
      // which the form reads and sends as typed: a browser number input
      // rewrote it in the browser's locale, or emptied it. A date is the
      // app's own DateField (above), never a browser's date box.
      const type = field.type === "email" ? "email" : "text"
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} type={type} value={str} onChange={(e) => onChange(e.target.value)} required={field.required} maxLength={300}
            autoComplete={field.type === "email" ? "email" : undefined} spellCheck={field.type === "email" ? false : undefined} inputMode={field.type === "number" ? "decimal" : undefined} />
        </div>
      )
    }
  }
}

/** "Required" in words beside a label: a red star said it to sighted people only. */
function RequiredWord() {
  return <span className="text-xs font-normal text-ink-3">Required</span>
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-frame px-4 text-center">{children}</main>
}
