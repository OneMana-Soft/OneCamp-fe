"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Sparkles, X, Send, RotateCcw, Copy, Check, Scissors, Type, MousePointer2, Wand2, ArrowLeft, CornerDownLeft, MessageSquarePlus } from 'lucide-react';
import { useDocAI, DocAIAction } from '@/services/aiService';
import { cn } from '@/lib/utils/helpers/cn';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

// Types and Config
const ACTION_DETAILS: Record<DocAIAction, { label: string; icon: any; description: string; color: string }> = {
  write: {
    label: 'Write',
    icon: Send,
    description: 'Generate fresh content from a prompt',
    color: 'text-primary'
  },
  rewrite: {
    label: 'Rewrite',
    icon: RotateCcw,
    description: 'Improve clarity, flow, and tone',
    color: 'text-emerald-400'
  },
  summarize: {
    label: 'Summarize',
    icon: Scissors,
    description: 'Condense into key bullet points',
    color: 'text-amber-400'
  },
  expand: {
    label: 'Expand',
    icon: Type,
    description: 'Add more detail and examples',
    color: 'text-pink-400'
  },
  fix_grammar: {
    label: 'Fix Grammar',
    icon: Wand2,
    description: 'Spelling and style checks',
    color: 'text-blue-400'
  },
  shorten: {
    label: 'Shorten',
    icon: MousePointer2,
    description: 'Make it concise and direct',
    color: 'text-slate-400'
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
}

export const DocAiAssistantPanel: React.FC<DocAiAssistantPanelProps> = ({
  selectedText,
  docId,
  surroundingContext,
  isSidebar,
  onClose,
}) => {
  const [state, setState] = useState<DocAIState>({
    action: null,
    history: [],
    isRefining: false,
    hasJustReplaced: false,
  });

  const { completeStream, isStreaming: hookIsStreaming, streamText, error: hookError, cancelStream, resetResult } = useDocAI();
  const [customPrompt, setCustomPrompt] = useState('');
  const [refinePrompt, setRefinePrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

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

  const executeAction = useCallback(async (action: DocAIAction, prompt?: string) => {
    setState(prev => ({ ...prev, action, isRefining: false }));
    // Pass the surrounding document context to enable tone matching and smarter completions
    await completeStream(action, selectedText, docId, prompt, surroundingContext);
  }, [selectedText, docId, completeStream, surroundingContext]);

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
      {!isSidebar && (
        <div className="flex justify-between items-center px-5 py-4 border-b ">
           <div className="flex items-center gap-2 text-primary font-semibold">
             <Sparkles className="h-4 w-4" />
             <span>AI Assistant</span>
           </div>
           {onClose && (
             <Button onClick={onClose} size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground">
               <X className="h-5 w-5" />
             </Button>
           )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-5">
        {selectedText && !streamText && !hookIsStreaming && (
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 mb-5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">Context Selection</span>
            <div className="line-clamp-2 text-xs text-muted-foreground italic">"{selectedText}"</div>
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
              <div className="grid grid-cols-1 gap-2">
                {getActiveActions().map((actionId) => {
                  const details = ACTION_DETAILS[actionId];
                  const Icon = details.icon;
                  return (
                    <Button
                      key={actionId}
                      variant="ghost"
                      onClick={() => executeAction(actionId)}
                      className="group relative h-auto p-4 bg-muted/30 border border-border rounded-2xl text-left transition-all duration-300 ease-in-out hover:bg-muted/50 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-xl dark:hover:shadow-primary/30 overflow-hidden flex flex-row items-center gap-4 active:scale-[0.98] justify-start"
                    >
                      <div className={cn("p-3 rounded-xl bg-muted group-hover:bg-accent/10 transition-colors shrink-0", details.color)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col text-left overflow-hidden">
                        <span className="font-semibold text-sm text-foreground">{details.label}</span>
                        <span className="text-[11px] text-muted-foreground line-clamp-1">{details.description}</span>
                      </div>
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    </Button>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                {!showPromptInput ? (
                  <Button
                    variant="ghost"
                    onClick={() => setShowPromptInput(true)}
                    className="w-full py-6 px-4 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/20 transition-all text-xs flex items-center justify-center gap-2 group"
                  >
                    <MessageSquarePlus className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    Custom Instruction...
                  </Button>
                ) : (
                    <div className="bg-background p-1">
                    <Textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g., 'Make it sound like a pirate' or 'Convert to a todo list'..."
                      className="w-full min-h-[100px] bg-muted/50 border border-border rounded-xl p-3 text-foreground text-[13px] resize-none outline-none transition-colors duration-200 focus:border-primary"
                      autoFocus
                    />
                    <div className="flex justify-between items-center mt-3">
                      <Button variant="ghost" onClick={() => setShowPromptInput(false)} className="h-auto p-0 text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-widest hover:bg-transparent">Cancel</Button>
                      <Button
                        onClick={() => executeAction('write', customPrompt)}
                        disabled={!customPrompt.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold transition-all duration-200 hover:bg-primary/90 hover:scale-105"
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
                  <div className="w-10 h-10 border-[3px] border-primary/10 border-t-primary rounded-full animate-spin" />
                  <span className="text-muted-foreground animate-pulse">
                    AI is {state.action === 'write' ? 'writing' : 'thinking'}...
                  </span>
                  <Button variant="ghost" onClick={handleCancel} className="h-auto p-0 text-[10px] text-muted-foreground hover:text-destructive uppercase tracking-widest mt-4 hover:bg-transparent">Stop Generation</Button>
                </div>
              ) : (
                <div className="bg-muted/10 border border-border rounded-[20px] p-4 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                       <button
                         onClick={handleBack}
                         className="p-1.5 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent/10 hover:text-foreground"
                         title="Go Back"
                       >
                         <ArrowLeft className="h-3 w-3" />
                       </button>
                       <span className="text-[10px] uppercase font-bold text-primary tracking-widest">AI Result</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={handleCopy} className="p-1.5 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent/10 hover:text-foreground" title="Copy to clipboard">
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                      <button onClick={resetState} className="p-1.5 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent/10 hover:text-foreground" title="Reset All">
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <ScrollArea className="max-h-[400px]" ref={resultRef}>
                    <div className="text-sm leading-relaxed  pr-4">
                        <LayoutGroup>
                        <motion.div layout>
                            {streamText}
                            {hookIsStreaming && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="inline-block w-5 h-[1.2em] -ml-2.5 bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.4),transparent)] animate-text-shimmer align-middle"
                            />
                            )}
                            {hookIsStreaming && <span className="inline-block w-[2px] h-[1.2em] bg-primary ml-0.5 align-middle animate-blink" />}
                        </motion.div>
                        </LayoutGroup>
                    </div>
                  </ScrollArea>

                  {!hookIsStreaming && (
                    <motion.div
                      key="refine-and-actions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="bg-muted border border-border rounded-xl overflow-hidden mt-2">
                        <div className="relative group/input">
                          <Input
                            type="text"
                            value={refinePrompt}
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                            placeholder="Ask to refine (e.g., 'Make it formal')..."
                            className="w-full bg-transparent border-none px-3.5 py-2.5 text-foreground text-[13px] outline-none shadow-none ring-0 focus-visible:ring-0"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!refinePrompt.trim()}
                            onClick={handleRefine}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-primary hover:bg-primary/10 transition-colors"
                          >
                            <CornerDownLeft className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                        <div className="flex flex-col gap-2">
                        {state.hasJustReplaced ? (
                          <Button
                            className="w-full h-auto p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl font-semibold text-[13px] flex items-center justify-center transition-all duration-200 hover:bg-destructive/20 hover:border-destructive/40"
                            onClick={handleUndo}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Undo Change
                          </Button>
                        ) : (
                          <Button className="w-full h-auto p-3 bg-primary text-primary-foreground rounded-xl font-semibold text-[13px] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_4px_15px_rgba(var(--primary),0.3)] shadow-lg" onClick={handleReplace}>
                            Replace Selection
                          </Button>
                        )}
                        <Button variant="ghost" className="w-full h-auto p-3 bg-muted text-muted-foreground rounded-xl font-medium text-[13px] transition-all duration-200 hover:bg-accent hover:text-foreground" onClick={handleInsert}>
                          Insert Below
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
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex justify-between items-center text-red-300">
            <span className="text-xs">⚠️ {hookError}</span>
            <Button variant="ghost" onClick={resetState} className="h-auto p-0 text-[10px] underline hover:bg-transparent">Dismiss</Button>
          </div>
        )}
      </div>
      </ScrollArea>
    </div>
  );
};
