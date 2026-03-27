import React, { useState, useCallback, useRef, useEffect } from 'react';

// Types
type DocAIAction = 'write' | 'expand' | 'summarize' | 'fix_grammar' | 'shorten' | 'rewrite';

interface DocAIState {
  isOpen: boolean;
  isLoading: boolean;
  result: string;
  error: string | null;
  action: DocAIAction | null;
}

interface DocAiAssistantProps {
  selectedText: string;
  docId: string;
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
  position?: { top: number; left: number };
  onClose: () => void;
}

const ACTION_LABELS: Record<DocAIAction, { label: string; icon: string; description: string }> = {
  write: { label: 'Write', icon: '✍️', description: 'Generate content from a prompt' },
  expand: { label: 'Expand', icon: '📝', description: 'Add more detail and depth' },
  summarize: { label: 'Summarize', icon: '📋', description: 'Condense into key points' },
  fix_grammar: { label: 'Fix Grammar', icon: '✅', description: 'Fix spelling and grammar' },
  shorten: { label: 'Shorten', icon: '✂️', description: 'Make more concise' },
  rewrite: { label: 'Rewrite', icon: '🔄', description: 'Improve clarity and flow' },
};

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

const DocAiAssistant: React.FC<DocAiAssistantProps> = ({
  selectedText,
  docId,
  onInsert,
  onReplace,
  position,
  onClose,
}) => {
  const [state, setState] = useState<DocAIState>({
    isOpen: true,
    isLoading: false,
    result: '',
    error: null,
    action: null,
  });
  const [customPrompt, setCustomPrompt] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Auto-scroll result
  useEffect(() => {
    if (resultRef.current && state.result) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [state.result]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const executeAction = useCallback(async (action: DocAIAction, prompt?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState(prev => ({ ...prev, isLoading: true, result: '', error: null, action }));

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setState(prev => ({ ...prev, isLoading: false, error: 'Not authenticated' }));
        return;
      }
      const response = await fetch(`${API_BASE}/ai/doc/complete/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          action,
          text: selectedText,
          prompt: prompt || '',
          doc_id: docId,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any)?.msg || `AI request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              setState(prev => ({ ...prev, isLoading: false, error: data.error }));
              return;
            }
            if (data.content) {
              const content = data.content
                .replace(/\\n/g, '\n')
                .replace(/\\"/g, '"');
              accumulated += content;
              setState(prev => ({ ...prev, result: accumulated }));
            }
            if (data.done) {
              setState(prev => ({ ...prev, isLoading: false }));
              return;
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      setState(prev => ({ ...prev, isLoading: false }));
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  }, [selectedText, docId]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({ ...prev, isLoading: false }));
  }, []);

  const handleInsert = useCallback(() => {
    if (state.result) {
      onInsert(state.result);
      onClose();
    }
  }, [state.result, onInsert, onClose]);

  const handleReplace = useCallback(() => {
    if (state.result) {
      onReplace(state.result);
      onClose();
    }
  }, [state.result, onReplace, onClose]);

  return (
    <div
      className="doc-ai-assistant"
      style={{
        position: position ? 'fixed' : 'relative',
        top: position?.top,
        left: position?.left,
      }}
    >
      {/* Header */}
      <div className="doc-ai-header">
        <span className="doc-ai-title">✨ AI Assistant</span>
        <button className="doc-ai-close" onClick={onClose} title="Close">×</button>
      </div>

      {/* Action buttons — shown when no result yet */}
      {!state.result && !state.isLoading && (
        <div className="doc-ai-actions">
          {(Object.entries(ACTION_LABELS) as [DocAIAction, typeof ACTION_LABELS[DocAIAction]][]).map(
            ([action, { label, icon, description }]) => (
              <button
                key={action}
                className="doc-ai-action-btn"
                onClick={() => executeAction(action)}
                title={description}
              >
                <span className="doc-ai-action-icon">{icon}</span>
                <span className="doc-ai-action-label">{label}</span>
              </button>
            )
          )}

          {/* Custom prompt */}
          {!showPromptInput ? (
            <button
              className="doc-ai-action-btn doc-ai-custom"
              onClick={() => setShowPromptInput(true)}
            >
              <span className="doc-ai-action-icon">💬</span>
              <span className="doc-ai-action-label">Custom...</span>
            </button>
          ) : (
            <div className="doc-ai-prompt-input">
              <input
                type="text"
                placeholder="Tell AI what to do..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customPrompt.trim()) {
                    executeAction('write', customPrompt);
                  }
                }}
                autoFocus
              />
              <button
                onClick={() => executeAction('write', customPrompt)}
                disabled={!customPrompt.trim()}
              >
                Go
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {state.isLoading && !state.result && (
        <div className="doc-ai-loading">
          <div className="doc-ai-spinner" />
          <span>AI is {state.action === 'write' ? 'writing' : 'thinking'}...</span>
          <button className="doc-ai-cancel" onClick={handleCancel}>Cancel</button>
        </div>
      )}

      {/* Result */}
      {state.result && (
        <div className="doc-ai-result-container">
          <div className="doc-ai-result" ref={resultRef}>
            {state.result}
            {state.isLoading && <span className="doc-ai-cursor">▊</span>}
          </div>
          {!state.isLoading && (
            <div className="doc-ai-result-actions">
              <button className="doc-ai-btn-primary" onClick={handleReplace}>
                Replace
              </button>
              <button className="doc-ai-btn-secondary" onClick={handleInsert}>
                Insert Below
              </button>
              <button className="doc-ai-btn-ghost" onClick={() => {
                setState({ isOpen: true, isLoading: false, result: '', error: null, action: null });
                setShowPromptInput(false);
                setCustomPrompt('');
              }}>
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="doc-ai-error">
          <span>⚠️ {state.error}</span>
          <button onClick={() => setState(prev => ({ ...prev, error: null }))}>Dismiss</button>
        </div>
      )}

      <style jsx>{`
        .doc-ai-assistant {
          width: 320px;
          background: rgba(24, 24, 32, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          overflow: hidden;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          color: #e4e4e7;
        }
        .doc-ai-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .doc-ai-title {
          font-weight: 600;
          font-size: 13px;
        }
        .doc-ai-close {
          background: none;
          border: none;
          color: #71717a;
          font-size: 18px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
        }
        .doc-ai-close:hover { color: #e4e4e7; }
        .doc-ai-actions {
          padding: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .doc-ai-action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          color: #d4d4d8;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.15s;
        }
        .doc-ai-action-btn:hover {
          background: rgba(99, 102, 241, 0.15);
          border-color: rgba(99, 102, 241, 0.3);
          color: #a5b4fc;
        }
        .doc-ai-action-icon { font-size: 14px; }
        .doc-ai-custom { width: 100%; justify-content: center; margin-top: 4px; }
        .doc-ai-prompt-input {
          display: flex;
          gap: 6px;
          width: 100%;
          margin-top: 4px;
        }
        .doc-ai-prompt-input input {
          flex: 1;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #e4e4e7;
          font-size: 12px;
          outline: none;
        }
        .doc-ai-prompt-input input:focus {
          border-color: rgba(99, 102, 241, 0.5);
        }
        .doc-ai-prompt-input button {
          padding: 6px 12px;
          background: #6366f1;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 12px;
          cursor: pointer;
        }
        .doc-ai-prompt-input button:disabled { opacity: 0.4; }
        .doc-ai-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 16px;
          color: #a1a1aa;
          font-size: 12px;
        }
        .doc-ai-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(99, 102, 241, 0.3);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .doc-ai-cancel {
          margin-left: auto;
          background: none;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #a1a1aa;
          padding: 3px 8px;
          font-size: 11px;
          cursor: pointer;
        }
        .doc-ai-result-container { padding: 0 12px 12px; }
        .doc-ai-result {
          max-height: 200px;
          overflow-y: auto;
          padding: 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          color: #d4d4d8;
        }
        .doc-ai-cursor {
          color: #6366f1;
          animation: blink 1s step-end infinite;
        }
        @keyframes blink { 50% { opacity: 0; } }
        .doc-ai-result-actions {
          display: flex;
          gap: 6px;
          margin-top: 8px;
        }
        .doc-ai-btn-primary {
          flex: 1;
          padding: 6px 12px;
          background: #6366f1;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }
        .doc-ai-btn-primary:hover { background: #4f46e5; }
        .doc-ai-btn-secondary {
          flex: 1;
          padding: 6px 12px;
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 8px;
          color: #a5b4fc;
          font-size: 12px;
          cursor: pointer;
        }
        .doc-ai-btn-ghost {
          padding: 6px 12px;
          background: none;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: #71717a;
          font-size: 12px;
          cursor: pointer;
        }
        .doc-ai-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: rgba(239, 68, 68, 0.1);
          border-top: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          font-size: 12px;
        }
        .doc-ai-error button {
          background: none;
          border: none;
          color: #fca5a5;
          cursor: pointer;
          text-decoration: underline;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
};

export default DocAiAssistant;
