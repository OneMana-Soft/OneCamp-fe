"use client"

import * as React from "react"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CODE_LANGUAGES, MERMAID } from "@/components/minimal-tiptap/extensions/code-block-lowlight/languages"
import { CODE_MAX, type CodeBlock } from "@/lib/board/codeBlocks"

/** "Auto": no language named, so the highlighter guesses, as a doc's code block does. */
const AUTO = "auto"
/** A board draws a code block's text, never a diagram from it: Mermaid stays a doc's. */
const LANGUAGES = CODE_LANGUAGES.filter((l) => l.id !== MERMAID)

/**
 * A board's code block, made or edited (miro-17): its title, its language and its code, in the app's one dialog (a
 * sheet on a phone). Loaded when it opens (boardWorkbench). What it hands back is cleaned when it is laid or changed
 * (lib/board/codeBlocks).
 */
export function CodeBlockDialog({ block, onSave, onClose }: { block: CodeBlock | null; onSave: (block: CodeBlock) => void; onClose: () => void }) {
  const [title, setTitle] = React.useState(block?.title ?? "")
  const [language, setLanguage] = React.useState(block?.language ?? AUTO)
  const [code, setCode] = React.useState(block?.code ?? "")
  const ready = code.trim().length > 0
  const save = () => {
    if (ready) onSave({ code, language: language === AUTO ? null : language, title: title.trim() })
  }

  return (
    <ResponsiveDialog
      title={block ? "Edit code block" : "Add a code block"}
      description="Coloured as a doc's code is, with its lines numbered, for anyone who can see the board."
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!ready} data-save-code-block="">
            {block ? "Save" : "Add code block"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <label className="grid gap-1.5">
            <span className="text-ui-sm font-medium text-ink">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Title" placeholder="handler.ts" />
          </label>
          <div className="grid gap-1.5">
            <span className="text-ui-sm font-medium text-ink" aria-hidden>
              Language
            </span>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Auto</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="grid gap-1.5">
          <span className="text-ui-sm font-medium text-ink">Code</span>
          <Textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={CODE_MAX}
            rows={12}
            aria-label="Code"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="font-mono text-xs leading-5"
          />
        </label>
      </div>
    </ResponsiveDialog>
  )
}
