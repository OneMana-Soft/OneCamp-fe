"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { Loader2, Sparkles, Undo2 } from "@/lib/icons"
import { ENDINGS, HEALTHS, type Ending, type Health, type UpdateDraft } from "@/lib/projectUpdates"
import type { UpdateInput } from "@/hooks/useProjectUpdates"

const NO_CHANNEL = "none"
const MAX_BODY = 8000

/** An update or check-in being edited: what it said. */
export interface Editing {
  id: string
  health: Health | Ending
  body: string
  shared_with_client?: boolean
}

/** The words that change with what the update is about. */
const COPY = {
  project: {
    stands: "Where the project stands",
    drafted: (since: string | null) => (since ? `Drafted from the project's tasks since ${since}. Edit it before you post.` : "The update"),
    drafting: "Drafting from the project's tasks…",
    placeholder: "How is the project going? Start lines with - for a list.",
    stillThere: "The draft from the project's tasks is still here to edit.",
    edited: "The update",
    form: "Write an update",
    editForm: "Edit the update",
    post: "Post update",
    posted: "Update posted",
    saved: "Update saved",
    told: "The project's members are told.",
    readers: undefined,
  },
  goal: {
    stands: "Where the goal stands",
    drafted: (since: string | null) =>
      since
        ? `Drafted from what serves the goal, since the check-in on ${since}. Edit it before you post.`
        : "Drafted from what serves the goal. Edit it before you post.",
    drafting: "Drafting from its projects and sub-goals…",
    placeholder: "How is the goal going? Start lines with - for a list.",
    stillThere: "The draft is still here to edit.",
    edited: "The check-in",
    form: "Check in on the goal",
    editForm: "Edit the check-in",
    post: "Check in",
    posted: "Checked in",
    saved: "Check-in saved",
    told: undefined,
    // A goal is the workspace's: its check-ins are read by everyone in it.
    readers: "Everyone in the workspace can read check-ins.",
  },
} as const

type Choice = { value: Health | Ending; label: string; dot: string; pill: string }

const isEnding = (h: string) => ENDINGS.some((e) => e.value === h)

/**
 * Writing an update on a project, or a check-in on a goal: where it stands,
 * and the note. A new one opens already drafted (from the project's tasks, or
 * from what serves the goal); on the AI edition the AI can add a short
 * summary on top. A project update can be shown on the client link; a goal's
 * check-in can move its number, or close it as achieved, missed or dropped.
 * Either can be posted in a channel too.
 */
export function UpdateComposer({
  editing,
  hasAI,
  draft,
  aiDraft,
  post,
  edit,
  onDone,
  subject = "project",
  endings = false,
  clientShare = subject === "project",
  number,
}: {
  editing?: Editing
  hasAI: boolean
  draft: () => Promise<UpdateDraft>
  aiDraft: () => Promise<UpdateDraft>
  post: (input: UpdateInput) => Promise<{ channel?: string; channel_error?: string }>
  edit: (id: string, input: UpdateInput) => Promise<unknown>
  onDone: () => void
  subject?: keyof typeof COPY
  /** Offer closing a goal: achieved, missed, dropped. */
  endings?: boolean
  /** Offer "Show on the project's client link". */
  clientShare?: boolean
  /** A number goal: where the number is now, and its unit. */
  number?: { current: number; unit: string }
}) {
  const copy = COPY[subject]
  const { toast } = useToast()
  const [health, setHealth] = useState<Health | Ending>(editing?.health ?? "on_track")
  const [suggested, setSuggested] = useState<Health | null>(null)
  const [body, setBody] = useState(editing?.body ?? "")
  const [since, setSince] = useState<string | null>(null)
  const [shared, setShared] = useState(editing?.shared_with_client ?? false)
  const [channel, setChannel] = useState(NO_CHANNEL)
  // Where the number stood when the composer opened: a goal read again meanwhile
  // (someone else moved it) mustn't make an untouched field look like a change.
  const [startValue] = useState(number?.current)
  const [value, setValue] = useState(number ? String(number.current) : "")
  const [busy, setBusy] = useState<"draft" | "ai" | "post" | null>(editing ? null : "draft")
  const [undo, setUndo] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const channels = useSelector((s: RootState) => s.users.userSidebar.userChannels)
  const myChannels = useMemo(() => channels.filter((c) => c.ch_uuid && c.ch_is_member !== false).sort((a, b) => a.ch_name.localeCompare(b.ch_name)), [channels])

  // A project may be done; a goal is closed instead. An edited ending stays
  // that ending, and an open check-in stays open.
  const healths: Choice[] =
    editing && isEnding(editing.health) ? ENDINGS.filter((e) => e.value === editing.health) : HEALTHS.filter((h) => h.value !== "done" || subject === "project")
  const offerEndings = endings && !editing
  const closing = isEnding(health)
  const moved = number && !editing && value.trim() !== "" ? Number(value) : undefined
  // Closing keeps where the goal ended: a value typed before choosing an ending isn't sent.
  const valueChanged = !closing && moved !== undefined && Number.isFinite(moved) && moved !== startValue
  const canPost = !!body.trim() || closing || valueChanged

  // A new update starts from the draft; the person edits from there.
  useEffect(() => {
    if (editing) return
    let live = true
    draft()
      .then((d) => {
        if (!live) return
        setBody(d.text)
        setHealth(d.health)
        setSuggested(d.health)
        setSince(d.since ?? null)
      })
      .catch(() => {})
      .finally(() => live && setBusy(null))
    return () => {
      live = false
    }
  }, [draft, editing])

  // The note grows with its text instead of scrolling in a small box.
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.6)}px`
  }, [body])

  // Once drafted, the cursor waits at the top, where the summary is.
  useEffect(() => {
    const el = area.current
    if (busy !== null || !el) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(0, 0)
    el.scrollTop = 0
  }, [busy])

  const withAI = async () => {
    setBusy("ai")
    try {
      const d = await aiDraft()
      if (d.ai) {
        setUndo(body)
        setBody(d.text)
      } else {
        toast({ title: "The AI isn't available right now", description: copy.stillThere })
      }
    } catch {
      /* the server's message is shown already */
    } finally {
      setBusy(null)
    }
  }

  const submit = async () => {
    if (!canPost || busy) return
    setBusy("post")
    const input: UpdateInput = clientShare ? { health, body, shared_with_client: shared } : { health, body }
    try {
      if (editing) {
        await edit(editing.id, input)
        toast({ title: copy.saved })
      } else {
        const res = await post({ ...input, ...(valueChanged ? { value: moved } : {}), channel_uuid: channel === NO_CHANNEL ? undefined : channel })
        const title = closing ? "Goal closed" : copy.posted
        if (res.channel_error) toast({ title, description: res.channel_error })
        else toast({ title, description: res.channel ? `Also in #${res.channel}.` : copy.told })
      }
      onDone()
    } catch {
      setBusy(null)
    }
  }

  const sinceLabel = since ? new Date(since).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : null
  const pill = (h: Choice) => {
    const on = health === h.value
    return (
      <button
        key={h.value}
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => setHealth(h.value)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          on ? cn("border-transparent", h.pill) : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", h.dot)} />
        {h.label}
        {suggested === h.value && <span className="text-2xs font-normal opacity-70">suggested</span>}
      </button>
    )
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          void submit()
        } else if (e.key === "Escape" && !busy) {
          onDone()
        }
      }}
      aria-label={editing ? copy.editForm : copy.form}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">{copy.stands}</legend>
        <div role="radiogroup" aria-label={copy.stands} className="flex flex-wrap items-center gap-1.5">
          {healths.map(pill)}
          {offerEndings && (
            <>
              <span className="mx-1 text-xs text-muted-foreground">or close it:</span>
              {ENDINGS.map(pill)}
            </>
          )}
        </div>
      </fieldset>

      {number && !editing && !closing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="update-value" className="text-xs font-medium text-muted-foreground">
            Where the number is now
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="update-value"
              type="number"
              step="any"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 w-40 tabular-nums"
            />
            {number.unit && <span className="text-sm text-muted-foreground">{number.unit}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="update-body" className="text-xs font-medium text-muted-foreground">
            {editing ? copy.edited : copy.drafted(sinceLabel)}
          </label>
          {undo !== null && (
            <button
              type="button"
              onClick={() => {
                setBody(undo)
                setUndo(null)
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Undo2 className="h-3 w-3" /> Undo the AI summary
            </button>
          )}
        </div>
        <div className="relative">
          <Textarea
            id="update-body"
            ref={area}
            value={body}
            maxLength={MAX_BODY}
            onChange={(e) => setBody(e.target.value)}
            disabled={busy === "draft" || busy === "ai"}
            rows={8}
            placeholder={copy.placeholder}
            className="min-h-40 resize-y font-sans text-sm leading-relaxed"
          />
          {(busy === "draft" || busy === "ai") && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60 text-sm text-muted-foreground backdrop-blur-[1px]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {busy === "ai" ? "Writing a summary…" : copy.drafting}
            </div>
          )}
        </div>
        {copy.readers && <p className="text-2xs text-muted-foreground">{copy.readers}</p>}
      </div>

      {(clientShare || (!editing && myChannels.length > 0)) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {clientShare && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} />
              Show on the project&apos;s client link
            </label>
          )}
          {!editing && myChannels.length > 0 && (
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-52" aria-label="Also post in a channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHANNEL}>Don&apos;t post in a channel</SelectItem>
                {myChannels.map((c) => (
                  <SelectItem key={c.ch_uuid} value={c.ch_uuid}>
                    Also post in #{c.ch_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {hasAI && !editing && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={withAI} disabled={busy !== null}>
            <Sparkles className="h-3.5 w-3.5" />
            Add an AI summary
          </Button>
        )}
        <span className="ml-auto hidden text-2xs text-muted-foreground sm:inline">Ctrl/⌘ + Enter to post</span>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy === "post"}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant={closing ? "secondary" : "default"} disabled={!canPost || busy !== null}>
          {busy === "post" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {editing ? "Save" : closing ? "Close the goal" : copy.post}
        </Button>
      </div>
    </form>
  )
}
