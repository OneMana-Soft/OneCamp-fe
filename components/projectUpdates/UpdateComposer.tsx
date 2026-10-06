"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { Loader2, Sparkles, Undo2 } from "@/lib/icons"
import { HEALTHS, type Health, type ProjectUpdate, type UpdateDraft } from "@/lib/projectUpdates"
import type { Posted, UpdateInput } from "@/hooks/useProjectUpdates"

const NO_CHANNEL = "none"
const MAX_BODY = 8000

/**
 * Writing an update: where the project stands, and the note. A new one opens
 * already drafted from the project's tasks (what was done, what is stuck or
 * late, what's next); on the AI edition the AI can add a short summary on top.
 * It can be shown on the client link, and posted in a channel too.
 */
export function UpdateComposer({
  editing,
  hasAI,
  draft,
  aiDraft,
  post,
  edit,
  onDone,
}: {
  editing?: ProjectUpdate
  hasAI: boolean
  draft: () => Promise<UpdateDraft>
  aiDraft: () => Promise<UpdateDraft>
  post: (input: UpdateInput) => Promise<Posted>
  edit: (id: string, input: UpdateInput) => Promise<void>
  onDone: () => void
}) {
  const { toast } = useToast()
  const [health, setHealth] = useState<Health>(editing?.health ?? "on_track")
  const [suggested, setSuggested] = useState<Health | null>(null)
  const [body, setBody] = useState(editing?.body ?? "")
  const [since, setSince] = useState<string | null>(null)
  const [shared, setShared] = useState(editing?.shared_with_client ?? false)
  const [channel, setChannel] = useState(NO_CHANNEL)
  const [busy, setBusy] = useState<"draft" | "ai" | "post" | null>(editing ? null : "draft")
  const [undo, setUndo] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const channels = useSelector((s: RootState) => s.users.userSidebar.userChannels)
  const myChannels = useMemo(
    () => channels.filter((c) => c.ch_uuid && c.ch_is_member !== false).sort((a, b) => a.ch_name.localeCompare(b.ch_name)),
    [channels],
  )

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
        setSince(d.since)
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
        toast({ title: "The AI isn't available right now", description: "The draft from the project's tasks is still here to edit." })
      }
    } catch {
      /* the server's message is shown already */
    } finally {
      setBusy(null)
    }
  }

  const submit = async () => {
    if (!body.trim() || busy) return
    setBusy("post")
    const input: UpdateInput = { health, body, shared_with_client: shared }
    try {
      if (editing) {
        await edit(editing.id, input)
        toast({ title: "Update saved" })
      } else {
        const res = await post({ ...input, channel_uuid: channel === NO_CHANNEL ? undefined : channel })
        if (res.channel_error) toast({ title: "Update posted", description: res.channel_error })
        else toast({ title: "Update posted", description: res.channel ? `Also in #${res.channel}.` : "The project's members are told." })
      }
      onDone()
    } catch {
      setBusy(null)
    }
  }

  const sinceLabel = since ? new Date(since).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : null

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
      aria-label={editing ? "Edit the update" : "Write an update"}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Where the project stands</legend>
        <div role="radiogroup" aria-label="Where the project stands" className="flex flex-wrap gap-1.5">
          {HEALTHS.map((h) => {
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
                {suggested === h.value && <span className="text-3xs font-normal opacity-70">suggested</span>}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="update-body" className="text-xs font-medium text-muted-foreground">
            {editing ? "The update" : sinceLabel ? `Drafted from the project's tasks since ${sinceLabel}. Edit it before you post.` : "The update"}
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
            placeholder="How is the project going? Start lines with - for a list."
            className="min-h-40 resize-y font-sans text-sm leading-relaxed"
          />
          {(busy === "draft" || busy === "ai") && (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60 text-sm text-muted-foreground backdrop-blur-[1px]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {busy === "ai" ? "Writing a summary…" : "Drafting from the project's tasks…"}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} />
          Show on the project&apos;s client link
        </label>
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
        <Button type="submit" size="sm" disabled={!body.trim() || busy !== null}>
          {busy === "post" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {editing ? "Save" : "Post update"}
        </Button>
      </div>
    </form>
  )
}
