"use client"

import "./ai.css"
/**
 * A code block in an AI answer (hub.md AI5): the sunken surface at r10 with an
 * inset hairline, mono 12.5/19, the language at the top left and a copy button
 * at the top right.
 */
import * as React from "react"

import { Check, Copy } from "@/lib/icons"

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* the clipboard refused (an insecure origin): nothing to say */
    }
  }
  return (
    <div className="ai-inset group/code relative min-w-0 rounded-[10px] bg-sunken" data-code-block="">
      <div className="flex h-7 items-center justify-between pl-3 pr-1">
        <span className="text-micro font-medium text-ink-3">{language || "code"}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="grid size-6 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-foreground [&_svg]:size-3.5"
        >
          {copied ? <Check /> : <Copy />}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-meta leading-[19px]">
        <code>{code}</code>
      </pre>
    </div>
  )
}
