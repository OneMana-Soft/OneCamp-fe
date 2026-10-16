"use client";

/**
 * The doc AI panel (docs programme B9; AI edition only): the long
 * conversation's place, beside the doc in the right panel and as the phone's
 * sheet. AI starts at the text, in the bar (DocAiBar.tsx); ⌘⏎ there carries
 * its answer here (docAiStore.ts handToPanel), and the panel goes on from it:
 * refine it, try again, put it in the doc. It runs on the same stream as the
 * bar (lib/ai/docAIStream.ts) and reads the live doc as Markdown.
 *
 * - N17: an answer goes into the doc as Markdown made into blocks, shown as a
 *   change to review (A9's proposals), never as one flat paragraph.
 * - N43: Replace lands on the text the panel was opened on, wherever edits
 *   moved it since (its pin); Accept is one transaction, so ⌘Z undoes it, and
 *   the panel keeps no undo of its own.
 * - N44: Back and Esc stop a stream; Stop shows while words arrive; a notice
 *   belongs to its run; the same action asked twice runs twice; a failed copy
 *   says so; and while the AI setting is still loading the panel holds its
 *   place, so the action it was opened with isn't lost.
 */

import * as React from "react";
import { useDispatch } from "react-redux";
import {
  AlignLeft,
  ArrowLeft,
  ArrowRightToLine,
  Check,
  Copy,
  CornerDownLeft,
  Lightbulb,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Pencil,
  RotateCcw,
  Scissors,
  Sparkles,
  Square,
  SquarePen,
  Type,
  X,
} from "@/lib/icons";
import { RightPanelHeader } from "@/components/rightPanel/rightPanelHeader";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeletonRows";
import MarkdownMessage from "@/components/ai/MarkdownMessage";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { FEATURE_AI, useFeatureState } from "@/hooks/useClientConfig";
import { toast } from "@/hooks/use-toast";
import { busForDoc, editorOf } from "@/components/docEditor/registry/commandBus";
import { isBlankDoc } from "@/components/docEditor/DocBodyLayer";
import {
  DOC_AI_ACTIONS,
  STILL_WRITING_MS,
  modelLine,
  stillWorkingLine,
  typedAction,
  workingLabel,
  type DocAIActionId,
  type DocAIModel,
} from "@/lib/ai/docAIActions";
import { streamDocAI, type DocAIRequest } from "@/lib/ai/docAIStream";
import { getDocAIModel } from "@/lib/ai/docAIApi";
import { applyFromPanel, panelRequest } from "./docAiRun";
import { takePanelHandoff } from "./docAiStore";

/** The panel's actions, as the bar names them. */
const PANEL_ACTIONS: Partial<Record<DocAIActionId, { icon: React.ElementType; description: string }>> = {
  improve: { icon: SquarePen, description: "Clearer, with the same meaning" },
  fix: { icon: Check, description: "Spelling, grammar and punctuation" },
  shorter: { icon: Minimize2, description: "The same points in fewer words" },
  longer: { icon: Maximize2, description: "More detail and examples" },
  simplify: { icon: Type, description: "Plain words, short sentences" },
  explain: { icon: Lightbulb, description: "What it means, in plain words" },
  continue: { icon: Pencil, description: "Goes on from where the text stops" },
  summarize: { icon: AlignLeft, description: "The doc's main points" },
};

const WITH_SELECTION: DocAIActionId[] = ["improve", "fix", "shorter", "longer", "simplify", "explain"];
const AT_CARET: DocAIActionId[] = ["continue", "summarize"];

// The names the old panel and "/" sent, so a tab opened before keeps working.
const LEGACY: Record<string, DocAIActionId> = { rewrite: "improve", fix_grammar: "fix", shorten: "shorter", expand: "longer" };

/** An action asked by name: one the bar knows, or nothing. Pure. */
export function panelActionOf(name: string | undefined): DocAIActionId | undefined {
  if (!name) return undefined;
  const id = (LEGACY[name] ?? name) as DocAIActionId;
  return DOC_AI_ACTIONS[id] && id !== "action_items" ? id : undefined;
}

/** Actions that need words typed with them. */
const needsWords = (a: DocAIActionId) => a === "write" || a === "draft" || a === "edit" || a === "ask";

type Phase = "waiting" | "streaming" | "done" | "error" | "stopped";

interface PanelRun {
  action: DocAIActionId;
  prompt?: string;
  phase: Phase;
  text: string;
  notice: string;
  error: string;
  model: DocAIModel | null;
}

interface DocAiAssistantPanelProps {
  selectedText: string;
  docId: string;
  surroundingContext?: string;
  isSidebar?: boolean;
  onClose?: () => void;
  initialAction?: string;
  /** What was typed with it ("/" then "Ask AI to write …"). */
  initialPrompt?: string;
}

const DocAiAssistantPanelUngated: React.FC<DocAiAssistantPanelProps> = ({
  selectedText,
  docId,
  surroundingContext,
  isSidebar,
  onClose,
  initialAction,
  initialPrompt,
}) => {
  const dispatch = useDispatch();
  const [run, setRun] = React.useState<PanelRun | null>(null);
  const [model, setModel] = React.useState<DocAIModel | null>(null);
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [refinePrompt, setRefinePrompt] = React.useState("");
  const [showPromptInput, setShowPromptInput] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [placed, setPlaced] = React.useState(false);
  const [still, setStill] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const resultRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const editorNow = React.useCallback(() => {
    const e = editorOf(busForDoc(docId));
    return e && !e.isDestroyed ? e : null;
  }, [docId]);

  // What the panel works on: the selection it was opened on, else the caret.
  const hasSelection = !!selectedText.trim();
  const docEmpty = React.useMemo(() => {
    const e = editorNow();
    return !!e && isBlankDoc(e.state.doc);
    // Read when the selection it was opened on changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorNow, selectedText]);

  const close = React.useCallback(() => {
    abortRef.current?.abort();
    if (onClose) onClose();
    else if (isSidebar) dispatch(closeRightPanel());
  }, [onClose, isSidebar, dispatch]);

  // The model, named before anything is sent.
  React.useEffect(() => {
    let current = true;
    getDocAIModel().then(
      (m) => current && setModel((now) => now ?? m),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, []);

  // Leaving stops what is streaming.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const execute = React.useCallback(
    async (action: DocAIActionId, extra: { prompt?: string; previous?: string } = {}) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setPlaced(false);
      setRefinePrompt("");
      setRun({ action, prompt: extra.prompt, phase: "waiting", text: "", notice: "", error: "", model });
      const mine = () => abortRef.current === abort && !abort.signal.aborted;
      let req: DocAIRequest | null = null;
      try {
        req = await panelRequest(docId, action, extra);
      } catch {
        req = null;
      }
      // The doc isn't open here: what the panel was given.
      req ??= {
        action,
        doc_id: docId,
        ...(selectedText ? { text: selectedText } : {}),
        ...(surroundingContext ? { context: surroundingContext } : {}),
        ...(extra.prompt ? { prompt: extra.prompt } : {}),
        ...(extra.previous ? { previous: extra.previous } : {}),
      };
      if (!mine()) return;
      const result = await streamDocAI(
        req,
        {
          onModel: (m) => {
            if (!mine()) return;
            setModel(m);
            setRun((r) => (r ? { ...r, model: m } : r));
          },
          onText: (text) => mine() && setRun((r) => (r ? { ...r, phase: "streaming", text } : r)),
          onNotice: (notice) => mine() && setRun((r) => (r ? { ...r, notice } : r)),
        },
        abort.signal,
      );
      if (abortRef.current !== abort) return;
      setRun((r) =>
        r
          ? {
              ...r,
              phase: result.stopped ? "stopped" : result.error ? "error" : "done",
              text: result.text || r.text,
              notice: result.notice,
              error: result.error,
              model: result.model ?? r.model,
            }
          : r,
      );
    },
    [docId, model, selectedText, surroundingContext],
  );

  // What it is asked: by the props it opened with, then by every ask on its
  // doc's bus while it is open, so the same action asked twice runs twice.
  const [asked, setAsked] = React.useState<{ action?: string; prompt?: string; n: number }>(() => ({
    action: initialAction,
    prompt: initialPrompt,
    n: 0,
  }));
  React.useEffect(() => {
    const bus = busForDoc(docId);
    if (!bus) return;
    return bus.on("aiRun", ({ action, prompt }) => setAsked((a) => ({ action, prompt, n: a.n + 1 })));
  }, [docId]);
  React.useEffect(() => {
    // Each ask brings the keys here (over the doc on a tablet, Esc closes it).
    rootRef.current?.focus({ preventScroll: true });
    const editor = editorNow();
    const handoff = editor ? takePanelHandoff(editor) : undefined;
    const action = panelActionOf(handoff?.action ?? asked.action);
    const prompt = (handoff?.prompt ?? asked.prompt)?.trim() || undefined;
    setShowPromptInput(false);
    setCustomPrompt("");
    if (handoff?.text && action) {
      // The bar's answer: the panel goes on from it.
      abortRef.current?.abort();
      abortRef.current = null;
      if (handoff.model) setModel(handoff.model);
      setRun({ action, prompt, phase: "done", text: handoff.text, notice: "", error: "", model: handoff.model ?? null });
      return;
    }
    if (!action) {
      abortRef.current?.abort();
      setRun(null);
      return;
    }
    if (needsWords(action) && !prompt) {
      abortRef.current?.abort();
      setRun(null);
      setShowPromptInput(true);
      return;
    }
    void execute(action, { prompt });
    // Each ask once; execute reads the props of the moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  // The 8 s "still writing" line before a first word.
  const waiting = run?.phase === "waiting";
  React.useEffect(() => {
    setStill(false);
    if (!waiting) return;
    const t = setTimeout(() => setStill(true), STILL_WRITING_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  // The answer follows its last line as it streams.
  React.useEffect(() => {
    if (resultRef.current && run?.phase === "streaming") resultRef.current.scrollTop = resultRef.current.scrollHeight;
  }, [run?.text, run?.phase]);

  const back = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRun(null);
    setPlaced(false);
    setRefinePrompt("");
  };

  // Stopped with words: they stay, to use or to ask again; with none, back to the actions.
  const stop = () => {
    if (!run?.text) return back();
    abortRef.current?.abort();
    abortRef.current = null;
    setRun((r) => (r ? { ...r, phase: "stopped" } : r));
  };

  const copy = () => {
    if (!run?.text) return;
    navigator.clipboard.writeText(run.text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast({ title: "Couldn't copy: the browser didn't allow it. Select the text and copy it instead.", variant: "destructive" }),
    );
  };

  const runCustom = () => {
    const typed = customPrompt.trim();
    if (!typed) return;
    void execute(typedAction(typed, { hasSelection, docEmpty, askMode: false }), { prompt: typed });
  };

  const refine = () => {
    const text = refinePrompt.trim();
    if (!text || !run?.text) return;
    void execute(run.action, { prompt: text, previous: run.text });
  };

  const place = async (mode: "replace" | "insert") => {
    if (!run?.text) return;
    const answer = await applyFromPanel(docId, run.text, mode, run.action, run.model ?? model);
    if (answer === "gone") {
      toast({ title: "This doc can't be changed here, so nothing was put in it. Copy the answer instead.", variant: "destructive" });
      return;
    }
    if (answer === "same") {
      toast({ title: "That's what the doc already says." });
      return;
    }
    setPlaced(true);
    // On a phone the sheet steps aside, so the change can be reviewed.
    if (onClose) onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    if (run && (run.phase === "waiting" || run.phase === "streaming")) return stop();
    if (run) return back();
    if (showPromptInput) return setShowPromptInput(false);
    close();
  };

  const kind = run ? DOC_AI_ACTIONS[run.action]?.kind : undefined;
  const working = run?.phase === "waiting" || run?.phase === "streaming";
  const line = modelLine(run?.model ?? model);
  const list = hasSelection ? WITH_SELECTION : AT_CARET;
  const canReplace = hasSelection && kind === "transform";

  return (
    <div ref={rootRef} tabIndex={-1} className={cn("flex h-full flex-col outline-none", isSidebar && "border-l")} onKeyDown={onKeyDown} data-doc-ai-panel="">
      {/* In the right panel it opens under the panel's one header, as a
          thread, a task or the AI chat do. */}
      {isSidebar && !onClose ? (
        <RightPanelHeader titleKey="ai" title="OneCamp AI" />
      ) : (
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-agent-ink" />
            <span>OneCamp AI</span>
          </div>
          {(isSidebar || onClose) && (
            <Button onClick={close} size="icon" variant="ghost" aria-label="Close panel" className="size-8 text-ink-3 hover:text-ink">
              <X className="size-5" />
            </Button>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-5">
          {line && (
            <p className="mb-3 truncate text-meta text-ink-3" title={line}>
              {line}
            </p>
          )}

          {selectedText && !run && (
            <div className="mb-4 rounded-[10px] bg-agent-muted p-3">
              <span className="mb-1 block text-meta font-medium text-ink-3">Selected text</span>
              <div className="line-clamp-2 text-ui-sm text-ink-2">{selectedText}</div>
            </div>
          )}

          {!run ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-0.5" role="group" aria-label="Actions">
                {list.map((id) => {
                  const details = PANEL_ACTIONS[id]!;
                  const Icon = details.icon;
                  return (
                    <Button
                      key={id}
                      variant="ghost"
                      onClick={() => void execute(id)}
                      className="group h-11 w-full justify-start gap-3 rounded-lg px-2 text-left hover:bg-hover active:bg-press"
                    >
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-agent-muted text-agent-ink [&_svg]:!text-agent-ink">
                        <Icon className="!size-4" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-ui font-[510] text-ink">{id === "summarize" ? "Summarise this doc" : DOC_AI_ACTIONS[id].label}</span>
                        <span className="truncate text-meta font-normal text-ink-3">{details.description}</span>
                      </span>
                    </Button>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-line pt-3">
                {!showPromptInput ? (
                  <Button
                    variant="ghost"
                    onClick={() => setShowPromptInput(true)}
                    className="h-9 w-full justify-start gap-3 rounded-lg px-2 text-ui-sm text-ink-2 hover:bg-hover hover:text-ink"
                  >
                    <span className="inline-flex size-7 items-center justify-center">
                      <MessageSquarePlus className="!size-4" />
                    </span>
                    {hasSelection ? "Say what to change, or ask about it…" : "Say what to write, or ask about the doc…"}
                  </Button>
                ) : (
                  <div className="p-1">
                    <Textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          runCustom();
                        }
                      }}
                      aria-label={hasSelection ? "What to change, or a question" : "What to write, or a question"}
                      placeholder={hasSelection ? "Make it a table, or ask what it means" : "Draft a rollout checklist, or ask who owns what"}
                      className="field-surface min-h-[100px] w-full resize-none rounded-[10px] p-3 text-ui text-ink outline-none"
                      autoFocus
                    />
                    <div className="mt-3 flex items-center justify-between">
                      <Button variant="ghost" size="sm" onClick={() => setShowPromptInput(false)} className="text-ink-3 hover:text-ink">
                        Cancel
                      </Button>
                      <Button onClick={runCustom} disabled={!customPrompt.trim()} size="sm">
                        <CornerDownLeft className="size-3" />
                        Go
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[12px] bg-raised p-4 shadow-e1" data-doc-ai-panel-run={run.phase}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={back}
                      aria-label="Back to the actions"
                      title="Back (Esc)"
                      className="rounded-lg p-1.5 text-ink-3 outline-none transition-colors duration-[140ms] hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <ArrowLeft className="size-3" />
                    </button>
                    <span
                      className={cn(
                        "truncate text-meta font-medium",
                        working
                          ? "bg-[linear-gradient(90deg,var(--ink-2),var(--agent),var(--ink-2))] bg-[length:200%_100%] bg-clip-text text-transparent animate-text-shimmer motion-reduce:animate-none motion-reduce:text-ink-2"
                          : "text-agent-ink",
                      )}
                      role="status"
                      aria-live="polite"
                    >
                      {working
                        ? run.phase === "waiting" && still
                          ? stillWorkingLine(run.model ?? model)
                          : `${workingLabel(run.action)}…`
                        : DOC_AI_ACTIONS[run.action]?.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {working ? (
                      <Button variant="secondary" size="sm" onClick={stop} title="Stop (Esc)">
                        <Square className="size-3" />
                        Stop
                      </Button>
                    ) : (
                      <>
                        {run.text && (
                          <button
                            type="button"
                            onClick={copy}
                            aria-label="Copy the answer"
                            title="Copy"
                            className="rounded-lg p-1.5 text-ink-3 outline-none transition-colors duration-[140ms] hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {copied ? <Check className="size-3 text-success-ink" /> : <Copy className="size-3" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void execute(run.action, { prompt: run.prompt })}
                          aria-label="Try again"
                          title="Try again"
                          className="rounded-lg p-1.5 text-ink-3 outline-none transition-colors duration-[140ms] hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <RotateCcw className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {run.text ? (
                  <div className="max-h-[350px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar" ref={resultRef}>
                    <div className="text-ui text-ink">
                      <MarkdownMessage content={run.text} />
                      {run.phase === "streaming" && <span className="ml-0.5 inline-block h-4 w-[2px] animate-blink bg-agent align-middle motion-reduce:animate-none" aria-hidden="true" />}
                    </div>
                  </div>
                ) : run.phase === "waiting" ? (
                  <SkeletonRows rows={3} />
                ) : null}

                {run.phase === "error" && run.error && (
                  <p className="mt-2 text-ui-sm text-danger-ink" role="alert">
                    {run.error}
                  </p>
                )}

                {/* The answer came from part of the input: said after it ends,
                    muted, never like an error. */}
                {!working && run.notice && (
                  <div className="mt-2 flex items-start gap-1.5 text-meta text-ink-3" role="note">
                    <Scissors size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{run.notice}</span>
                  </div>
                )}

                {!working && run.text && (
                  <div className="mt-3 space-y-3">
                    <div className="field-surface relative overflow-hidden rounded-[10px]">
                      <Input
                        type="text"
                        value={refinePrompt}
                        onChange={(e) => setRefinePrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            refine();
                          }
                        }}
                        aria-label="Ask for a change to the answer"
                        placeholder="Ask for a change, like ‘make it formal’"
                        className="w-full border-none bg-transparent px-3.5 py-2.5 text-ui-sm text-ink shadow-none outline-none ring-0 focus-visible:ring-0"
                      />
                      <Button
                        aria-label="Change the answer"
                        variant="ghost"
                        size="icon"
                        disabled={!refinePrompt.trim()}
                        onClick={refine}
                        className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 text-ink-2 hover:bg-hover"
                      >
                        <CornerDownLeft className="size-4" />
                      </Button>
                    </div>

                    {placed ? (
                      <p className="flex items-center gap-1.5 text-ui-sm text-ink-2" role="status">
                        <ArrowRightToLine className="size-3.5 shrink-0 text-agent-ink" aria-hidden="true" />
                        It&apos;s in the doc for review: accept or discard it there.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {canReplace && (
                          <Button className="w-full" onClick={() => void place("replace")}>
                            Replace the selection
                          </Button>
                        )}
                        <Button variant={canReplace ? "secondary" : "default"} className="w-full" onClick={() => void place("insert")}>
                          Insert below
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

/**
 * Gated on the AI subsystem (hidden on the AI-free edition and wherever AI is
 * off). While the setting is still loading it holds its place, so the action
 * it was opened with runs once it is known (N44, N18).
 */
export function DocAiAssistantPanel(props: DocAiAssistantPanelProps) {
  const ai = useFeatureState(FEATURE_AI);
  if (ai === "unavailable") return null;
  if (ai === "unknown") {
    return (
      <div className="flex h-full flex-col p-5" role="status" aria-label="Loading the AI panel">
        <SkeletonRows rows={4} />
      </div>
    );
  }
  return <DocAiAssistantPanelUngated {...props} />;
}
