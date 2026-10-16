"use client"

/**
 * An equation's editor (docs programme B3, editor.md P1-9): its TeX in a
 * field under the equation, the equation drawn as you type in the doc itself
 * (for you alone until it's stored), and what KaTeX can't read said under the
 * field. ↩ stores it (⌘↩ for a block equation, where ↩ starts a new line), and
 * so does Escape or a click elsewhere: nothing typed is lost. On a phone it's
 * a sheet. It loads the first time an equation is edited.
 */

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/CommandList"
import { openFloating } from "@/components/docEditor/technical/floating"
import { isComposingKey } from "@/lib/keys/ime"

export interface MathEditorOptions {
  anchor: HTMLElement
  latex: string
  /** A block equation: several lines, ⌘↩ to finish. */
  display: boolean
  /** Draws the TeX in the doc as it's typed; null puts back what's stored. */
  preview(latex: string | null): void
  /** Stores it (called once, however the editor closes). */
  commit(latex: string): void
}

const mac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

function Editor({ options, close, value }: { options: MathEditorOptions; close: () => void; value: { current: string } }) {
  const [latex, setLatex] = React.useState(options.latex)
  const [error, setError] = React.useState<string | null>(null)
  const field = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const f = field.current
    if (!f) return
    f.focus()
    f.setSelectionRange(f.value.length, f.value.length)
  }, [])

  // The field grows with its lines, up to eight.
  React.useLayoutEffect(() => {
    const f = field.current
    if (!f) return
    f.style.height = "auto"
    f.style.height = `${Math.min(f.scrollHeight, 8 * 20 + 16)}px`
  }, [latex])

  React.useEffect(() => {
    value.current = latex
    options.preview(latex)
    let live = true
    const t = setTimeout(() => {
      void import("./katex").then((k) => live && setError(latex.trim() ? k.mathError(latex, options.display) : null))
    }, 150)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [latex, options, value])

  const done = options.display ? `${mac() ? "⌘" : "Ctrl"} ↩` : "↩"

  return (
    <div className="flex w-[min(92vw,420px)] flex-col gap-2 p-2 max-sm:w-full max-sm:p-3" data-math-editor="">
      <textarea
        ref={field}
        value={latex}
        rows={1}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={options.display ? "Block equation, in TeX" : "Equation, in TeX"}
        aria-describedby="doc-math-error"
        placeholder={options.display ? "\\sum_{i=1}^{n} x_i" : "E = mc^2"}
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={(e) => {
          // An input method's Enter picks its word (Safari's: keyCode 229).
          if (e.key !== "Enter" || isComposingKey(e.nativeEvent)) return
          if (options.display && !(e.metaKey || e.ctrlKey)) return
          if (!options.display && e.shiftKey) return
          e.preventDefault()
          close()
        }}
        className="block w-full resize-none rounded-lg doc-math-field bg-raised px-2.5 py-2 text-xs leading-5 text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:focus-halo"
      />
      <div className="flex min-h-6 items-center gap-2">
        <p id="doc-math-error" role="status" className={cn("min-w-0 flex-1 truncate text-meta", error ? "text-danger-ink" : "text-ink-3")} title={error ?? undefined}>
          {error ? `Can't read this yet: ${error}` : options.display ? "TeX, as in LaTeX. ↩ starts a new line." : "TeX, as in LaTeX."}
        </p>
        <Button size="sm" onClick={close} className="shrink-0">
          Done
          <Kbd className="pointer-coarse:hidden">{done}</Kbd>
        </Button>
      </div>
    </div>
  )
}

/** Opens the editor under an equation; it stores what's typed when it closes. */
export function openMathEditor(options: MathEditorOptions) {
  const value = { current: options.latex }
  return openFloating((close) => <Editor options={options} close={close} value={value} />, {
    anchor: () => (options.anchor.isConnected ? options.anchor.getBoundingClientRect() : null),
    label: options.display ? "Edit the block equation" : "Edit the equation",
    sheetOnPhone: true,
    className: "rounded-xl pop-surface",
    onClose: () => options.commit(value.current),
  })
}
