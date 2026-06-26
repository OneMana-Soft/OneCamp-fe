"use client"

// BoardAIPanel: a Notion-like floating composer that turns a prompt into a
// diagram. The server returns a validated, laid-out graph; here we convert it
// into editable Excalidraw elements and append them to the scene. The canvas's
// onChange then syncs the new elements into the Yjs document, so collaborators
// watch the diagram appear in real time.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { authedStreamFetch } from "@/lib/utils/streamFetch"
import type { BoardDiagramType, BoardGenerateResult, BoardLaidComponent } from "@/types/board"
import { BOARD_MAX_ELEMENTS } from "@/components/board/boardCanvas"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sparkles, X, Loader2, Workflow, Milestone, Route, Network, Users, Smartphone, Monitor, ChevronDown } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import AiModelPicker from "@/components/ai/AiModelPicker"
import BoardUIStudio from "@/components/board/boardUIStudio"

interface BoardAIPanelProps {
  boardId: string
  api: ExcalidrawImperativeAPI | null
  disabled?: boolean
}

const DIAGRAM_TYPES: { value: BoardDiagramType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "auto", label: "Auto", Icon: Sparkles },
  { value: "flow", label: "Flowchart", Icon: Workflow },
  { value: "roadmap", label: "Roadmap", Icon: Milestone },
  { value: "journey", label: "User journey", Icon: Route },
  { value: "mindmap", label: "Mind map", Icon: Network },
  { value: "orgchart", label: "Org chart", Icon: Users },
  { value: "ui-mobile", label: "Mobile UI", Icon: Smartphone },
  { value: "ui-desktop", label: "Desktop UI", Icon: Monitor },
]

// Per-type placeholder text so the composer guides the user.
const PROMPT_PLACEHOLDERS: Partial<Record<BoardDiagramType, string>> = {
  auto: "e.g. Onboarding flow for a new SaaS user, or a mind map of our 2026 strategy",
  flow: "e.g. Onboarding flow for a new SaaS user, from signup to first value",
  roadmap: "e.g. Q1-Q3 roadmap for a payments product",
  journey: "e.g. Shopper journey from discovery to checkout",
  mindmap: "e.g. Mind map of our 2026 marketing strategy",
  orgchart: "e.g. Org chart for a 30-person startup",
  "ui-mobile": "e.g. Mobile food-delivery app: home, restaurant, and checkout screens",
  "ui-desktop": "e.g. Desktop SaaS dashboard with sidebar, KPIs, and a data table",
}

// Friendly labels for the streamed generation stages (Detailed mode runs
// several model calls, so we narrate each step instead of a bare spinner).
const STAGE_LABELS: Record<string, string> = {
  understanding: "Understanding your request",
  designing: "Designing the screen",
  planning: "Planning the structure",
  expanding: "Adding depth and detail",
  drafting: "Drafting the diagram",
  "laying out": "Laying it out",
}

// UI component styling, keyed by the backend role (+ variant for text/button).
// Uses a cohesive modern palette (indigo accent, sky media, violet avatars) so
// generated mockups read as real, colourful product UI rather than grey
// wireframes. Excalidraw fills are solid colours, so we use light tints that
// keep dark labels readable while still adding colour.
const UI_INDIGO = "#4263eb"
const UI_INDIGO_SOFT = "#edf2ff"
const UI_INDIGO_LINE = "#bac8ff"

// Shared modern-rendering defaults for AI-generated diagrams.
// - DIAGRAM_FONT 2 is Excalidraw's normal sans; the editor default is a
//   hand-drawn font that makes generated output look like a rough sketch.
// - Graph nodes use a soft fill + coordinated darker stroke, shape-coded by
//   flowchart convention (green start/end, amber decision, blue step), drawn
//   solid with roughness 0 and rounded corners for a clean, production look.
const DIAGRAM_FONT = 2
const GRAPH_STYLE: Record<string, { fill: string; stroke: string }> = {
  ellipse: { fill: "#d3f9d8", stroke: "#2f9e44" },
  diamond: { fill: "#ffec99", stroke: "#f08c00" },
  rectangle: { fill: "#d0ebff", stroke: "#1c7ed6" },
}
const EDGE_STROKE = "#868e96"

function uiComponentSkeleton(c: BoardLaidComponent): Record<string, unknown> | null {
  const base = { x: c.x, y: c.y, width: c.w, height: c.h, roughness: 0 as const }
  switch (c.role) {
    case "navbar":
      return { ...base, type: "rectangle", backgroundColor: UI_INDIGO_SOFT, strokeColor: UI_INDIGO_LINE, fillStyle: "solid", roundness: null }
    case "bar":
      return { ...base, type: "rectangle", backgroundColor: UI_INDIGO_SOFT, strokeColor: UI_INDIGO_LINE, fillStyle: "solid", roundness: null }
    case "card":
      return { ...base, type: "rectangle", backgroundColor: "#ffffff", strokeColor: "#e3e8ef", fillStyle: "solid", roundness: { type: 3 } }
    case "input":
      return { ...base, type: "rectangle", backgroundColor: "#ffffff", strokeColor: "#ced4da", fillStyle: "solid", roundness: { type: 3 } }
    case "image":
      return {
        ...base, type: "rectangle", backgroundColor: "#d0ebff", strokeColor: "#a5d8ff", fillStyle: "solid", roundness: { type: 3 },
        label: { text: c.text || "Image", fontSize: 16, fontFamily: DIAGRAM_FONT, strokeColor: "#1971c2" },
      }
    case "avatar":
      return { ...base, type: "ellipse", backgroundColor: "#d0bfff", strokeColor: "#b197fc", fillStyle: "solid" }
    case "divider":
      return { type: "line", x: c.x, y: c.y, width: c.w, height: 0, strokeColor: "#dee2e6", points: [[0, 0], [c.w, 0]] }
    case "button": {
      const primary = c.variant !== "secondary"
      return {
        ...base, type: "rectangle",
        backgroundColor: primary ? UI_INDIGO : "transparent",
        strokeColor: UI_INDIGO,
        fillStyle: "solid", roundness: { type: 3 },
        label: { text: c.text || "Button", fontSize: 16, fontFamily: DIAGRAM_FONT, strokeColor: primary ? "#ffffff" : UI_INDIGO },
      }
    }
    case "text": {
      const variant = c.variant || "body"
      const styles: Record<string, { fontSize: number; color: string }> = {
        heading: { fontSize: 28, color: "#1e1e2e" },
        subheading: { fontSize: 20, color: "#343a40" },
        title: { fontSize: 20, color: "#2b2b40" },
        body: { fontSize: 16, color: "#495057" },
        label: { fontSize: 14, color: "#495057" },
        placeholder: { fontSize: 16, color: "#adb5bd" },
        link: { fontSize: 16, color: UI_INDIGO },
        tab: { fontSize: 12, color: "#5c7cfa" },
      }
      const s = styles[variant] || styles.body
      return {
        type: "text", x: c.x, y: c.y, text: c.text || "", fontSize: s.fontSize, fontFamily: DIAGRAM_FONT, strokeColor: s.color,
        textAlign: variant === "tab" ? "center" : "left",
      }
    }
    default:
      return { ...base, type: "rectangle", backgroundColor: "#ffffff", strokeColor: "#e3e8ef", fillStyle: "solid", roundness: { type: 3 } }
  }
}

export function BoardAIPanel({ boardId, api, disabled }: BoardAIPanelProps) {
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<"compose" | "refine">("compose")
  const [prompt, setPrompt] = React.useState("")
  const [type, setType] = React.useState<BoardDiagramType>("auto")
  const [detailed, setDetailed] = React.useState(false)
  const [showTypes, setShowTypes] = React.useState(false)
  const [studioOpen, setStudioOpen] = React.useState(false)
  const [studioPrompt, setStudioPrompt] = React.useState("")
  const [studioDevice, setStudioDevice] = React.useState<"mobile" | "desktop">("mobile")
  const [error, setError] = React.useState<string | null>(null)
  const [refinePrompt, setRefinePrompt] = React.useState("")
  const [refineError, setRefineError] = React.useState<string | null>(null)
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [stage, setStage] = React.useState<string | null>(null)
  const streamAbortRef = React.useRef<AbortController | null>(null)
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  // The last AI graph rendered this session: its generation id (namespaces the
  // element ids it produced), the source graph (sent back on refine), the exact
  // set of element ids it created (so refine can remove them), and the x-offset
  // it was placed at (so a refined diagram lands in the same spot).
  const lastGenRef = React.useRef<{
    genId: string
    graph: BoardGenerateResult
    elementIds: Set<string>
    offsetX: number
  } | null>(null)

  React.useEffect(() => {
    if (open && mode === "compose") textareaRef.current?.focus()
  }, [open, mode])

  const newGenId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `g${Date.now()}`

  // Convert the laid-out graph into Excalidraw elements and add them to the
  // scene. On a fresh generation new content is offset to the right of existing
  // content; on a refine (opts.replaceGenId) the previous AI elements are marked
  // deleted and the refined diagram is placed at the same offset, so it reads as
  // an in-place edit. Graph nodes/arrows use stable, generation-namespaced ids
  // so refine can find and replace exactly what it produced.
  const renderGraph = React.useCallback(
    async (graph: BoardGenerateResult, opts?: { replaceGenId?: string; offsetX?: number }) => {
      if (!api) return
      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw")

      const isUI = !!(graph.components && graph.components.length > 0)
      const genId = newGenId()

      // Start from the current scene. On refine, mark the previous AI elements
      // deleted so the replacement supersedes them (and they sync as removed).
      const scene = api.getSceneElementsIncludingDeleted()
      const prevIds = opts?.replaceGenId && lastGenRef.current ? lastGenRef.current.elementIds : null
      const existing = prevIds
        ? scene.map((e) => (prevIds.has(e.id) ? { ...e, isDeleted: true } : e))
        : scene

      // Offset: reuse the prior position on refine; else place to the right of
      // all live content so a repeat generation never lands on top.
      let offsetX = opts?.offsetX ?? 0
      let liveCount = 0
      {
        let maxX = -Infinity
        for (const e of existing) {
          if (e.isDeleted) continue
          liveCount++
          const right = e.x + (e.width || 0)
          if (right > maxX) maxX = right
        }
        if (opts?.offsetX === undefined && Number.isFinite(maxX)) offsetX = maxX + 120
      }

      const skeletons: Record<string, unknown>[] = []

      // UI mockup mode: device frame(s) + positioned UI components.
      if (isUI) {
        for (const f of graph.frames || []) {
          skeletons.push({
            type: "rectangle",
            x: f.x + offsetX,
            y: f.y,
            width: f.w,
            height: f.h,
            backgroundColor: "#ffffff",
            strokeColor: "#dee2e6",
            fillStyle: "solid",
            roughness: 0,
            roundness: { type: 3 },
          })
        }
        for (const c of graph.components || []) {
          const sk = uiComponentSkeleton({ ...c, x: c.x + offsetX })
          if (sk) skeletons.push(sk)
        }
      } else {
        // Graph mode: nodes (containers with labels) + bound arrows. Stable ids
        // (genId-namespaced) let refine target them; clean fills + non-sketchy
        // edges + shape-coded colours give a modern, production-quality look.
        const isMindmap = graph.type === "mindmap"
        const eid = (nodeId: string) => `${genId}__${nodeId}`
        const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
        for (const n of graph.nodes) {
          const style = GRAPH_STYLE[n.shape] || GRAPH_STYLE.rectangle
          skeletons.push({
            type: n.shape,
            id: eid(n.id),
            x: n.x + offsetX,
            y: n.y,
            width: n.w,
            height: n.h,
            backgroundColor: style.fill,
            strokeColor: style.stroke,
            fillStyle: "solid",
            roughness: 0,
            strokeWidth: 1.5,
            roundness: n.shape === "rectangle" ? { type: 3 } : null,
            label: { text: n.label, fontSize: 16, fontFamily: DIAGRAM_FONT, strokeColor: "#1f2933" },
          })
        }
        graph.edges.forEach((e, i) => {
          const from = nodeById.get(e.from)
          const to = nodeById.get(e.to)
          const arrow: Record<string, unknown> = {
            type: "arrow",
            id: `${genId}__edge${i}`,
            x: 0,
            y: 0,
            start: { id: eid(e.from) },
            end: { id: eid(e.to) },
            strokeColor: EDGE_STROKE,
            strokeWidth: 1.5,
            roughness: 0,
            ...(isMindmap ? { endArrowhead: null } : {}),
            ...(e.label ? { label: { text: e.label, fontSize: 12, fontFamily: DIAGRAM_FONT } } : {}),
          }
          if (from && to) {
            const ax = from.x + offsetX + from.w / 2
            const ay = from.y + from.h / 2
            const bx = to.x + offsetX + to.w / 2
            const by = to.y + to.h / 2
            arrow.x = ax
            arrow.y = ay
            arrow.points = [
              [0, 0],
              [bx - ax, by - ay],
            ]
          }
          skeletons.push(arrow)
        })
      }

      // Keep node ids stable for graph mode (so refine can match); UI mockups
      // have no ids to preserve, so regenerate to avoid any collision.
      const generated = convertToExcalidrawElements(skeletons as never, { regenerateIds: isUI })
      if (!generated.length) {
        const msg = "The diagram came back empty. Try rephrasing your prompt."
        if (opts?.replaceGenId) setRefineError(msg)
        else setError(msg)
        return
      }

      // Hard cap: never push the board past its element limit.
      if (liveCount + generated.length > BOARD_MAX_ELEMENTS) {
        const message = `This board is near its ${BOARD_MAX_ELEMENTS}-element limit, so the diagram was not added. Remove some elements or start a new board, then try again.`
        if (opts?.replaceGenId) setRefineError(message)
        else setError(message)
        toast({ title: "Board is full", description: message, variant: "destructive" })
        return
      }

      api.updateScene({ elements: [...existing, ...generated] as never })
      try {
        api.scrollToContent(generated as never, { fitToContent: true, animate: true })
      } catch {
        // Non-fatal: scene already updated.
      }

      // Track this generation so it can be refined (graph mode only; UI mockups
      // are edited in the design studio).
      if (!isUI) {
        lastGenRef.current = {
          genId,
          graph,
          elementIds: new Set(generated.map((e) => e.id)),
          offsetX,
        }
        setMode("refine")
        setOpen(true)
        setRefinePrompt("")
        setRefineError(null)
      } else {
        setOpen(false)
      }
      setPrompt("")

      const verb = opts?.replaceGenId ? "Updated" : "Added to"
      toast({ title: `${verb} board`, description: `${generated.length} elements.` })
    },
    [api, toast],
  )

  const handleGenerate = React.useCallback(() => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError("Describe what you want to draw.")
      return
    }
    if (isStreaming || isSubmitting) return
    setError(null)

    // UI screens go to the high-fidelity AI UI Designer (HTML/Tailwind,
    // exportable to PNG/HTML/Figma/Canva), not the low-fi Excalidraw mockup.
    if (type === "ui-mobile" || type === "ui-desktop") {
      setStudioDevice(type === "ui-mobile" ? "mobile" : "desktop")
      setStudioPrompt(trimmed)
      setStudioOpen(true)
      setOpen(false)
      return
    }

    if (!api) return

    // Stream the generation so the user watches the pipeline progress
    // (understanding -> planning -> expanding -> laying out) instead of a bare
    // spinner. The final "result" frame carries the laid-out graph.
    setIsStreaming(true)
    setStage(null)
    streamAbortRef.current = new AbortController()

    void (async () => {
      let finalResult: BoardGenerateResult | null = null
      let streamErr: string | null = null
      try {
        const res = await authedStreamFetch(PostEndpointUrl.GenerateBoardDiagramStream, {
          jsonBody: { board_uuid: boardId, prompt: trimmed, type, detailed },
          signal: streamAbortRef.current!.signal,
        })
        if (!res.ok || !res.body) throw new Error(`request failed: ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || "" // keep any partial trailing line
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.stage) setStage(String(data.stage))
              if (data.error) streamErr = String(data.error)
              if (data.result) finalResult = data.result as BoardGenerateResult
            } catch {
              // skip malformed frame
            }
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        streamErr = "Generation failed. Please try again in a moment."
      } finally {
        setIsStreaming(false)
        setStage(null)
      }

      if (streamErr) {
        setError(streamErr)
        return
      }
      const hasGraph = finalResult && Array.isArray(finalResult.nodes) && finalResult.nodes.length > 0
      const hasUI = finalResult && Array.isArray(finalResult.components) && finalResult.components.length > 0
      if (finalResult && (hasGraph || hasUI)) {
        void renderGraph(finalResult)
      } else {
        setError("The AI could not produce a result. Try rephrasing.")
      }
    })()
  }, [prompt, type, detailed, isStreaming, isSubmitting, api, boardId, renderGraph])

  // Abort an in-flight stream on unmount.
  React.useEffect(() => {
    return () => streamAbortRef.current?.abort()
  }, [])

  // Apply a natural-language change to the last generated diagram, replacing it
  // in place. The current graph is sent so the model edits rather than starts
  // over; the response replaces the previous AI elements on the canvas.
  const runRefine = React.useCallback(
    (instruction: string) => {
      const lg = lastGenRef.current
      const trimmed = instruction.trim()
      if (!lg || !api || !trimmed || isSubmitting) return
      setRefineError(null)
      makeRequest<
        {
          board_uuid: string
          instruction: string
          type: string
          title: string
          nodes: { id: string; label: string; shape: string }[]
          edges: { from: string; to: string; label: string }[]
        },
        BoardGenerateResult
      >({
        apiEndpoint: PostEndpointUrl.RefineBoardDiagram,
        payload: {
          board_uuid: boardId,
          instruction: trimmed,
          type: lg.graph.type,
          title: lg.graph.title,
          nodes: lg.graph.nodes.map((n) => ({ id: n.id, label: n.label, shape: n.shape })),
          edges: lg.graph.edges.map((e) => ({ from: e.from, to: e.to, label: e.label || "" })),
        },
      })
        .then((res) => {
          if (res && Array.isArray(res.nodes) && res.nodes.length > 0) {
            void renderGraph(res, { replaceGenId: lg.genId, offsetX: lg.offsetX })
          } else {
            setRefineError("The AI could not apply that change. Try rephrasing.")
          }
        })
        .catch(() => setRefineError("Refine failed. Please try again in a moment."))
    },
    [api, boardId, makeRequest, renderGraph, isSubmitting],
  )

  const handleRefine = React.useCallback(() => {
    const trimmed = refinePrompt.trim()
    if (!trimmed) {
      setRefineError("Describe the change you want.")
      return
    }
    runRefine(trimmed)
  }, [refinePrompt, runRefine])

  // One-click "go deeper": expand every node into concrete sub-steps and add
  // missing decisions / edge cases. This is the step-by-step depth-building loop.
  const handleDeepen = React.useCallback(() => {
    runRefine(
      "Expand this diagram with more depth: break each step into concrete sub-steps and add any missing decision points, edge cases, error handling, and edge labels. Keep the existing structure and ids.",
    )
  }, [runRefine])

  const startNewDiagram = React.useCallback(() => {
    lastGenRef.current = null
    setMode("compose")
    setRefinePrompt("")
    setRefineError(null)
    setPrompt("")
    setError(null)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleGenerate()
    }
    if (e.key === "Escape") {
      setOpen(false)
    }
  }

  if (disabled) return null

  return (
    <>
      <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
        {open ? (
        <div className="pointer-events-auto w-[min(92vw,30rem)] rounded-xl border bg-popover/95 p-3 shadow-xl backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>{mode === "refine" ? "Refine diagram" : "Generate with AI"}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* AI decides the diagram type by default; the picker is optional and
              collapsed so the common path is just "describe it and generate". */}
          {mode === "compose" && (
            <>
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowTypes((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={showTypes}
            >
              <Sparkles className="h-3 w-3 text-primary" />
              {type === "auto"
                ? "Auto · AI picks the best type"
                : `Type: ${DIAGRAM_TYPES.find((t) => t.value === type)?.label ?? "Auto"}`}
              <ChevronDown className={cn("h-3 w-3 transition-transform", showTypes && "rotate-180")} />
            </button>

            {showTypes && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DIAGRAM_TYPES.map((t) => {
                  const selected = type === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      aria-pressed={selected}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                        selected
                          ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                          : "border-border/70 bg-background/50 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <t.Icon className="h-3.5 w-3.5 shrink-0" />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Depth: Quick is one pass; Detailed runs a plan -> expand pipeline
              for a deeper, real-world diagram (slower). */}
          <div className="mb-2 flex items-center gap-1.5">
            {([
              { v: false, label: "Quick" },
              { v: true, label: "Detailed" },
            ] as const).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setDetailed(opt.v)}
                aria-pressed={detailed === opt.v}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  detailed === opt.v
                    ? "border-transparent bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
            <span className="text-[11px] text-muted-foreground">
              {detailed ? "Plans, then expands for depth" : "Fast single pass"}
            </span>
          </div>

          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={handleKeyDown}
            placeholder={PROMPT_PLACEHOLDERS[type] || "Describe what you want to draw..."}
            className="min-h-[72px] resize-none text-sm"
            maxLength={2000}
            disabled={isStreaming}
          />

          {error && (
            <p className="mt-1.5 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <AiModelPicker />
              <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
                {isStreaming
                  ? `${STAGE_LABELS[stage || ""] || "Working"}…`
                  : api
                    ? detailed
                      ? "Detailed takes longer"
                      : "Cmd/Ctrl + Enter"
                    : "Connecting..."}
              </span>
            </div>
            <Button size="sm" onClick={handleGenerate} disabled={isStreaming || !api} className="shrink-0 gap-1.5">
              {isStreaming ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {STAGE_LABELS[stage || ""] || "Generating"}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate
                </>
              )}
            </Button>
          </div>
            </>
          )}

          {mode === "refine" && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Tell AI how to change the diagram, or go deeper. Each change updates it in place.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleDeepen}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
                >
                  <Network className="h-3.5 w-3.5" /> Go deeper
                </button>
              </div>
              <Textarea
                ref={textareaRef}
                value={refinePrompt}
                onChange={(e) => {
                  setRefinePrompt(e.target.value)
                  if (refineError) setRefineError(null)
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault()
                    handleRefine()
                  }
                  if (e.key === "Escape") setOpen(false)
                }}
                placeholder="e.g. add a payment-failed branch, or rename the first step"
                className="min-h-[64px] resize-none text-sm"
                maxLength={2000}
                disabled={isSubmitting}
              />
              {refineError && (
                <p className="text-xs text-destructive" role="alert">
                  {refineError}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={startNewDiagram} disabled={isSubmitting} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> New diagram
                </Button>
                <Button size="sm" onClick={handleRefine} disabled={isSubmitting || !api} className="shrink-0 gap-1.5">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Applying
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Apply change
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className="pointer-events-auto gap-1.5 rounded-full shadow-lg"
          size="sm"
        >
          <Sparkles className="h-4 w-4" />
          Ask AI
        </Button>
      )}
      </div>

      <BoardUIStudio
        boardId={boardId}
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        initialPrompt={studioPrompt}
        initialDevice={studioDevice}
      />
    </>
  )
}

export default BoardAIPanel
