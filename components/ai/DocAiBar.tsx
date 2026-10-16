"use client"

/**
 * The doc AI bar (docs programme B9, ai-search-io P0-5 and §2; AI edition
 * only): a 40 px field in the agent tint, at the text, opened by space on an
 * empty line, ⌘J, ⇧⌘J, Ask AI on a selection or the block menu, or "/". It
 * names the model before anything is sent ("Runs on your server · qwen3 4B",
 * or where a remote one is), offers what fits where it was opened, and takes
 * a typed instruction or question.
 *
 * A transform streams here, then becomes a diff in the doc; a write streams
 * into the doc as ghost text; an answer is read here, with Insert below, Copy,
 * Try again and Continue in panel (⌘⏎, the long conversation's place). The
 * first word's wait has its own state, and after 8 s says the model is still
 * at it, naming a local one. On a phone the same bar is a sheet.
 *
 * Keys: ↑ ↓ pick, ⏎ runs, Esc closes (or stops, or goes back), ⌘⏎ continues
 * in the panel, and a space in the empty field types a space in the doc when
 * a space opened the bar.
 */

import { useDocActionNeeds } from "@/hooks/useDocAbilities"
import * as React from "react"
import type { Editor } from "@tiptap/core"
import { isBlankDoc } from "@/components/docEditor/DocBodyLayer"
import { busFor, findBlock } from "@/components/docEditor/registry/commandBus"
import MarkdownMessage from "@/components/ai/MarkdownMessage"
import { Spark } from "@/components/ui/graphics/motifs"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import {
  AlignLeft,
  ArrowRightToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  CornerDownLeft,
  Languages,
  Lightbulb,
  ListTodo,
  MessageSquareText,
  Maximize2,
  Minimize2,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquarePen,
  Type,
} from "@/lib/icons"
import {
  DOC_AI_ACTIONS,
  DOC_AI_LANGUAGES,
  DOC_AI_TONES,
  STILL_WRITING_MS,
  matchOffer,
  modelLine,
  offerFor,
  stillWorkingLine,
  typedAction,
  workingLabel,
  type DocAIActionId,
  type DocAIModel,
  readerOffer,
} from "@/lib/ai/docAIActions"
import { getDocAIModel, getDocAIStarters, type DocProject } from "@/lib/ai/docAIApi"
import { loadCodec } from "@/lib/ai/docAIContent"
import { closeAiBar, handToPanel, openAiBar, type BarRequest } from "./docAiStore"
import { insertAnswer, runAction, type Run, type RunState } from "./docAiRun"
import { DocAiTasks } from "./DocAiTasks"

const ICONS: Partial<Record<DocAIActionId, React.ElementType>> = {
  edit: SquarePen,
  improve: SquarePen,
  fix: Check,
  shorter: Minimize2,
  longer: Maximize2,
  simplify: Type,
  tone: SlidersHorizontal,
  translate: Languages,
  explain: Lightbulb,
  summarize: AlignLeft,
  continue: Pencil,
  write: Sparkles,
  draft: Sparkles,
  draft_from_tasks: ClipboardList,
  ask: MessageSquareText,
  action_items: ListTodo,
}

// The model, asked once a minute at most: the bar names it before anything is sent.
let modelAsked: { at: number; model: Promise<DocAIModel | null> } | null = null
function askModel(): Promise<DocAIModel | null> {
  if (!modelAsked || Date.now() - modelAsked.at > 60_000) {
    modelAsked = { at: Date.now(), model: getDocAIModel().catch(() => null) }
  }
  return modelAsked.model
}

interface Option {
  key: string
  label: string
  icon: React.ElementType
  group?: string
  submenu?: boolean
  pick(): void
}

type View = "menu" | "tone" | "language" | "run" | "tasks"

export interface DocAiBarProps {
  editor: Editor
  docId: string
  request: BarRequest
  /** A sheet on a phone, a floating bar at the text elsewhere. */
  sheet?: boolean
}

/**
 * Where the bar works: the request's range, or the blocks the block menu was
 * on. Blocks next to each other are one range; blocks chosen apart are read
 * alone (parts), never with what lies between them.
 */
export function placeOf(editor: Editor, request: BarRequest): { from: number; to: number; parts: Array<{ from: number; to: number }> | null } {
  const found = (request.blocks ?? [])
    .map((id) => findBlock(editor, id))
    .filter((r): r is { from: number; to: number } => !!r)
    .sort((a, b) => a.from - b.from)
  if (!found.length) return { from: request.from, to: request.to, parts: null }
  const together = found.every((r, i) => i === 0 || r.from === found[i - 1].to)
  return { from: found[0].from, to: found[found.length - 1].to, parts: together ? null : found }
}

export default function DocAiBar({ editor, docId, request, sheet = false }: DocAiBarProps) {
  const [query, setQuery] = React.useState(request.prompt && !request.action ? request.prompt : "")
  const [view, setView] = React.useState<View>("menu")
  const [active, setActive] = React.useState(0)
  const [model, setModel] = React.useState<DocAIModel | null>(null)
  const [project, setProject] = React.useState<DocProject | null>(null)
  const [run, setRun] = React.useState<Run | null>(null)
  const [runState, setRunState] = React.useState<RunState | null>(null)
  const [still, setStill] = React.useState(false)
  const handedOver = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listId = React.useId()

  const place = React.useMemo(() => placeOf(editor, request), [editor, request])
  const scattered = !!place.parts
  const hasSelection = place.from !== place.to
  const docEmpty = React.useMemo(() => isBlankDoc(editor.state.doc), [editor])
  // Whether an answer may go into the doc: the person's level (the request's
  // canChange, docAbilities askWrite) and the editor as it is now (a lock, a
  // read-only session). Below it, a reader is offered what reads the doc
  // (readerOffer) and every answer is read here (outputKind).
  const readOnly = !editor.isEditable || request.canChange === false
  const needs = useDocActionNeeds()
  // A reader with no list from the server has no actions: only a question.
  const askOnly = readOnly && !needs
  const [askMode, setAskMode] = React.useState(request.mode === "ask" || askOnly)
  // "Ask about this doc…" was picked here, by an editor or by a reader, who
  // has actions too: Esc, ⌫ in the empty field or the back arrow return to them.
  const askedHere = askMode && request.mode !== "ask" && !askOnly
  const restAt = request.source === "space" ? request.from - 1 : undefined

  const close = React.useCallback(
    (opts: { rest?: boolean } = {}) => {
      closeAiBar(editor, opts.rest ? restAt : undefined)
      if (!editor.isDestroyed) editor.commands.focus()
    },
    [editor, restAt],
  )

  // The codec reads and writes every action's text: fetched as the bar opens,
  // so the first action doesn't wait for it.
  React.useEffect(() => {
    loadCodec().catch(() => undefined)
  }, [])

  // The model's name, before anything is sent.
  React.useEffect(() => {
    let current = true
    void askModel().then((m) => current && setModel((now) => now ?? m))
    return () => {
      current = false
    }
  }, [])

  // In an empty doc, its project's open tasks are a place to start.
  React.useEffect(() => {
    if (!docEmpty || hasSelection) return
    let current = true
    getDocAIStarters(docId).then(
      (p) => current && setProject(p && p.open_tasks > 0 ? p : null),
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [docEmpty, hasSelection, docId])

  // A run's progress, and the 8 s "still writing" line before its first word.
  React.useEffect(() => {
    if (!run) return
    setRunState(run.state)
    setStill(false)
    const off = run.subscribe(() => {
      setRunState(run.state)
      if (run.state.model) setModel(run.state.model)
    })
    const t = setTimeout(() => setStill(true), STILL_WRITING_MS)
    return () => {
      off()
      clearTimeout(t)
    }
  }, [run])

  // Leaving the bar stops what it started, unless it went into the doc.
  React.useEffect(
    () => () => {
      if (!handedOver.current) run?.stop()
    },
    [run],
  )

  const start = React.useCallback(
    (action: DocAIActionId, extra: { prompt?: string; tone?: string; language?: string; previous?: string; projectId?: string } = {}) => {
      if (action === "action_items") {
        setView("tasks")
        return
      }
      handedOver.current = false
      const r = runAction({
        editor,
        docId,
        action,
        canChange: !readOnly,
        from: place.from,
        to: place.to,
        parts: place.parts ?? undefined,
        model,
        ...extra,
        onHandOver: () => {
          handedOver.current = true
          closeAiBar(editor)
        },
        again: (change) =>
          openAiBar(editor, {
            ...request,
            from: change.from,
            to: change.to,
            action,
            prompt: change.prompt ?? extra.prompt,
            previous: change.previous,
            tone: extra.tone,
            language: extra.language,
            projectId: extra.projectId,
          }),
      })
      setRun(r)
      setView("run")
    },
    [editor, docId, request, model, place, readOnly],
  )

  // Asked for one action at once: "/" Summarise, the empty doc's row, Try again.
  const started = React.useRef(false)
  React.useEffect(() => {
    if (started.current || !request.action) return
    const def = DOC_AI_ACTIONS[request.action]
    const needsWords = request.action === "write" || request.action === "draft" || request.action === "ask" || request.action === "edit"
    if (needsWords && !request.prompt) return
    if (def?.submenu === "tone" && !request.tone) return setView("tone")
    if (def?.submenu === "language" && !request.language) return setView("language")
    started.current = true
    start(request.action, { prompt: request.prompt, tone: request.tone, language: request.language, previous: request.previous, projectId: request.projectId })
  }, [request, start])

  React.useEffect(() => {
    if (view !== "run") inputRef.current?.focus({ preventScroll: true })
  }, [view])

  // What the bar offers, narrowed to what was typed, with the typed words first.
  const options: Option[] = React.useMemo(() => {
    if (view === "tone") {
      return DOC_AI_TONES.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase())).map((t) => ({
        key: `tone:${t.id}`,
        label: t.label,
        icon: SlidersHorizontal,
        pick: () => start("tone", { tone: t.id }),
      }))
    }
    if (view === "language") {
      const q = query.trim()
      const known = DOC_AI_LANGUAGES.filter((l) => l.toLowerCase().startsWith(q.toLowerCase()))
      const typed = q && !known.some((l) => l.toLowerCase() === q.toLowerCase()) ? [q] : []
      return [...typed, ...known].map((l) => ({
        key: `lang:${l}`,
        label: l,
        icon: Languages,
        pick: () => start("translate", { language: l }),
      }))
    }
    if (view !== "menu") return []
    const where = { hasSelection, docEmpty, projectTasks: !!project, scattered }
    const groups = askMode ? [] : readOnly ? readerOffer(matchOffer(offerFor(where), query), needs) : matchOffer(offerFor(where), query)
    const out: Option[] = []
    const typed = query.trim()
    if (typed) {
      // A reader's words are a question: nothing they type changes the doc.
      const action = typedAction(typed, { hasSelection, docEmpty, askMode: askMode || readOnly, scattered })
      out.push({
        key: "typed",
        label: action === "ask" ? `Ask: ${typed}` : action === "edit" ? `Edit: ${typed}` : `Write: ${typed}`,
        icon: action === "ask" ? MessageSquareText : Sparkles,
        pick: () => start(action, { prompt: typed }),
      })
    }
    for (const g of groups) {
      for (const a of g.actions) {
        out.push({
          key: a.id,
          group: g.group,
          label:
            a.id === "draft_from_tasks" && project
              ? `Draft from ${project.name}'s open tasks (${project.open_tasks})`
              : a.id === "ask"
                ? "Ask about this doc…"
                : a.label,
          icon: ICONS[a.id] ?? Sparkles,
          submenu: !!a.submenu,
          pick: () => {
            if (a.submenu === "tone") return void (setView("tone"), setQuery(""), setActive(0))
            if (a.submenu === "language") return void (setView("language"), setQuery(""), setActive(0))
            if (a.id === "ask") return void (setAskMode(true), setQuery(""), inputRef.current?.focus())
            start(a.id, a.id === "draft_from_tasks" ? { projectId: project?.uuid } : {})
          },
        })
      }
    }
    return out
  }, [view, query, hasSelection, docEmpty, askMode, project, start, scattered, readOnly, needs])

  React.useEffect(() => setActive(0), [query, view])

  // ⌘⏎: the long conversation goes on in the panel, on the same text, from
  // this answer when there is one, else from what was typed.
  const continueInPanel = () => {
    const typed = query.trim()
    const now = run?.state
    const answered = now && now.phase === "done" && now.kind === "answer" && now.text
    const action = answered ? now.action : typed ? typedAction(typed, { hasSelection, docEmpty, askMode, scattered }) : undefined
    const prompt = request.prompt || typed || undefined
    handToPanel(editor, answered ? { action, prompt, text: now.text, model: now.model } : { action, prompt })
    run?.stop()
    closeAiBar(editor)
    if (!editor.isDestroyed) editor.commands.setTextSelection({ from: place.from, to: place.to })
    busFor(editor)?.emit("aiRun", { action, prompt })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (e.key === "Enter" && mod) {
      e.preventDefault()
      return continueInPanel()
    }
    if (e.key === "Escape") {
      e.preventDefault()
      if (view === "tone" || view === "language") return void (setView("menu"), setQuery(""))
      if (askedHere && view === "menu") return void (setAskMode(false), setQuery(""))
      return close({ rest: view === "menu" })
    }
    if (e.key === "Backspace" && query === "" && askedHere && view === "menu") {
      e.preventDefault()
      return setAskMode(false)
    }
    if (e.key === " " && query === "" && request.source === "space" && view === "menu") {
      // A second space: the person meant a space.
      e.preventDefault()
      closeAiBar(editor)
      editor.chain().focus().insertContent(" ").run()
      return
    }
    if (e.key === "Backspace" && query === "" && (view === "tone" || view === "language")) {
      e.preventDefault()
      return setView("menu")
    }
    if (!options.length) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      options[Math.min(active, options.length - 1)]?.pick()
    }
  }

  // A reader's words are a question (typedAction), so the field never says
  // edit, write or draft to them.
  const placeholder =
    view === "tone"
      ? "Pick a tone"
      : view === "language"
        ? "Translate into…"
        : askMode
          ? "Ask about this doc…"
          : scattered
            ? "Ask about these blocks…"
            : readOnly
              ? hasSelection
                ? "Ask about the selection…"
                : "Ask about this doc…"
              : hasSelection
                ? "Ask AI to edit or explain the selection…"
                : docEmpty
                  ? "Ask AI to draft…"
                  : "Ask AI to write, or pick an action…"

  const line = modelLine(model)
  const activeId = options[active] ? `${listId}-${options[active].key}` : undefined

  return (
    <div
      // On a phone the sheet is the dialog, named Ask AI; the bar is its content.
      role={sheet ? undefined : "dialog"}
      aria-label={sheet ? undefined : "Ask AI"}
      data-doc-ai-bar=""
      className={cn(
        "flex flex-col overflow-hidden bg-raised text-ink",
        sheet ? "w-full" : "rounded-[12px] shadow-e3 ring-1 ring-[color-mix(in_oklab,var(--agent)_30%,transparent)]",
      )}
    >
      {view !== "run" && view !== "tasks" && (
        <div className="flex h-10 items-center gap-2 bg-[color-mix(in_oklab,var(--agent-muted)_70%,var(--raised))] px-3">
          {view === "menu" && !askedHere ? (
            <Spark size={16} className="shrink-0 text-agent" />
          ) : (
            <button
              type="button"
              aria-label="Back to the actions"
              onClick={() => (view === "menu" ? setAskMode(false) : setView("menu"), setQuery(""), inputRef.current?.focus())}
              className="-ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder.replace(/…$/, "")}
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck
            className="h-10 min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-3"
          />
          {line && !sheet && (
            <span className="max-w-[45%] shrink-0 truncate text-meta text-ink-3" title={line}>
              {line}
            </span>
          )}
        </div>
      )}
      {/* On a phone the field keeps the width: the model is named under it. */}
      {line && sheet && view !== "run" && view !== "tasks" && <ModelUnder line={line} />}

      {(view === "menu" || view === "tone" || view === "language") && options.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Actions" className={cn("overflow-y-auto p-1", sheet ? "max-h-[50dvh]" : "max-h-[min(320px,40vh)]")}>
          {options.map((o, i) => {
            const first = i === 0 || options[i - 1].group !== o.group
            const Icon = o.icon
            return (
              <React.Fragment key={o.key}>
                {o.group && first && (
                  <li role="presentation" className="px-2 pb-1 pt-2 text-micro text-ink-3 first:pt-1">
                    {o.group}
                  </li>
                )}
                <li
                  id={`${listId}-${o.key}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => o.pick()}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 text-ui text-ink-2",
                    sheet ? "h-11" : "h-8",
                    "transition-colors duration-[90ms] ease-[var(--ease-out)]",
                    "aria-selected:bg-agent-muted aria-selected:text-agent-ink",
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.submenu && <ChevronRight className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />}
                </li>
              </React.Fragment>
            )
          })}
        </ul>
      )}

      {view === "run" && runState && (
        <RunCard
          state={runState}
          still={still}
          model={model}
          sheet={sheet}
          canInsert={!readOnly}
          onStop={() => {
            run?.stop()
            close()
          }}
          onRetry={() => {
            if (!runState) return
            start(runState.action, { prompt: request.prompt || query.trim() || undefined, tone: request.tone, language: request.language })
          }}
          onInsert={async () => {
            if (!runState?.text) return
            const ok = await insertAnswer(editor, docId, runState.action, runState.model, runState.text, place.from, place.to)
            if (ok) closeAiBar(editor)
          }}
          onCopy={() =>
            navigator.clipboard.writeText(runState?.text ?? "").then(
              () => toast({ title: "Copied" }),
              () => toast({ title: "Couldn't copy: the browser didn't allow it.", variant: "destructive" }),
            )
          }
          onPanel={continueInPanel}
          onClose={() => close()}
        />
      )}

      {view === "tasks" && (
        <div onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), close())}>
          <div className="flex h-10 items-center gap-2 bg-[color-mix(in_oklab,var(--agent-muted)_70%,var(--raised))] px-3">
            <ListTodo className="size-4 shrink-0 text-agent" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-ui text-ink">Action items in this doc</span>
            {line && <span className="max-w-[45%] shrink-0 truncate text-meta text-ink-3">{line}</span>}
          </div>
          <DocAiTasks editor={editor} docId={docId} onDone={() => closeAiBar(editor)} />
        </div>
      )}

      {!sheet && (view === "menu" || view === "tone" || view === "language") && (
        <p className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-micro text-ink-3" aria-hidden="true">
          <span>↑↓ to pick</span>
          <span>⏎ to run</span>
          <span>⌘⏎ continue in the panel</span>
          <span className="ml-auto">Esc to close</span>
        </p>
      )}
    </div>
  )
}

/** A run in the bar: its wait, its answer as it comes, and what can be done with it. */
function RunCard({
  state,
  still,
  model,
  sheet,
  canInsert,
  onStop,
  onRetry,
  onInsert,
  onCopy,
  onPanel,
  onClose,
}: {
  state: RunState
  still: boolean
  model: DocAIModel | null
  sheet: boolean
  canInsert: boolean
  onStop(): void
  onRetry(): void
  onInsert(): void
  onCopy(): void
  onPanel(): void
  onClose(): void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const working = state.phase === "preparing" || state.phase === "waiting" || state.phase === "streaming"
  React.useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [state.phase])
  const status = working
    ? state.progress && state.progress.step === "reading"
      ? `Reading the doc · part ${Math.max(1, state.progress.done)} of ${state.progress.of}`
      : state.phase !== "streaming" && still
        ? stillWorkingLine(model)
        : `${workingLabel(state.action)}…`
    : state.phase === "error"
      ? state.error
      : ""
  const answer = state.kind === "answer" && state.phase === "done"
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      return working ? onStop() : onClose()
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      return onPanel()
    }
    if (e.key === "Enter" && answer && canInsert && !(e.target as HTMLElement).closest("button")) {
      e.preventDefault()
      onInsert()
    }
  }
  return (
    <div ref={ref} tabIndex={-1} onKeyDown={onKeyDown} className="flex flex-col outline-none">
      <div className="flex h-10 items-center gap-2 bg-[color-mix(in_oklab,var(--agent-muted)_70%,var(--raised))] px-3">
        <Spark size={16} className="shrink-0 text-agent" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-ui",
            working ? "bg-[linear-gradient(90deg,var(--ink-2),var(--agent),var(--ink-2))] bg-[length:200%_100%] bg-clip-text text-transparent animate-text-shimmer motion-reduce:animate-none motion-reduce:text-ink-2" : state.phase === "error" ? "text-danger-ink" : "text-ink-2",
          )}
          role={state.phase === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {status || DOC_AI_ACTIONS[state.action]?.label}
        </span>
        {modelLine(model) && !sheet && <span className="max-w-[40%] shrink-0 truncate text-meta text-ink-3">{modelLine(model)}</span>}
        {working && (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop (Esc)"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Square className="size-3.5" />
          </button>
        )}
      </div>
      {sheet && modelLine(model) && <ModelUnder line={modelLine(model)} />}
      {state.text && state.kind !== "write" && (
        <div className="max-h-[min(360px,45vh)] overflow-y-auto px-4 py-3 text-ui text-ink">
          <MarkdownMessage content={state.text} />
        </div>
      )}
      {state.notice && state.phase === "done" && <p className="px-4 pb-2 text-meta text-ink-3">{state.notice}</p>}
      {(answer || state.phase === "error" || state.phase === "stopped") && (
        <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5">
          {answer && canInsert && (
            <BarButton onClick={onInsert} primary>
              <CornerDownLeft className="size-3.5" aria-hidden="true" /> Insert below
            </BarButton>
          )}
          {answer && (
            <BarButton onClick={onCopy}>
              <Copy className="size-3.5" aria-hidden="true" /> Copy
            </BarButton>
          )}
          <BarButton onClick={onRetry}>
            <RotateCcw className="size-3.5" aria-hidden="true" /> Try again
          </BarButton>
          {answer && (
            <BarButton onClick={onPanel}>
              <ArrowRightToLine className="size-3.5" aria-hidden="true" /> Continue in panel
            </BarButton>
          )}
          <BarButton onClick={onClose} className="ml-auto">
            Close
          </BarButton>
        </div>
      )}
    </div>
  )
}

function BarButton({ primary, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-sm outline-none transition-colors duration-[140ms] ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-brand",
        primary ? "bg-agent font-[510] text-agent-foreground hover:opacity-90" : "text-ink-2 hover:bg-hover hover:text-ink",
        className,
      )}
    />
  )
}

/** The model's line under the field, where a phone has no room beside it. */
function ModelUnder({ line }: { line: string }) {
  return <p className="truncate bg-[color-mix(in_oklab,var(--agent-muted)_70%,var(--raised))] px-3 pb-2 text-meta text-ink-3">{line}</p>
}
