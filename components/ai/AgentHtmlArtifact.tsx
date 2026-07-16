"use client"

/**
 * AgentHtmlArtifact — renders an AI-generated HTML/JS snippet (a ```html block)
 * as an interactive artifact, the Notion/Claude "artifact" experience but with
 * an enterprise-safe security posture:
 *
 *   - NOTHING runs automatically. The code is shown first; the user must click
 *     "Run" to render the preview, so a message scrolling by never executes
 *     script.
 *   - The preview runs in a STRICTLY sandboxed iframe: sandbox="allow-scripts"
 *     WITHOUT allow-same-origin, so the document has a null origin and cannot
 *     read the parent DOM, cookies, localStorage, or make same-origin calls.
 *     No allow-popups / allow-forms / allow-top-navigation / allow-modals /
 *     allow-downloads — so it can't navigate the app, open windows, submit
 *     forms, or trigger downloads. referrerPolicy=no-referrer.
 *   - Size-capped; oversized artifacts fall back to plain code only.
 *
 * The result is a self-contained, throwaway sandbox: safe to run arbitrary
 * layout/animation/visualization HTML the assistant produces, with zero access
 * to the user's session or the workspace.
 */

import * as React from "react"
import { Play, Code, Eye } from "@/lib/icons"

// Bound the srcDoc so a runaway artifact can't bloat the DOM / memory.
const MAX_ARTIFACT_CHARS = 100_000

const AgentHtmlArtifact: React.FC<{ html: string }> = ({ html }) => {
  const [running, setRunning] = React.useState(false)
  const tooLarge = html.length > MAX_ARTIFACT_CHARS

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-foreground/[0.04] px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Code className="h-3.5 w-3.5" />
          HTML preview
        </span>
        {!tooLarge && (
          <button
            type="button"
            onClick={() => setRunning((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {running ? (
              <>
                <Code className="h-3.5 w-3.5" /> Show code
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Run
              </>
            )}
          </button>
        )}
      </div>

      {running && !tooLarge ? (
        <iframe
          // Null-origin sandbox: scripts run but cannot touch the parent, its
          // cookies/storage, navigate the app, open popups, or submit forms.
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={html}
          title="AI HTML preview"
          className="h-80 w-full bg-white"
        />
      ) : (
        <pre className="max-h-80 overflow-auto p-2.5 text-xs font-mono leading-relaxed">
          <code>{html}</code>
        </pre>
      )}

      {tooLarge && (
        <div className="flex items-center gap-1.5 border-t border-border/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          This preview is too large to run safely — showing the code only.
        </div>
      )}
    </div>
  )
}

export default AgentHtmlArtifact
