"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, RotateCcw, Copy, Check, Type, ArrowLeft, MessageSquarePlus } from "@/lib/icons";
import { Scissors, MousePointer2, Wand2, CornerDownLeft, ArrowRightToLine } from "lucide-react";
import { useDocAI, DocAIAction } from '@/services/aiService';
import { RightPanelHeader } from "@/components/rightPanel/rightPanelHeader";
import { cn } from '@/lib/utils/helpers/cn';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useDispatch } from "react-redux";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { withAI } from "@/components/common/withFeature"
// Types and Config
const ACTION_DETAILS: Record<DocAIAction, { label: string; icon: any; description: string }> = {
  write: {
    label: 'Write',
    icon: Send,
    description: 'Generate fresh content from a prompt'
  },
  rewrite: {
    label: 'Rewrite',
    icon: RotateCcw,
    description: 'Improve clarity, flow, and tone'
  },
  summarize: {
    label: 'Summarize',
    icon: Scissors,
    description: 'Condense into key bullet points'
  },
  expand: {
    label: 'Expand',
    icon: Type,
    description: 'Add more detail and examples'
  },
  fix_grammar: {
    label: 'Fix grammar',
    icon: Wand2,
    description: 'Spelling and style checks'
  },
  shorten: {
    label: 'Shorten',
    icon: MousePointer2,
    description: 'Make it concise and direct'
  }
};

const ACTION_GROUPS = {
  SHORT: ['expand', 'rewrite', 'fix_grammar'] as DocAIAction[],
  LONG: ['summarize', 'shorten', 'fix_grammar'] as DocAIAction[],
  DEFAULT: ['write', 'rewrite', 'summarize', 'expand', 'fix_grammar', 'shorten'] as DocAIAction[]
};

interface DocAIState {
  action: DocAIAction | null;
  history: string[];
  isRefining: boolean;
  hasJustReplaced: boolean; // New state for undo
}

interface DocAiAssistantPanelProps {
  selectedText: string;
  docId: string;
  surroundingContext?: string;
  isSidebar?: boolean;
  onClose?: () => void;
  initialAction?: DocAIAction;
}

const DocAiAssistantPanelUngated: React.FC<DocAiAssistantPanelProps> = ({
  selectedText,
  docId,
  surroundingContext,
  isSidebar,
  onClose,
  initialAction,
}) => {
  const dispatch = useDispatch();

  const handleClosePanel = useCallback(() => {
    if (onClose) {
      onClose();
    } else if (isSidebar) {
      dispatch(closeRightPanel());
    }
  }, [onClose, isSidebar, dispatch]);

  const [state, setState] = useState<DocAIState>({
    action: null,
    history: [],
    isRefining: false,
    hasJustReplaced: false,
  });

  const { completeStream, isStreaming: hookIsStreaming, streamText, streamNotice, error: hookError, cancelStream, resetResult } = useDocAI();
  const [customPrompt, setCustomPrompt] = useState('');
  const [refinePrompt, setRefinePrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Must be declared before useEffect hooks that reference it
  const executeAction = useCallback(async (action: DocAIAction, prompt?: string) => {
    setState(prev => ({ ...prev, action, isRefining: false }));
    // Pass the surrounding document context to enable tone matching and smarter completions
    await completeStream(action, selectedText, docId, prompt, surroundingContext);
  }, [selectedText, docId, completeStream, surroundingContext]);

  // Auto-execute initial action from slash command (desktop + mobile)
  const initialActionRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const action = initialAction
    if (action && initialActionRef.current !== action && !hookIsStreaming && !streamText) {
      initialActionRef.current = action
      executeAction(action)
    }
  }, [initialAction, executeAction, hookIsStreaming, streamText])

  // Listen for mobile drawer initial action events
  useEffect(() => {
    const handler = (e: any) => {
      const action = e.detail?.action as DocAIAction
      if (action && initialActionRef.current !== action && !hookIsStreaming && !streamText) {
        initialActionRef.current = action
        // "Ask AI to write …" from the slash menu carries what was typed.
        executeAction(action, typeof e.detail?.prompt === 'string' ? e.detail.prompt : undefined)
      }
    }
    window.addEventListener('doc-ai-initial-action', handler)
    return () => window.removeEventListener('doc-ai-initial-action', handler)
  }, [executeAction, hookIsStreaming, streamText])

  // Auto-scroll result
  useEffect(() => {
    if (resultRef.current && streamText) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [streamText]);

  // Handle successful completion to push to history
  useEffect(() => {
    if (!hookIsStreaming && streamText && !state.history.includes(streamText)) {
      setState(prev => ({
        ...prev,
        history: [...prev.history, streamText]
      }));
    }
  }, [hookIsStreaming, streamText, state.history]);

  const handleRefine = useCallback(async () => {
    if (!refinePrompt.trim()) return;
    setState(prev => ({ ...prev, isRefining: true }));
    // When refining, we pass the current result as the context/text to iterate on
    // Along with the custom prompt for the refinement instruction
    // Preserve surroundingContext so the LLM maintains document tone awareness
    await completeStream('rewrite', streamText, docId, refinePrompt, surroundingContext);
    setRefinePrompt('');
  }, [refinePrompt, streamText, docId, completeStream, surroundingContext]);

  const handleCancel = useCallback(() => {
    cancelStream();
  }, [cancelStream]);

  const handleBack = useCallback(() => {
    resetResult();
    setState(prev => ({ ...prev, action: null, hasJustReplaced: false }));
  }, [resetResult]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(streamText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [streamText]);

  const handleInsert = useCallback(() => {
    if (streamText) {
      window.dispatchEvent(new CustomEvent('doc-ai-insert', { detail: { text: streamText } }));
      onClose?.();
    }
  }, [streamText, onClose]);

  const handleReplace = useCallback(() => {
    if (streamText) {
      window.dispatchEvent(new CustomEvent('doc-ai-replace', { detail: { text: streamText, originalText: selectedText } }));
      setState(prev => ({ ...prev, hasJustReplaced: true }));
      // Leave the panel open to show the "Undo" option
    }
  }, [streamText, selectedText]);

  const handleUndo = useCallback(() => {
    window.dispatchEvent(new CustomEvent('doc-ai-undo'));
    setState(prev => ({ ...prev, hasJustReplaced: false }));
  }, []);

  const resetState = () => {
    handleCancel();
    resetResult();
    setState({ action: null, history: [], isRefining: false, hasJustReplaced: false });
    setShowPromptInput(false);
    setCustomPrompt('');
    setRefinePrompt('');
  };

  const getActiveActions = () => {
    if (!selectedText) return ACTION_GROUPS.DEFAULT;
    const wordCount = selectedText.split(/\s+/).length;
    if (wordCount < 10) return ACTION_GROUPS.SHORT;
    if (wordCount > 50) return ACTION_GROUPS.LONG;
    return ACTION_GROUPS.DEFAULT;
  };

  return (
    <div className={cn("h-full flex flex-col ", isSidebar && "border-l ")}>
      {/* In the right panel it opens under the panel's one 48px header, as a
          thread, a task or the AI chat do; its own 65px header moved the
          panel's top when it switched from one of them. */}
      {isSidebar && !onClose ? (
        <RightPanelHeader titleKey="ai" title="OneCamp AI" />
      ) : (
      <div className="flex justify-between items-center px-5 py-4 border-b ">
         <div className="flex items-center gap-2 font-medium">
           <Sparkles className="h-4 w-4 text-agent-ink" />
           <span>OneCamp AI</span>
         </div>
         {(isSidebar || onClose) && (
            <Button onClick={handleClosePanel} size="icon" variant="ghost" aria-label={isSidebar && !onClose ? "Collapse panel" : "Close panel"} className={cn("h-8 w-8 text-muted-foreground hover:text-foreground", isSidebar && !onClose && "hidden md:flex")}>
              {isSidebar && !onClose ? <ArrowRightToLine className="h-5 w-5" /> : <X className="h-5 w-5" />}
            </Button>
         )}
      </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-5">
        {selectedText && !streamText && !hookIsStreaming && (
          <div className="mb-4 rounded-[10px] bg-agent-muted p-3">
            <span className="mb-1 block text-meta font-medium text-ink-3">Selected text</span>
            <div className="line-clamp-2 text-ui-sm text-ink-2">{selectedText}</div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!streamText && !hookIsStreaming ? (
            <motion.div
              key="actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="flex flex-col gap-0.5">
                {getActiveActions().map((actionId) => {
                  const details = ACTION_DETAILS[actionId];
                  const Icon = details.icon;
                  return (
                    <Button
                      key={actionId}
                      variant="ghost"
                      onClick={() => executeAction(actionId)}
                      className="group h-11 w-full justify-start gap-3 rounded-lg px-2 text-left hover:bg-hover active:bg-press"
                    >
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-agent-muted text-agent-ink [&_svg]:!text-agent-ink">
                        <Icon className="!size-4" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-ui font-[510] text-ink">{details.label}</span>
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
                    <span className="inline-flex size-7 items-center justify-center"><MessageSquarePlus className="!size-4" /></span>
                    Write your own instruction…
                  </Button>
                ) : (
                    <div className="bg-background p-1">
                    <Textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g., 'Make it sound like a pirate' or 'Convert to a todo list'..."
                      className="field-surface w-full min-h-[100px] rounded-[10px] p-3 text-ui text-ink resize-none outline-none"
                      autoFocus
                    />
                    <div className="flex justify-between items-center mt-3">
                      <Button variant="ghost" onClick={() => setShowPromptInput(false)} className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent">Cancel</Button>
                      <Button
                        onClick={() => executeAction('write', customPrompt)}
                        disabled={!customPrompt.trim()}
                        size="sm"
                      >
                        <Send className="h-3 w-3" />
                        Generate
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {hookIsStreaming && !streamText ? (
                <div className="flex flex-col items-center justify-center py-[60px] gap-4">
                  <Sparkles className="size-6 text-agent-ink animate-pulse" />
                  <span className="text-ui-sm text-ink-3">
                    {state.action === 'write' ? 'Writing…' : 'Thinking…'}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleCancel} className="mt-2">Stop</Button>
                </div>
              ) : (
                <div className="rounded-[12px] bg-raised p-4 shadow-e1">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                       <button
                         onClick={handleBack}
                         className="p-1.5 rounded-lg text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                         title="Back"
                       >
                         <ArrowLeft className="h-3 w-3" />
                       </button>
                       <span className="text-meta font-medium text-agent-ink">Draft</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={handleCopy} className="p-1.5 rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-ink" title="Copy to clipboard">
                        {copied ? <Check className="h-3 w-3 text-success-ink" /> : <Copy className="h-3 w-3" />}
                      </button>
                      <button onClick={resetState} className="p-1.5 rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-ink" title="Start over">
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[350px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar" ref={resultRef}>
                    <div className="text-sm leading-relaxed">
                        <motion.div>
                            {streamText}
                            {hookIsStreaming && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="inline-block w-5 h-4 -ml-2.5 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--agent)_40%,transparent),transparent)] animate-text-shimmer align-middle"
                                />
                            )}
                            {hookIsStreaming && <span className="inline-block w-[2px] h-4 bg-agent ml-0.5 align-middle animate-blink" />}
                        </motion.div>
                    </div>
                  </div>

                  {/* The result came from part of the selection. Shown after streaming
                      finishes, muted, and never styled like hookError above: the action
                      succeeded, and someone about to insert this into their document is
                      entitled to know it did not read all of the input. */}
                  {!hookIsStreaming && streamNotice && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground" role="note">
                      <Scissors size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{streamNotice}</span>
                    </div>
                  )}

                  {!hookIsStreaming && (
                    <motion.div
                      key="refine-and-actions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="field-surface mt-2 overflow-hidden rounded-[10px]">
                        <div className="relative group/input">
                          <Input
                            type="text"
                            value={refinePrompt}
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleRefine()
                                }
                            }}
                            placeholder="Ask for a change, like ‘make it formal’"
                            className="w-full bg-transparent border-none px-3.5 py-2.5 text-foreground text-sm outline-none shadow-none ring-0 focus-visible:ring-0"
                          />
                          <Button
 aria-label="Refine"                            variant="ghost"
                            size="icon"
                            disabled={!refinePrompt.trim()}
                            onClick={handleRefine}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 text-ink-2 hover:bg-hover"
                          >
                            <CornerDownLeft className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                        <div className="flex flex-col gap-2">
                        {state.hasJustReplaced ? (
                          <Button
                            variant="secondary"
                            className="w-full"
                            onClick={handleUndo}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Undo the change
                          </Button>
                        ) : (
                          <Button className="w-full" onClick={handleReplace}>
                            Replace the selection
                          </Button>
                        )}
                        <Button variant="secondary" className="w-full" onClick={handleInsert}>
                          Insert below
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

         {hookError && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] bg-camp-berry-tint p-3 text-camp-berry-ink" role="alert">
            <span className="text-ui-sm">{hookError}</span>
            <Button variant="ghost" onClick={resetState} className="h-auto p-0 text-2xs underline hover:bg-transparent">Dismiss</Button>
          </div>
        )}
      </div>
      </ScrollArea>
    </div>
  );
};
// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, whose backend
// serves no AI routes, and on v2 whenever an admin has switched AI off. Wrapping the
// export covers every place this is rendered, desktop and mobile, rather than asking
// each of them to remember.
export const DocAiAssistantPanel = withAI(DocAiAssistantPanelUngated)
