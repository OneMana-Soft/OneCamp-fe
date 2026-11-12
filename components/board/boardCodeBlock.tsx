"use client"

import * as React from "react"
import "@/components/minimal-tiptap/styles/partials/codeTokens.css"
import { hasWanted, highlightPieces, loadWanted, piecesByLine } from "@/components/minimal-tiptap/extensions/code-block-lowlight/codeHighlight"
import { languageLabel } from "@/components/minimal-tiptap/extensions/code-block-lowlight/languages"
import { copyToClipboard } from "@/hooks/useCopyToClipboard"
import type { CodeBlock } from "@/lib/board/codeBlocks"
import { Check, Copy, Pencil } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { UseHint, type CardPointer } from "./boardEmbeds"

/**
 * A board's code block (miro-17), for members and guests alike: its title and language, its lines numbered and
 * coloured by the docs' own highlighter (codeHighlight.ts, with the docs' token colours, codeTokens.css), and a copy
 * button; on a board the viewer may edit, an Edit button too. It loads on demand (boardExcalidraw's renderEmbeddable), so lowlight stays off the board's first load. It
 * draws only what codeBlockOf made safe, as text: code is never markup.
 */
export function BoardCodeBlock({ block, pointer = null, onEdit }: { block: CodeBlock; pointer?: CardPointer; onEdit?: () => void }) {
  const code = React.useMemo(() => block.code.replace(/\r\n?/g, "\n"), [block.code])
  // A grammar beyond the common set arrives after the first draw; each arrival draws the lines again.
  const [grammars, setGrammars] = React.useState(0)
  const lines = React.useMemo(() => (grammars >= 0 ? piecesByLine(highlightPieces(code, block.language)) : []), [code, block.language, grammars])
  React.useEffect(() => {
    if (!hasWanted()) return
    let live = true
    void loadWanted().then((arrived) => {
      if (live && arrived) setGrammars((n) => n + 1)
    })
    return () => {
      live = false
    }
  }, [lines])

  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const copy = async () => setCopied(await copyToClipboard(block.code))

  const digits = String(lines.length).length
  return (
    <div
      data-board-code=""
      data-card-pointer={pointer ?? undefined}
      role="group"
      aria-label={block.title ? `Code: ${block.title}` : "Code block"}
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-[inherit] border border-line bg-raised text-left shadow-e1 transition-shadow",
        pointer && "ring-2 ring-inset ring-brand",
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate text-body font-[590] text-ink-1">{block.title || "Code"}</span>
        <UseHint pointer={pointer} />
        <span data-code-language="" className="shrink-0 rounded-sm bg-sunken px-1.5 text-meta font-[510] text-ink-2">
          {languageLabel(block.language)}
        </span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit code"
            className="grid size-7 shrink-0 place-items-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="grid size-7 shrink-0 place-items-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-brand"
        >
          {copied ? <Check className="size-4 text-brand-text" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </button>
      </div>
      <pre className="code-tokens min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-5 text-ink-1">
        <code className="block min-w-max">
          {lines.map((pieces, i) => (
            <span key={i} data-code-line="" className="flex">
              <span data-code-n="" aria-hidden className="shrink-0 select-none pr-3 text-right text-ink-3" style={{ width: `${digits + 2}ch` }}>
                {i + 1}
              </span>
              <span data-code-text="" className="whitespace-pre">
                {pieces.map((p, j) =>
                  p.classes.length ? (
                    <span key={j} className={p.classes.join(" ")}>
                      {p.text}
                    </span>
                  ) : (
                    <React.Fragment key={j}>{p.text}</React.Fragment>
                  ),
                )}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
