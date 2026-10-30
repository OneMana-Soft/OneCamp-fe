"use client"

// A form's pages, as a visitor answers them (app/f/[token]) and as its
// builder previews them (components/project/ProjectFormsDialog): a section's
// questions at a time with Back and Next, the questions the answers open
// (lib/forms/branch), each answer checked as the server checks it and said
// at its question (lib/forms/answers), and the form's own words once sent.
// Only the shown questions' answers are sent. A question that takes files
// (FileQuestion) sends each file as it is picked, under one claim of the
// page's own, which the form is sent with; its answer is the files' ids.

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, Plus } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { celebrateTask, warmBurstsWhenIdle } from "@/lib/celebrateSoon"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { Bar } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DateField } from "@/components/ui/date-field"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SpamTrap } from "@/components/common/SpamTrap"
import { FileQuestion, sending, type PickedFile } from "@/components/forms/FileQuestion"
import { uploadFormFile } from "@/services/formFiles"
import { MAX_FILES, answerLimit, checkAnswers, firstProblem, type Problem } from "@/lib/forms/answers"
import { pagesOf, shownAnswers, type Answers } from "@/lib/forms/branch"
import { linkHides, prefilled } from "@/lib/forms/prefill"
import type { FormField } from "@/lib/forms/forms"
import { webURL } from "@/lib/links/webURL"

/** What a form shows a visitor (GET /public/form): never what its answers fill. */
export interface FormContent {
  title: string
  description: string
  fields: FormField[]
  confirmation?: string
  /** The page of the team's a visitor goes to once it's sent, in place of the words (tables B5b). */
  redirect?: string
  /** What a file question takes, when the form has one. */
  files?: { max: number; mb: number }
  /** Its cover and its logo, ready to draw (tables B5c-2): the page's from the server, the builder's as picked. */
  cover?: string
  logo?: string
}

/**
 * A form's cover and logo over its title (tables B5c-2): the cover a band across the top of the sheet, the logo a
 * tile on a white ground, as a logo is drawn to sit on, over the band's foot or above the title alone. A picture that
 * can't load (taken off since) is left out rather than drawn broken. Both are the form's dress, not its words, so a
 * screen reader skips them: the title names the form.
 */
function FormLook({ cover, logo, edge, center }: { cover?: string; logo?: string; edge: string; center?: boolean }) {
  const [failed, setFailed] = useState<string[]>([])
  const drawCover = cover && !failed.includes(cover) ? cover : undefined
  const drawLogo = logo && !failed.includes(logo) ? logo : undefined
  if (!drawCover && !drawLogo) return null
  const fail = (src: string) => () => setFailed((f) => [...f, src])
  return (
    // On the thanks card, whose items are centred, the look still spans the card, so its band runs edge to edge (DB-27).
    <div data-form-look="" className={cn("grid", center && "w-full justify-items-center justify-self-stretch")}>
      {drawCover && (
        // The sheet's padding taken back, so the band runs edge to edge under the sheet's rounded top.
        <div className={cn("h-28 overflow-hidden rounded-t-2xl bg-sunken sm:h-36", edge, center && "justify-self-stretch")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture on the API's origin, sized by the band */}
          <img src={drawCover} alt="" data-form-cover="" className="size-full object-cover" onError={fail(drawCover)} />
        </div>
      )}
      {drawLogo && (
        // eslint-disable-next-line @next/next/no-img-element -- a picture on the API's origin, sized by its tile
        <img src={drawLogo} alt="" data-form-logo="" onError={fail(drawLogo)}
          className={cn("relative h-12 w-auto max-w-40 rounded-xl bg-white object-contain p-1.5 shadow-e1 ring-1 ring-black/5", drawCover && "-mt-6")} />
      )}
    </div>
  )
}

/** The largest file a visitor sends when the form doesn't say (business/Form maxVisitorFileMB). */
const FILE_MB = 10

/** A claim for the visitor's files: 32 random bytes, as hex, made by the page. */
function newClaim(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
}

/** The answers with each file question's: the ids of its files the server kept. */
function withFiles(answers: Answers, files: Record<string, PickedFile[]>): Answers {
  const out: Answers = { ...answers }
  for (const [q, list] of Object.entries(files)) {
    const ids = list.filter((f) => f.id && !f.error).map((f) => f.id!)
    if (ids.length) out[q] = ids
    else delete out[q]
  }
  return out
}

/** A preview's stand-in for an upload's id: nothing is sent from the builder. */
let previewFiles = 0
const previewId = () => `00000000-0000-4000-8000-${String(++previewFiles).padStart(12, "0")}`

export function FormPages({
  form,
  hue,
  onSend,
  token,
  preview = false,
  prefill,
}: {
  form: FormContent
  hue: CampHue
  /** Sends the shown answers, with the claim their files went under: "" once sent, or the server's words. */
  onSend: (answers: Answers, website: string, claim: string) => Promise<string>
  /** The form's link, where its files go; none in the builder's preview, which sends no file. */
  token?: string
  /** The builder's preview: Next checks nothing, Send sends nothing, and the headings sit under the dialog's. */
  preview?: boolean
  /** The link's query: its prefill_ answers (lib/forms/prefill), a hidden question's among them, are where the form starts, and starts again. Read here, in the pages' own chunk, so the link's first load doesn't carry the answers' checks. */
  prefill?: string
}) {
  const uid = useId()
  const initial = useMemo(() => (prefill ? prefilled(form.fields, prefill) : {}), [form.fields, prefill])
  // The questions as this link shows them: one its hide_ names is hidden for the visit (tables B5c).
  const fields = useMemo(() => (prefill ? linkHides(form.fields, prefill, initial) : form.fields), [form.fields, prefill, initial])
  const [typed, setAnswers] = useState<Answers>(initial)
  // Each file question's files, and a line for those left out for want of room.
  const [files, setFiles] = useState<Record<string, PickedFile[]>>({})
  // The pictures' object URLs go with the page.
  const pictures = useRef(files)
  useEffect(() => {
    pictures.current = files
  }, [files])
  useEffect(() => () => Object.values(pictures.current).flat().forEach((f) => f.thumb && URL.revokeObjectURL(f.thumb)), [])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const claim = useRef("")
  const aborts = useRef(new Map<string, AbortController>())
  const keys = useRef(0)
  const answers = useMemo(() => withFiles(typed, files), [typed, files])
  const maxFiles = form.files?.max ?? MAX_FILES
  const fileMB = form.files?.mb ?? FILE_MB
  const [at, setAt] = useState(0)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [website, setWebsite] = useState("")
  // Which way the last move went, for the page's entrance, and whether to take focus to its heading.
  const [moved, setMoved] = useState<"next" | "back" | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const pages = useMemo(() => pagesOf(fields, answers), [fields, answers])
  const index = Math.max(0, Math.min(at, pages.length - 1))
  const page = pages[index]
  const last = index >= pages.length - 1
  // Nothing left to ask, because the link answered it all: one quiet line says so, so the
  // visitor doesn't meet a bare title and Send (tables B5c). pagesOf keeps one empty page then.
  const filledByLink = page.questions.length === 0 && Object.keys(initial).length > 0
  const controlId = (id: string) => `${uid}-q-${id}`

  // The sent badge's spark is lib/celebrate's, fetched once the page is idle.
  useEffect(() => (preview ? undefined : warmBurstsWhenIdle()), [preview])
  useEffect(() => {
    if (moved) heading.current?.focus()
  }, [index, moved])
  useEffect(() => {
    if (problem) document.getElementById(controlId(problem.id))?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- controlId reads uid, which never changes
  }, [problem])

  if (sent) {
    return (
      <Sent hue={hue} title={form.title} message={form.confirmation} preview={preview} cover={form.cover} logo={form.logo}
        onAnother={() => {
          setAnswers(initial)
          setFiles({})
          setNotes({})
          claim.current = ""
          setAt(0)
          setMoved(null)
          setSent(false)
        }} />
    )
  }
  if (!page) return null

  const set = (id: string, v: unknown) => {
    setAnswers((a) => ({ ...a, [id]: v }))
    setError("")
    if (problem?.id === id) setProblem(null)
  }
  const changeFile = (q: string, key: string, patch: Partial<PickedFile>) =>
    setFiles((all) => ({ ...all, [q]: (all[q] ?? []).map((f) => (f.key === key ? { ...f, ...patch } : f)) }))
  /** Files picked for q: as many as it has room for, each sent as it is picked (none from the preview), one too big said so at once. */
  const pick = (q: string, picked: File[]) => {
    const room = Math.max(0, maxFiles - (files[q]?.length ?? 0))
    const left = picked.slice(room)
    setNotes((n) => ({ ...n, [q]: left.length ? `Up to ${maxFiles} files here: ${left.map((f) => f.name).join(", ")} ${left.length === 1 ? "was" : "were"} left out.` : "" }))
    const added: PickedFile[] = picked.slice(0, room).map((f) => {
      const p: PickedFile = { key: `${q}-${++keys.current}`, name: f.name, size: f.size, mime: f.type, progress: 0 }
      if (f.size > fileMB * 1024 * 1024) p.error = `Too big: files can be up to ${fileMB} MB.`
      else if (f.type.startsWith("image/") && typeof URL.createObjectURL === "function") p.thumb = URL.createObjectURL(f)
      else if (!token) Object.assign(p, { id: previewId(), progress: 100 })
      return p
    })
    setFiles((all) => ({ ...all, [q]: [...(all[q] ?? []), ...added] }))
    setError("")
    if (problem?.id === q) setProblem(null)
    if (!token) return
    claim.current ||= newClaim()
    added.forEach((p, i) => {
      if (p.error) return
      const abort = new AbortController()
      aborts.current.set(p.key, abort)
      void uploadFormFile(token, q, picked[i], claim.current, (progress) => changeFile(q, p.key, { progress }), abort.signal).then((res) => {
        aborts.current.delete(p.key)
        if (abort.signal.aborted) return
        changeFile(q, p.key, res.ok ? { id: res.data.file.id, progress: 100 } : { error: res.msg })
      })
    })
  }
  const unpick = (q: string, key: string) => {
    aborts.current.get(key)?.abort()
    aborts.current.delete(key)
    const thumb = files[q]?.find((f) => f.key === key)?.thumb
    if (thumb) URL.revokeObjectURL(thumb)
    setFiles((all) => ({ ...all, [q]: (all[q] ?? []).filter((f) => f.key !== key) }))
    setNotes((n) => ({ ...n, [q]: "" }))
  }
  /** A file question of these whose files are still on their way, said at it. */
  const waiting = (questions: FormField[]): Problem | null => {
    const q = questions.find((x) => x.type === "file" && (files[x.id] ?? []).some(sending))
    return q ? { id: q.id, message: "Wait for your files to finish sending." } : null
  }
  const go = (to: number, way: "next" | "back") => {
    setProblem(null)
    setError("")
    setMoved(way)
    setAt(to)
  }
  /** Says what's wrong at its question, on the page it is on. */
  const show = (p: Problem) => {
    const on = pages.findIndex((pg) => pg.questions.some((q) => q.id === p.id))
    if (on >= 0 && on !== index) setAt(on)
    setProblem(p)
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const here = preview ? null : waiting(page.questions) ?? firstProblem(page.questions, answers)
    if (here) return show(here)
    if (!last) return go(index + 1, "next")
    if (preview) return setSent(true)
    // Every page once more, as the server reads them. A hidden question's
    // answer is the link's: one it can't take is left out, never a problem
    // the visitor can't see (tables B5b).
    const drawn = fields.filter((f) => !f.hidden)
    const all = waiting(drawn) ?? checkAnswers(drawn, answers).problem
    if (all) return show(all)
    const sending = shownAnswers(fields, answers)
    for (const f of fields) if (f.hidden && f.id in sending && checkAnswers([f], { [f.id]: sending[f.id] }).problem) delete sending[f.id]
    setBusy(true)
    setError("")
    const said = await onSend(sending, website, claim.current)
    setBusy(false)
    if (said) return setError(said)
    setSent(true)
    // Sent, a form with a page of the team's goes there: only a web link, as the server's helpers.WebLink kept it (tables B5b).
    if (form.redirect && webURL(form.redirect)) window.location.assign(form.redirect)
  }

  const Title = preview ? "h3" : "h1"
  const Section = preview ? "h4" : "h2"
  return (
    // The browser's own bubbles are replaced by the server's words at each
    // question (noValidate): Next and Send still submit, so Enter moves on.
    <form onSubmit={submit} noValidate data-form-sheet="" className={cn(HUE_CLASS[hue], "mx-auto grid w-full max-w-[560px] gap-6 rounded-2xl bg-sheet shadow-e2", preview ? "p-5" : "p-6 sm:p-8")}>
      <FormLook cover={form.cover} logo={form.logo} edge={preview ? "-mx-5 -mt-5" : "-mx-6 -mt-6 sm:-mx-8 sm:-mt-8"} />
      <header className="grid gap-2">
        <Title ref={page.section ? undefined : heading} tabIndex={-1} className={cn("font-semibold text-balance text-foreground", preview ? "text-heading" : "text-title-1")}>
          {form.title}
        </Title>
        {index === 0 && form.description && <p className="whitespace-pre-line text-ui text-ink-2">{form.description}</p>}
        {index === 0 && !form.description && filledByLink && <p className="text-ui text-ink-3">This link has filled in your answers.</p>}
        {pages.length > 1 && (
          <div className="mt-1 grid gap-1.5" data-form-progress="">
            <p aria-live="polite" className="text-meta tabular-nums text-ink-3">
              Page {index + 1} of {pages.length}
            </p>
            <Bar value={((index + 1) / pages.length) * 100} label="How far through the form" doneAtFull={false} />
          </div>
        )}
      </header>
      <div
        key={index}
        // empty:hidden: with every question answered by the link there is nothing to draw, and an empty
        // box would double the form's gap above Send (DB-27).
        className={cn("grid gap-6 empty:hidden", moved && "animate-in fade-in-0 duration-200 motion-reduce:animate-none", moved === "next" && "slide-in-from-right-2", moved === "back" && "slide-in-from-left-2")}
      >
        {page.section && (
          <div className="grid gap-1">
            <Section ref={heading} tabIndex={-1} className="text-title-3 font-semibold text-foreground">{page.section.label}</Section>
            {page.section.help && <p className="whitespace-pre-line text-ui-sm text-ink-2">{page.section.help}</p>}
          </div>
        )}
        {page.questions.map((q) =>
          q.type === "file" ? (
            <FileQuestion key={q.id} id={controlId(q.id)} hue={hue} files={files[q.id] ?? []} max={maxFiles} mb={fileMB} note={notes[q.id] || undefined}
              label={<>{q.label}{q.required && <RequiredWord />}</>}
              help={q.help ? <p className="-mt-0.5 whitespace-pre-line text-meta text-ink-3">{q.help}</p> : undefined}
              problem={problem?.id === q.id ? <p className="text-meta text-danger-ink">{atQuestion(q, problem)}</p> : undefined}
              onPick={(list) => pick(q.id, list)} onRemove={(key) => unpick(q.id, key)} />
          ) : (
            <Question key={q.id} id={controlId(q.id)} field={q} hue={hue} value={answers[q.id]} problem={problem?.id === q.id ? atQuestion(q, problem) : ""} onChange={(v) => set(q.id, v)} />
          ),
        )}
      </div>
      {!preview && <SpamTrap id="f-website" value={website} onChange={setWebsite} />}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {index > 0 && (
          <Button type="button" variant="ghost" size="lg" onClick={() => go(index - 1, "back")}>
            Back
          </Button>
        )}
        <Button type="submit" size="lg" busy={busy}>
          {last ? "Send" : "Next"}
        </Button>
      </div>
    </form>
  )
}

/** Sent: a moss badge that springs in with one spark, the form's own words or ours, and the way to send another. */
function Sent({ hue, title, message, preview, cover, logo, onAnother }: { hue: CampHue; title: string; message?: string; preview: boolean; cover?: string; logo?: string; onAnother: () => void }) {
  const badge = useRef<HTMLSpanElement>(null)
  const sparked = useRef(false)
  useEffect(() => {
    if (sparked.current || preview) return
    sparked.current = true
    celebrateTask(badge.current)
  }, [preview])
  const Title = preview ? "h3" : "h1"
  return (
    <section data-form-sent="" className={cn(HUE_CLASS[hue], "mx-auto grid w-full max-w-[560px] justify-items-center gap-3 rounded-2xl bg-sheet text-center shadow-e2", preview ? "p-6" : "p-8 sm:p-10")} aria-live="polite">
      <FormLook cover={cover} logo={logo} edge={preview ? "-mx-6 -mt-6" : "-mx-8 -mt-8 sm:-mx-10 sm:-mt-10"} center />
      <span ref={badge} className="hue-moss flex size-12 items-center justify-center rounded-full bg-hue text-white [animation:work-check-fill_220ms_var(--ease-spring)_both]">
        <Check className="size-6" aria-hidden="true" />
      </span>
      <Title className="text-title-2 font-semibold text-foreground">Sent</Title>
      <p className="max-w-sm whitespace-pre-line text-ui text-ink-2">{message?.trim() || `Thanks. The team behind “${title}” has it now.`}</p>
      <Button variant="secondary" onClick={onAnother}>{preview ? "Back to the form" : "Send another"}</Button>
    </section>
  )
}

function Question({ id, field, hue, value, problem, onChange }: { id: string; field: FormField; hue: CampHue; value: unknown; problem: string; onChange: (v: unknown) => void }) {
  const helpId = `${id}-help`
  const problemId = `${id}-problem`
  const described = [field.help ? helpId : "", problem ? problemId : ""].filter(Boolean).join(" ") || undefined
  const invalid = problem ? true : undefined
  const words = (
    <>
      {field.label}
      {field.required && <RequiredWord />}
    </>
  )
  const help = field.help ? <p id={helpId} className="-mt-0.5 whitespace-pre-line text-meta text-ink-3">{field.help}</p> : null
  const said = problem ? <p id={problemId} className="text-meta text-danger-ink">{problem}</p> : null
  const str = typeof value === "string" ? value : ""
  const label = <Label htmlFor={id} id={`${id}-label`} className="flex items-baseline justify-between gap-2 text-ui-sm font-medium text-foreground">{words}</Label>
  switch (field.type) {
    case "checkbox":
      return (
        <div className="grid gap-1.5">
          <label className="flex items-start gap-2.5 text-ui-sm text-foreground" htmlFor={id}>
            <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--hue)]" checked={value === true} onChange={(e) => onChange(e.target.checked)} aria-invalid={invalid} aria-describedby={described} />
            <span className="flex flex-1 items-baseline justify-between gap-2 font-medium">{words}</span>
          </label>
          {help}
          {said}
        </div>
      )
    case "multi_select": {
      const picked = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="grid gap-1.5">
          <p id={`${id}-label`} className="flex items-baseline justify-between gap-2 text-ui-sm font-medium text-foreground">{words}</p>
          {help}
          <div role="group" aria-labelledby={`${id}-label`} aria-describedby={described} className="flex flex-wrap gap-2">
            {(field.options ?? []).map((o, i) => {
              const on = picked.includes(o)
              return (
                <button
                  key={o}
                  id={i === 0 ? id : undefined}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
                  data-touch-target=""
                  {...ix("chip", { hue })}
                  className="chip h-11 gap-1.5 px-3.5 text-sm sm:h-9 sm:px-3"
                >
                  {on ? <Check aria-hidden="true" className="size-3.5" /> : <Plus aria-hidden="true" className="size-3.5 text-ink-3" />}
                  {o}
                </button>
              )
            })}
          </div>
          {said}
        </div>
      )
    }
    case "select":
      return (
        <div className="grid gap-1.5">
          {label}
          {help}
          <Select value={str} onValueChange={onChange}>
            <SelectTrigger id={id} aria-invalid={invalid} aria-describedby={described}><SelectValue placeholder="Choose one" /></SelectTrigger>
            <SelectContent>{(field.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
          {said}
        </div>
      )
    case "date":
      return (
        <div className="grid gap-1.5">
          {label}
          {help}
          <DateField id={id} value={str} onChange={onChange} aria-invalid={invalid} aria-describedby={described} />
          {said}
        </div>
      )
    case "long_text":
      return (
        <div className="grid gap-1.5">
          {label}
          {help}
          <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} maxLength={answerLimit("long_text")} rows={4} aria-invalid={invalid} aria-describedby={described} />
          {said}
        </div>
      )
    default: {
      // A number is typed as text in the person's own signs ("1,5" in de-DE),
      // and sent as typed: a browser number input rewrote it in the browser's
      // locale, or emptied it.
      const kind = INPUT[field.type] ?? TEXT
      return (
        <div className="grid gap-1.5">
          {label}
          {help}
          <Input id={id} type={kind.type} inputMode={kind.mode} autoComplete={kind.auto} spellCheck={kind.spell} placeholder={field.type === "url" ? "https://" : undefined}
            value={str} onChange={(e) => onChange(e.target.value)} maxLength={answerLimit(field.type)} aria-invalid={invalid} aria-describedby={described} />
          {said}
        </div>
      )
    }
  }
}

type Box = { type: string; mode?: "decimal" | "tel" | "url" | "email"; auto?: string; spell?: boolean }
const TEXT: Box = { type: "text" }
/** What's wrong, said at its question: a missing answer plainly (the question is right above it), anything else in the server's words. */
const atQuestion = (q: FormField, p: Problem) =>
  !p.required ? p.message : q.type === "checkbox" ? "This needs to be ticked." : q.type === "file" ? "This needs a file." : "This needs an answer."

/** Each kind's box: its type, keyboard and autofill. */
const INPUT: Partial<Record<FormField["type"], Box>> = {
  email: { type: "email", mode: "email", auto: "email", spell: false },
  phone: { type: "tel", mode: "tel", auto: "tel" },
  url: { type: "url", mode: "url", auto: "url", spell: false },
  number: { type: "text", mode: "decimal" },
}

/** "Required" in words beside a label: a red star said it to sighted people only. */
function RequiredWord() {
  return <span className="text-xs font-normal text-ink-3">Required</span>
}
