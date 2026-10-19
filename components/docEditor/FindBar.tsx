"use client"

/**
 * Find and replace in a doc (docs programme B3, editor.md P1-12): ⌘F opens
 * this bar at the doc's top right (on a phone, across the top), with what's
 * selected as the search. ↩ and ⇧↩ go through the matches, a count says
 * where you are, Match case and Whole word narrow it, and ⌘⇧H (or the arrow)
 * opens Replace: ↩ replaces this one, ⌘↩ all of them, in one change.
 *
 * Going to a match inside a closed toggle opens the toggle, for you alone
 * (B2's toggles.reveal); Escape closes the bar and leaves the caret on the
 * match. It and its plugin load on the first ⌘F.
 */

import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, Replace, ReplaceAll, Search, WholeWord, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { PHONE_QUERY } from "@/context/MediaQueryContext"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { actionById } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { MAX_MATCHES, findKey, findStateOf, replaceAll, replaceCurrent, setFind, setFindHooks, type FindState } from "@/components/minimal-tiptap/extensions/find-replace/findReplace"
import { isComposingKey } from "@/lib/keys/ime"

interface Bar {
  open(options: { replace?: boolean }): void
  close(): void
}

const bars = new WeakMap<Editor, Bar>()

const phoneMedia = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(PHONE_QUERY) : null)

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(() => !!phoneMedia()?.matches)
  React.useEffect(() => {
    const m = phoneMedia()
    if (!m) return
    const on = () => setPhone(m.matches)
    m.addEventListener?.("change", on)
    return () => m.removeEventListener?.("change", on)
  }, [])
  return phone
}

/** The doc's pane, to sit at the top right of. */
const paneOf = (editor: Editor) => (editor.view.dom as HTMLElement).closest(".doc-scroll") as HTMLElement | null

/** A short, one-line selection is what to find. */
function selectedText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection
  if (empty) return ""
  const text = editor.state.doc.textBetween(from, to, "\n")
  return text.includes("\n") || text.length > 200 ? "" : text
}

function useFind(editor: Editor): FindState {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      editor.on("transaction", cb)
      return () => void editor.off("transaction", cb)
    },
    [editor],
  )
  return React.useSyncExternalStore(subscribe, () => findStateOf(editor), () => findStateOf(editor))
}

function IconButton({
  "aria-label": label,
  pressed,
  expanded,
  onClick,
  children,
  disabled,
}: {
  "aria-label": string
  pressed?: boolean
  expanded?: boolean
  onClick(): void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md text-ink-3 outline-none transition-colors duration-[140ms] hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40 max-sm:size-9",
        "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand [&_svg]:size-4",
        pressed && "bg-press text-ink",
      )}
    >
      {children}
    </button>
  )
}

function FindBar({ editor, ctx, asked, onClose }: { editor: Editor; ctx: ActionContext; asked: { n: number; replace: boolean }; onClose(query: string): void }) {
  const state = useFind(editor)
  const [replacing, setReplacing] = React.useState(false)
  const [replacement, setReplacement] = React.useState("")
  const [said, setSaid] = React.useState("")
  const query = React.useRef<HTMLInputElement>(null)
  const replaceField = React.useRef<HTMLInputElement>(null)
  const canEdit = editor.isEditable
  // A phone's first row keeps its width for the search: Match case and Whole
  // word join the replace row, behind the same arrow.
  const tucked = usePhone() && canEdit

  // Each ⌘F selects the search; ⌘⇧H opens Replace.
  React.useEffect(() => {
    if (asked.replace && canEdit) {
      setReplacing(true)
      requestAnimationFrame(() => replaceField.current?.focus())
    } else {
      query.current?.focus()
      query.current?.select()
    }
  }, [asked, canEdit])

  // The current match: shown (its toggle opened), in the middle of the pane.
  const match = state.matches[state.current]
  React.useEffect(() => {
    if (!match) return
    actionById("toggles.reveal", ctx.gate ?? { ai: false })?.run({ ...ctx, editor, state: { ...ctx.state, pos: match.from } })
    const reduce = prefersReducedMotion()
    const el = (editor.view.dom as HTMLElement).querySelector("[data-find-current]")
    el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
  }, [match?.from, match?.to, editor, ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (by: 1 | -1) => {
    const n = state.matches.length
    if (n) setFind(editor, { current: (state.current + by + n) % n })
  }
  const close = () => {
    const m = state.matches[state.current]
    setFind(editor, { open: false })
    onClose(state.query)
    if (m && !editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, m.from, m.to)).scrollIntoView())
    }
    editor.view.focus()
  }
  const replaceOne = () => {
    if (replaceCurrent(editor, replacement)) setSaid("Replaced 1")
  }
  const replaceEvery = () => {
    const n = replaceAll(editor, replacement)
    if (n) setSaid(`Replaced ${n.toLocaleString()}`)
  }

  const n = state.matches.length
  const count = !state.query ? "" : n === 0 ? "No results" : `${(state.current + 1).toLocaleString()} of ${n.toLocaleString()}${n >= MAX_MATCHES ? "+" : ""}`

  const keys = (e: React.KeyboardEvent, field: "find" | "replace") => {
    const mod = e.metaKey || e.ctrlKey
    if (e.key === "Escape") {
      e.preventDefault()
      close()
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault()
      query.current?.focus()
      query.current?.select()
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "h" && canEdit) {
      e.preventDefault()
      setReplacing(true)
      requestAnimationFrame(() => replaceField.current?.focus())
    } else if (e.key === "Enter" && !isComposingKey(e.nativeEvent)) {
      // (An input method's Enter picks its word: Safari's has keyCode 229
      // and isComposing false, lib/keys/ime.)
      e.preventDefault()
      if (field === "replace") {
        if (mod) replaceEvery()
        else replaceOne()
      } else go(e.shiftKey ? -1 : 1)
    }
  }

  const toggles = (
    <>
      <IconButton aria-label="Match case" pressed={state.caseSensitive} onClick={() => setFind(editor, { caseSensitive: !state.caseSensitive })}>
        <CaseSensitive aria-hidden="true" />
      </IconButton>
      <IconButton aria-label="Whole word" pressed={state.wholeWord} onClick={() => setFind(editor, { wholeWord: !state.wholeWord })}>
        <WholeWord aria-hidden="true" />
      </IconButton>
    </>
  )

  return (
    <div role="search" aria-label="Find in doc" data-doc-find="" className="flex w-[min(100%,440px)] flex-col gap-1 p-1.5">
      <div className="flex items-center gap-1">
        {canEdit && (
          <IconButton aria-label="Show replace" expanded={replacing} onClick={() => setReplacing((r) => !r)}>
            {replacing ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </IconButton>
        )}
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-raised px-2 shadow-e1 focus-within:focus-halo max-sm:h-10">
          <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={query}
            value={state.query}
            onChange={(e) => setFind(editor, { query: e.target.value })}
            data-escape-own=""
            onKeyDown={(e) => keys(e, "find")}
            placeholder="Find in doc"
            aria-label="Find"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-3 max-sm:text-base pointer-coarse:text-base"
          />
          <span aria-live="polite" className="shrink-0 tabular-nums text-meta text-ink-3">
            {count}
          </span>
        </label>
        {!tucked && toggles}
        <IconButton aria-label="Previous match" onClick={() => go(-1)} disabled={!n}>
          <ChevronUp aria-hidden="true" />
        </IconButton>
        <IconButton aria-label="Next match" onClick={() => go(1)} disabled={!n}>
          <ChevronDown aria-hidden="true" />
        </IconButton>
        <IconButton aria-label="Close" onClick={close}>
          <X aria-hidden="true" />
        </IconButton>
      </div>
      {replacing && canEdit && (
        <div className={cn("flex items-center gap-1", !tucked && "pl-8")}>
          {tucked && toggles}
          <label className="flex h-8 min-w-0 flex-1 items-center rounded-lg bg-raised px-2 shadow-e1 focus-within:focus-halo max-sm:h-10">
            <input
              ref={replaceField}
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              data-escape-own=""
              onKeyDown={(e) => keys(e, "replace")}
              placeholder="Replace with"
              aria-label="Replace with"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-3 max-sm:text-base pointer-coarse:text-base"
            />
          </label>
          <IconButton aria-label="Replace" onClick={replaceOne} disabled={!n}>
            <Replace aria-hidden="true" />
          </IconButton>
          <IconButton aria-label="Replace all" onClick={replaceEvery} disabled={!n}>
            <ReplaceAll aria-hidden="true" />
          </IconButton>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  )
}

/** Puts the bar over a doc's pane, made the first time find opens on that editor. */
function mount(editor: Editor, ctx: ActionContext): Bar {
  const host = document.createElement("div")
  host.setAttribute("data-doc-find-host", "")
  host.className = "doc-find-host content-float pop-surface"
  let root: Root | null = null
  let asked = { n: 0, replace: false }
  let shown = false
  // The last search, for the next time find opens with nothing selected.
  let last = ""

  // On a phone the bar runs across the top of the doc, and it covered the
  // doc's title and line (QA DSA-22): the doc moves down by the bar's height
  // while it's open, and back when it closes.
  let pushed: { pane: HTMLElement; was: string; base: string } | null = null
  const unpush = () => {
    if (pushed) pushed.pane.style.paddingTop = pushed.was
    pushed = null
  }
  const push = () => {
    const pane = paneOf(editor)
    if (!pane || !shown || !window.matchMedia?.(PHONE_QUERY).matches) return unpush()
    if (pushed?.pane !== pane) {
      unpush()
      pushed = { pane, was: pane.style.paddingTop, base: getComputedStyle(pane).paddingTop || "0px" }
    }
    pane.style.paddingTop = `calc(${pushed.base} + ${Math.ceil(host.getBoundingClientRect().height) + 8}px)`
  }
  const tall = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => push())

  const place = () => {
    const pane = paneOf(editor)
    const r = pane?.getBoundingClientRect()
    const phone = !!window.matchMedia?.(PHONE_QUERY).matches
    host.style.top = `${Math.max(8, (r?.top ?? 0) + 8)}px`
    host.style.right = phone ? "8px" : `${Math.max(8, window.innerWidth - (r?.right ?? window.innerWidth) + 16)}px`
    host.style.left = phone ? "8px" : ""
    push()
  }
  const hide = (query?: string) => {
    if (!shown) return
    shown = false
    unpush()
    tall?.disconnect()
    last = query || last
    const r = root
    root = null
    // After the click or key that closed it has finished.
    queueMicrotask(() => {
      r?.unmount()
      if (!shown) host.remove()
    })
    window.removeEventListener("resize", place)
  }
  const render = () => {
    root ??= createRoot(host)
    root.render(<FindBar editor={editor} ctx={ctx} asked={asked} onClose={hide} />)
  }
  const bar: Bar = {
    open({ replace }) {
      asked = { n: asked.n + 1, replace: !!replace }
      if (!shown) {
        shown = true
        document.body.appendChild(host)
        place()
        tall?.observe(host)
        window.addEventListener("resize", place)
        const query = selectedText(editor) || last
        setFind(editor, { open: true, ...(query ? { query } : {}) })
      }
      render()
    },
    close() {
      const query = findStateOf(editor).query
      setFind(editor, { open: false })
      hide(query)
    },
  }
  setFindHooks(editor.view, {
    replace: () => editor.isEditable && bar.open({ replace: true }),
    close: () => {
      bar.close()
      editor.view.focus()
    },
  })
  editor.on("destroy", () => hide())
  return bar
}

/** Opens find on a doc's editor (⌘F, the More menu, the palette); with replace, Replace too. */
export function openFind(ctx: ActionContext, options: { replace?: boolean } = {}) {
  const editor = ctx.editor
  // Find is a doc editor's own from when it is made (FindKeys): an editor
  // made without it has none, and none is added while it is open.
  if (!editor || editor.isDestroyed || !findKey.get(editor.state)) return
  let bar = bars.get(editor)
  if (!bar) bars.set(editor, (bar = mount(editor, ctx)))
  bar.open(options)
}
